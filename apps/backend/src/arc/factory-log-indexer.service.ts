import { getDb } from "@clawdex/shared";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  arc,
  ARC_CHAIN_ID,
  DEFAULT_LOOKBACK_BLOCKS,
  LAUNCHPAD_SOURCES,
  USDC,
  type LaunchpadSource,
} from "./config";

const DEFAULT_CHUNK_BLOCKS = 9_999n; // public RPC rejects eth_getLogs ranges of 10k+
const DEFAULT_MAX_BLOCKS_PER_RUN = 50_000n;

function parsePositiveBigInt(value: string | undefined, fallback: bigint) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`Expected a positive integer, received "${value}"`);
  }
  return BigInt(value);
}

function isRangeLimitError(error: unknown): boolean {
  let detail = "";
  if (error instanceof Error) {
    detail = `${error.message} ${"details" in error ? String(error.details) : ""}`;
  } else {
    detail = String(error);
  }
  // Arc's public RPC also says "range too large" when a filter has >20 addresses —
  // callers batch addresses to 20 so this only ever means a real range/result cap.
  return /range too large|block range|too many results|query returned more than|max results|max allowed range|exceeded the size limit/i.test(
    detail,
  );
}

export async function scanBlockRange<T>(
  fromBlock: bigint,
  toBlock: bigint,
  preferredChunkSize: bigint,
  fetchRange: (from: bigint, to: bigint) => Promise<T[]>,
): Promise<T[]> {
  if (fromBlock < 0n || toBlock < fromBlock) {
    throw new RangeError("Invalid inclusive block range");
  }
  if (preferredChunkSize < 1n) {
    throw new RangeError("Chunk size must be positive");
  }

  const results: T[] = [];
  let cursor = fromBlock;
  let chunkSize = preferredChunkSize;

  while (cursor <= toBlock) {
    const end =
      cursor + chunkSize - 1n > toBlock ? toBlock : cursor + chunkSize - 1n;

    try {
      results.push(...(await fetchRange(cursor, end)));
      cursor = end + 1n;
    } catch (error) {
      if (!isRangeLimitError(error) || chunkSize === 1n) throw error;
      chunkSize = chunkSize / 2n || 1n;
    }
  }

  return results;
}

/** A TokenCreated log after viem has decoded it against the source's event ABI. */
export interface DecodedLaunchLog {
  args: {
    token?: Address;
    creator?: Address;
    name?: string;
    symbol?: string;
    poolId?: Hex;
    curve?: Address;
    uri?: string;
    link1?: string;
    link2?: string;
    link3?: string;
  };
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number | null;
  topics: readonly Hex[];
  data: Hex;
}

export interface Launch {
  token: string;
  creator: string;
  name: string;
  symbol: string;
  /** v4 poolId (Argus) or bonding-curve contract (Tolly), lowercase. */
  poolRef: string;
  uri: string | null;
  /** Non-empty website / social links from the launch event. */
  links: string[];
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
}

export function toLaunch(log: DecodedLaunchLog): Launch | null {
  const { token, creator, name, symbol, poolId, curve, uri, link1, link2, link3 } = log.args;
  const poolRef = poolId ?? curve;
  if (
    !token ||
    !creator ||
    !poolRef ||
    log.blockNumber === null ||
    log.transactionHash === null ||
    log.logIndex === null
  ) {
    return null;
  }
  return {
    token: token.toLowerCase(),
    creator: creator.toLowerCase(),
    name: name ?? "",
    symbol: symbol ?? "",
    poolRef: poolRef.toLowerCase(),
    uri: uri ? uri : null,
    links: [link1, link2, link3].filter((l): l is string => !!l && l.trim() !== ""),
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  };
}

export class FactoryLogIndexerService {
  private readonly client: PublicClient;
  private readonly preferredChunkSize: bigint;
  private readonly maxBlocksPerRun: bigint;

  constructor(client?: PublicClient) {
    this.client =
      client ??
      createPublicClient({
        chain: arc,
        transport: http(
          process.env.ARC_RPC_URL ?? "https://rpc.mainnet.arc.io",
          { timeout: 20_000, retryCount: 3, retryDelay: 1_500 },
        ),
      });
    this.preferredChunkSize = parsePositiveBigInt(
      process.env.LOG_CHUNK_BLOCKS,
      DEFAULT_CHUNK_BLOCKS,
    );
    this.maxBlocksPerRun = parsePositiveBigInt(
      process.env.ARC_MAX_BLOCKS_PER_RUN,
      DEFAULT_MAX_BLOCKS_PER_RUN,
    );
  }

  /** One tick across every launchpad. A failing source doesn't block the others. */
  async indexLaunchpadsOnce() {
    const [chainId, head] = await Promise.all([
      this.client.getChainId(),
      this.client.getBlockNumber(),
    ]);
    if (chainId !== ARC_CHAIN_ID) {
      throw new Error(
        `Configured RPC returned chain ID ${chainId}; expected ${ARC_CHAIN_ID}`,
      );
    }

    const sources: Array<Record<string, unknown>> = [];
    for (const source of LAUNCHPAD_SOURCES) {
      try {
        sources.push(await this.indexSource(source, head));
      } catch (err) {
        console.error(
          `[arc] ${source.id} indexing failed: ${(err as Error).message}`,
        );
        sources.push({ source: source.id, error: (err as Error).message });
      }
    }
    return { head: head.toString(), sources };
  }

  private startBlockFor(source: LaunchpadSource, head: bigint): bigint {
    const configured = process.env.ARC_INDEX_START_BLOCK;
    if (configured) return parsePositiveBigInt(configured, source.deployBlock);
    const recent =
      head > DEFAULT_LOOKBACK_BLOCKS ? head - DEFAULT_LOOKBACK_BLOCKS : 0n;
    return recent > source.deployBlock ? recent : source.deployBlock;
  }

  private async indexSource(source: LaunchpadSource, head: bigint) {
    const db = getDb();
    const cursorKey = `${source.id}:factory`;
    const cursor = await db.arcIndexerCursor.findUnique({
      where: { source: cursorKey },
    });
    const fromBlock = cursor
      ? cursor.lastBlock + 1n
      : this.startBlockFor(source, head);

    if (fromBlock > head) {
      return {
        source: source.id,
        scannedFrom: null,
        scannedTo: null,
        newLaunches: 0,
      };
    }

    const toBlock =
      fromBlock + this.maxBlocksPerRun - 1n > head
        ? head
        : fromBlock + this.maxBlocksPerRun - 1n;
    const logs = (await scanBlockRange(
      fromBlock,
      toBlock,
      this.preferredChunkSize,
      (from, to) =>
        this.client.getLogs({
          address: source.factory,
          event: source.event,
          fromBlock: from,
          toBlock: to,
        }),
    )) as unknown as DecodedLaunchLog[];

    const launches = logs.map(toLaunch).filter((l): l is Launch => l !== null);
    const [supplies, timestamps] = await Promise.all([
      this.readSupplies(launches.map((l) => l.token as Address)),
      this.readBlockTimes([...new Set(launches.map((l) => l.blockNumber))]),
    ]);

    await db.$transaction(async (tx) => {
      const rawLogs = logs.filter(
        (log) => log.transactionHash !== null && log.logIndex !== null,
      );
      if (rawLogs.length > 0) {
        await tx.arcFactoryLog.createMany({
          data: rawLogs.map((log) => ({
            factoryAddress: source.factory.toLowerCase(),
            topic0: log.topics[0] ?? "0x",
            topics: log.topics.map(String),
            data: log.data,
            blockNumber: log.blockNumber ?? 0n,
            transactionHash: log.transactionHash as string,
            logIndex: log.logIndex as number,
          })),
          skipDuplicates: true,
        });
      }

      for (const launch of launches) {
        const supply = supplies.get(launch.token);
        const isImage =
          launch.uri !== null && /^https?:\/\//i.test(launch.uri);
        const token = await tx.token.upsert({
          where: { mint: launch.token },
          create: {
            mint: launch.token,
            deployerWallet: launch.creator,
            name: launch.name,
            symbol: launch.symbol,
            imageUri: isImage ? launch.uri : null,
            metadataUri: isImage ? null : launch.uri,
            decimals: supply?.decimals ?? null,
            launchpad: source.launchpad,
            discoveredVia: "ARC_FACTORY_INDEXER",
            launchTime: timestamps.get(launch.blockNumber) ?? new Date(),
            // Whole-token units, matching how market-data multiplies price × supply.
            initialSupply: supply?.display ?? "0",
            launchTxHash: launch.transactionHash,
            links: launch.links,
            launchBlock: launch.blockNumber,
          },
          update: {},
        });
        await tx.pool.upsert({
          where: { address: launch.poolRef },
          create: {
            address: launch.poolRef,
            tokenId: token.id,
            venue: source.venue,
            quoteMint: USDC.toLowerCase(),
          },
          update: {},
        });
      }

      await tx.arcIndexerCursor.upsert({
        where: { source: cursorKey },
        create: { source: cursorKey, lastBlock: toBlock },
        update: { lastBlock: toBlock },
      });
    });

    return {
      source: source.id,
      scannedFrom: fromBlock.toString(),
      scannedTo: toBlock.toString(),
      lagBlocks: (head - toBlock).toString(),
      newLaunches: launches.length,
    };
  }

  private async readSupplies(tokens: Address[]) {
    const out = new Map<string, { decimals: number; display: string }>();
    if (tokens.length === 0) return out;
    const results = await this.client.multicall({
      allowFailure: true,
      contracts: tokens.flatMap((address) => [
        { address, abi: erc20Abi, functionName: "decimals" } as const,
        { address, abi: erc20Abi, functionName: "totalSupply" } as const,
      ]),
    });
    tokens.forEach((address, i) => {
      const decimals = results[i * 2];
      const supply = results[i * 2 + 1];
      if (decimals?.status === "success" && supply?.status === "success") {
        out.set(address.toLowerCase(), {
          decimals: Number(decimals.result),
          display: formatUnits(supply.result as bigint, Number(decimals.result)),
        });
      }
    });
    return out;
  }

  private async readBlockTimes(blocks: bigint[]) {
    const out = new Map<bigint, Date>();
    for (const blockNumber of blocks) {
      const block = await this.client.getBlock({ blockNumber });
      out.set(blockNumber, new Date(Number(block.timestamp) * 1000));
    }
    return out;
  }
}

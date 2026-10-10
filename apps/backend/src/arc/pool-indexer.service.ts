import { getDb } from "@riven/shared";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  arc,
  ARGUS_V4_HOOK,
  DEFAULT_LOOKBACK_BLOCKS,
  DEX_FACTORIES,
  NATIVE,
  POOL_MANAGER,
  POOL_MANAGER_DEPLOY_BLOCK,
  POSITION_MANAGER,
  USDC,
  cleanText, arcTransport } from "./config";
import { scanBlockRange } from "./factory-log-indexer.service";

const FORWARD_CURSOR = "v4:pools";
const BACKFILL_CURSOR = "v4:pools:backfill";
const CHUNK = 9_999n;
const MAX_FORWARD_BLOCKS = 50_000n;
/** History is walked backwards a little each tick so all of Arc gets covered over time. */
const BACKFILL_BLOCKS_PER_RUN = BigInt(process.env.ARC_POOL_BACKFILL_BLOCKS ?? "150000");

const INITIALIZE = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
);

const POOL_KEYS_ABI = parseAbi([
  "function poolKeys(bytes25 poolId) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
]);

const chunkOf = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export interface PoolInit {
  poolId: string;
  token: string;
  hooks: string;
  blockNumber: bigint;
  txHash: string;
  /** Unset = Uniswap v4; otherwise the DEX the pool belongs to. */
  dex?: string;
  quote?: string;
}

const isUsdc = (a: string) => a === USDC.toLowerCase() || a === NATIVE.toLowerCase();

/**
 * A v2/v3/Solidly/Algebra factory's pool-created log → the listed token(s).
 * token0/token1 are always the first two indexed topics; the pool address is
 * the address-sized word in the data (skipping small ints like tickSpacing).
 */
export function toDexPools(
  log: { topics: readonly string[]; data: string; blockNumber: bigint | null; transactionHash: string | null },
  dex: string,
): PoolInit[] {
  if (log.topics.length < 3 || log.blockNumber === null || !log.transactionHash) return [];
  const t0 = `0x${log.topics[1]!.slice(26)}`.toLowerCase();
  const t1 = `0x${log.topics[2]!.slice(26)}`.toLowerCase();
  const words = (log.data.slice(2).match(/.{64}/g) ?? []).map((w) => BigInt(`0x${w}`));
  const pool = words.find((w) => w > 1n << 120n && w < 1n << 160n);
  if (pool === undefined) return [];
  const poolId = `0x${pool.toString(16).padStart(40, "0")}`;
  const base = { poolId, hooks: "", blockNumber: log.blockNumber, txHash: log.transactionHash, dex };
  // USDC pair → the other side. Otherwise list both sides (DexScreener does too).
  if (isUsdc(t0)) return [{ ...base, token: t1, quote: USDC.toLowerCase() }];
  if (isUsdc(t1)) return [{ ...base, token: t0, quote: USDC.toLowerCase() }];
  return [
    { ...base, token: t0, quote: t1 },
    { ...base, poolId: `${poolId}:${t1}`, token: t1, quote: t0 },
  ];
}

/** Keep USDC-quoted pools (ERC-20 or native); returns the non-USDC side as the token. */
export function toPoolInit(log: {
  args: { id?: string; currency0?: string; currency1?: string; hooks?: string };
  blockNumber: bigint | null;
  transactionHash: string | null;
}): PoolInit | null {
  const { id, currency0, currency1, hooks } = log.args;
  if (!id || !currency0 || !currency1 || log.blockNumber === null || !log.transactionHash) return null;
  const c0 = currency0.toLowerCase();
  const c1 = currency1.toLowerCase();
  const token = isUsdc(c0) ? c1 : isUsdc(c1) ? c0 : null;
  if (!token || isUsdc(token)) return null;
  return {
    poolId: id.toLowerCase(),
    token,
    hooks: (hooks ?? "").toLowerCase(),
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    // The pool's own USDC side: the native coin (0x0, 18 decimals) or the ERC-20 (6).
    quote: isUsdc(c0) ? c0 : c1,
  };
}

/**
 * Discovers every token on Arc that has a USDC pool on Uniswap v4, from the
 * PoolManager's Initialize events — not just launchpad launches. New pools are
 * followed forward; history is walked backwards to the PoolManager's deploy block.
 */
export class PoolIndexerService {
  private readonly client: PublicClient;

  constructor(client?: PublicClient) {
    this.client =
      client ??
      createPublicClient({
        chain: arc,
        transport: arcTransport(),
      });
  }

  /** Uniswap v4 pools (PoolManager Initialize) plus every other DEX factory on Arc. */
  async indexPoolsOnce() {
    const v4 = await this.indexSource(FORWARD_CURSOR, BACKFILL_CURSOR, POOL_MANAGER_DEPLOY_BLOCK, async (f, t) =>
      (await this.client.getLogs({ address: POOL_MANAGER, event: INITIALIZE, fromBlock: f, toBlock: t }))
        .map(toPoolInit)
        .filter((p): p is PoolInit => p !== null),
    );
    const dexByFactory = new Map(DEX_FACTORIES.map((d) => [d.factory.toLowerCase(), d.dex]));
    const others = await this.indexSource("dex:pools", "dex:pools:backfill", POOL_MANAGER_DEPLOY_BLOCK, async (f, t) =>
      (await this.client.getLogs({ address: DEX_FACTORIES.map((d) => d.factory), fromBlock: f, toBlock: t })).flatMap(
        (l) => toDexPools(l, dexByFactory.get(l.address.toLowerCase()) ?? "other"),
      ),
    );
    return { ...v4, otherDexes: others };
  }

  private async indexSource(
    forwardCursor: string,
    backfillCursor: string,
    floor: bigint,
    fetch: (from: bigint, to: bigint) => Promise<PoolInit[]>,
  ) {
    const FORWARD_CURSOR = forwardCursor;
    const BACKFILL_CURSOR = backfillCursor;
    const POOL_MANAGER_DEPLOY_BLOCK = floor;
    const db = getDb();
    const head = await this.client.getBlockNumber();
    const [fwd, back] = await Promise.all([
      db.arcIndexerCursor.findUnique({ where: { source: FORWARD_CURSOR } }),
      db.arcIndexerCursor.findUnique({ where: { source: BACKFILL_CURSOR } }),
    ]);

    const configured = process.env.ARC_INDEX_START_BLOCK;
    const start = configured ? BigInt(configured) : head > DEFAULT_LOOKBACK_BLOCKS ? head - DEFAULT_LOOKBACK_BLOCKS : 0n;
    const fFrom = fwd ? fwd.lastBlock + 1n : start;
    const fTo = fFrom + MAX_FORWARD_BLOCKS - 1n > head ? head : fFrom + MAX_FORWARD_BLOCKS - 1n;

    let forward = 0;
    if (fFrom <= head) {
      forward = await this.ingestRange(fFrom, fTo, "complete-if-new", fetch);
      await db.arcIndexerCursor.upsert({
        where: { source: FORWARD_CURSOR },
        create: { source: FORWARD_CURSOR, lastBlock: fTo },
        update: { lastBlock: fTo },
      });
    }

    // Backwards history: [bTo - N, bTo], ending at the PoolManager deploy block.
    const bTop = back ? back.lastBlock - 1n : start - 1n;
    let backfilled = 0;
    let backfillFrom: bigint | null = null;
    if (bTop >= POOL_MANAGER_DEPLOY_BLOCK) {
      backfillFrom = bTop - BACKFILL_BLOCKS_PER_RUN + 1n < POOL_MANAGER_DEPLOY_BLOCK
        ? POOL_MANAGER_DEPLOY_BLOCK
        : bTop - BACKFILL_BLOCKS_PER_RUN + 1n;
      backfilled = await this.ingestRange(backfillFrom, bTop, "partial", fetch);
      await db.arcIndexerCursor.upsert({
        where: { source: BACKFILL_CURSOR },
        create: { source: BACKFILL_CURSOR, lastBlock: backfillFrom },
        update: { lastBlock: backfillFrom },
      });
    }

    return {
      forward: { from: fFrom.toString(), to: fTo.toString(), newTokens: forward },
      backfill: backfillFrom === null ? "done" : { from: backfillFrom.toString(), to: bTop.toString(), newTokens: backfilled },
    };
  }

  /**
   * "complete-if-new": pools seen as they're created. If the token had no code a
   * block before its pool, every transfer is ahead of us → holder history is
   * complete. Older tokens (and all backfilled ones) are "partial" until the
   * holder backfill job replays their transfers.
   */
  private async ingestRange(
    from: bigint,
    to: bigint,
    mode: "complete-if-new" | "partial",
    fetch: (from: bigint, to: bigint) => Promise<PoolInit[]>,
  ) {
    const db = getDb();
    const inits = await scanBlockRange(from, to, CHUNK, fetch);
    if (inits.length === 0) return 0;

    // Skip tokens/pools we already have.
    const [knownTokens, knownPools] = await Promise.all([
      db.token.findMany({ where: { mint: { in: inits.map((p) => p.token) } }, select: { mint: true, id: true } }),
      db.pool.findMany({ where: { address: { in: inits.map((p) => p.poolId) } }, select: { address: true } }),
    ]);
    const tokenIds = new Map(knownTokens.map((t) => [t.mint, t.id]));
    const poolSet = new Set(knownPools.map((p) => p.address));
    const fresh = inits.filter((p) => !poolSet.has(p.poolId));
    const newTokens = [...new Map(fresh.filter((p) => !tokenIds.has(p.token)).map((p) => [p.token, p])).values()];

    const meta = await this.readMeta(newTokens.map((p) => p.token as Address));
    // Holder history is only "complete" if the activity indexer hasn't passed the
    // pool's block yet — otherwise its early transfers were never seen.
    const activity = await db.arcIndexerCursor.findUnique({ where: { source: "arc:activity" } });
    // Arc blocks are ~510ms and regular: interpolate launch times from one reference
    // block instead of a getBlock per token.
    const ref = await this.client.getBlock({ blockNumber: to });
    const tsOf = (block: bigint) =>
      new Date((Number(ref.timestamp) - Number(to - block) * 0.51) * 1000);
    let created = 0;
    for (const p of newTokens) {
      const m = meta.get(p.token);
      if (!m) continue; // not a readable ERC-20: skip rather than store junk
      let history = "partial";
      if (mode === "complete-if-new") {
        const before = await this.client.getCode({ address: p.token as Address, blockNumber: p.blockNumber - 1n }).catch(() => "0x");
        const createdHere = !before || before === "0x";
        const ahead = !activity || p.blockNumber > activity.lastBlock;
        history = createdHere && ahead ? "complete" : "partial";
      }
      // Pool creator stands in for the token creator. Fetched live for new pools;
      // backfilled ones get it later from the holder backfill job, if they matter.
      const sender =
        mode === "complete-if-new"
          ? await this.client
              .getTransaction({ hash: p.txHash as `0x${string}` })
              .then((tx) => tx.from.toLowerCase())
              .catch(() => "unknown")
          : "unknown";
      const token = await db.token.upsert({
        where: { mint: p.token },
        create: {
          mint: p.token,
          deployerWallet: sender,
          name: m.name,
          symbol: m.symbol,
          decimals: m.decimals,
          launchpad: p.hooks === ARGUS_V4_HOOK.toLowerCase() ? "ARGUS" : "OTHER",
          discoveredVia: "ARC_POOL_INDEXER",
          launchTime: tsOf(p.blockNumber),
          initialSupply: m.supply,
          launchTxHash: p.txHash,
          launchBlock: p.blockNumber,
          holderHistory: history,
        },
        update: {},
      });
      tokenIds.set(p.token, token.id);
      created++;
    }
    for (const p of fresh) {
      const tokenId = tokenIds.get(p.token);
      if (!tokenId) continue;
      await db.pool.upsert({
        where: { address: p.poolId },
        create: {
          address: p.poolId,
          tokenId,
          venue: p.dex ? "OTHER" : "UNISWAP_V4",
          quoteMint: p.quote ?? USDC.toLowerCase(),
          // v4 pools come from an Initialize event, so their currencies are known, not assumed.
          quoteChecked: !p.dex && p.quote !== undefined,
          ...(p.dex ? { launchInfo: { dex: p.dex } } : {}),
        },
        update: {},
      });
    }
    return created;
  }

  /**
   * Confirms which USDC each v4 pool quotes (native 18-decimal or ERC-20 6-decimal)
   * from the PositionManager's pool registry, most-traded tokens first. A pool found
   * to be native had its swaps recorded as if 6-decimal, so its stored swap amounts
   * and prices are divided by 10^12 in the same transaction that flips the flag.
   */
  async verifyQuoteCurrenciesOnce(limit = Number(process.env.ARC_QUOTE_VERIFY_PER_RUN ?? "1500")) {
    const db = getDb();
    const pools = await db.pool.findMany({
      where: { venue: "UNISWAP_V4", quoteChecked: false },
      orderBy: { token: { arcMarket: { volume24h: { sort: "desc", nulls: "last" } } } },
      select: { id: true, address: true, quoteMint: true },
      take: limit,
    });
    if (pools.length === 0) return { checked: 0 };
    let native = 0;
    let erc20 = 0;
    let unresolved = 0;
    for (const batch of chunkOf(pools, 200)) {
      const res = await this.client.multicall({
        allowFailure: true,
        contracts: batch.map(
          (p) =>
            ({
              address: POSITION_MANAGER,
              abi: POOL_KEYS_ABI,
              functionName: "poolKeys",
              args: [`0x${p.address.slice(2, 52)}` as Hex],
            }) as const,
        ),
      });
      for (let i = 0; i < batch.length; i++) {
        const p = batch[i]!;
        const r = res[i]!;
        if (r.status !== "success") {
          unresolved++;
          continue;
        }
        const c0 = r.result[0].toLowerCase();
        const c1 = r.result[1].toLowerCase();
        const isNative = c0 === NATIVE.toLowerCase();
        if (!isNative && c0 !== USDC.toLowerCase() && c1 !== USDC.toLowerCase()) {
          unresolved++;
          continue;
        }
        const quote = (isNative ? NATIVE : USDC).toLowerCase();
        const wasAssumedErc20 = isNative && p.quoteMint !== NATIVE.toLowerCase();
        await db.$transaction(async (tx) => {
          // Only the process that flips the flag corrects the swaps, so two workers can never both divide.
          const flipped = await tx.pool.updateMany({
            where: { id: p.id, quoteChecked: false },
            data: { quoteMint: quote, quoteChecked: true },
          });
          if (flipped.count === 1 && wasAssumedErc20) {
            await tx.$executeRaw`UPDATE arc_swaps SET usdc_amount = usdc_amount / 1000000000000, price_usd = price_usd / 1000000000000 WHERE pool_id = ${p.id}`;
          }
        });
        if (isNative) native++;
        else erc20++;
      }
    }
    return { checked: pools.length, native, erc20, unresolved };
  }

  private async readMeta(tokens: Address[]) {
    const out = new Map<string, { name: string; symbol: string; decimals: number; supply: string }>();
    if (tokens.length === 0) return out;
    const calls = tokens.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "name" } as const,
      { address, abi: erc20Abi, functionName: "symbol" } as const,
      { address, abi: erc20Abi, functionName: "decimals" } as const,
      { address, abi: erc20Abi, functionName: "totalSupply" } as const,
    ]);
    const res = await this.client.multicall({ allowFailure: true, contracts: calls });
    tokens.forEach((a, i) => {
      const [n, s, d, t] = res.slice(i * 4, i * 4 + 4);
      if (d?.status !== "success" || t?.status !== "success") return;
      const decimals = Number(d.result);
      out.set(a.toLowerCase(), {
        name: n?.status === "success" ? cleanText(String(n.result), 80) : "",
        symbol: s?.status === "success" ? cleanText(String(s.result), 32) || "?" : "?",
        decimals,
        supply: formatUnits(t.result as bigint, decimals),
      });
    });
    return out;
  }
}

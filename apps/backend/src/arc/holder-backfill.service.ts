import { getDb } from "@riven/shared";
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { arc, POOL_MANAGER, POSITION_MANAGER, arcTransport } from "./config";
import { interpretSwap } from "./activity-indexer.service";
import { scanBlockRange } from "./factory-log-indexer.service";

const ACTIVITY_CURSOR = "arc:activity";
/** Token-filtered transfer queries are light: Blockdaemon serves big ranges (halved automatically when an RPC refuses). */
const CHUNK = BigInt(process.env.ARC_BACKFILL_CHUNK_BLOCKS ?? "50000");
/** ~6 weeks of Arc blocks (mainnet launched 2026-09-16, so all of it for now). Longer histories stay "too_long". */
const MAX_SPAN = BigInt(process.env.ARC_BACKFILL_MAX_BLOCKS ?? "7000000");
const MIN_LIQUIDITY_USD = Number(process.env.ARC_BACKFILL_MIN_LIQUIDITY ?? "1000");
/** Tokens replayed per pipeline tick, deepest liquidity first. */
const TOKENS_PER_RUN = Number(process.env.ARC_BACKFILL_TOKENS_PER_RUN ?? "4");
const ZERO = "0x0000000000000000000000000000000000000000";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const SWAP = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);
const MODIFY_LIQUIDITY = parseAbiItem(
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
);

/**
 * Tokens found by the pool indexer's history walk (or that existed before their
 * pool) have "partial" holder history. For the ones with real liquidity, replay
 * every transfer, swap and liquidity change from the token's creation block up
 * to the activity cursor, once — then the live indexer takes over.
 */
export class HolderBackfillService {
  private readonly client: PublicClient;

  constructor(client?: PublicClient) {
    this.client =
      client ??
      createPublicClient({
        chain: arc,
        transport: arcTransport(),
      });
  }

  async backfillOnce() {
    const db = getDb();
    const cursor = await db.arcIndexerCursor.findUnique({ where: { source: ACTIVITY_CURSOR } });
    if (!cursor) return { skipped: "activity indexer has not started" };
    // Only tokens the live indexer has already passed: newer ones would be
    // skipped forever and block the queue.
    const tokens = await db.token.findMany({
      where: {
        holderHistory: "partial",
        arcMarket: { liquidityUsd: { gte: MIN_LIQUIDITY_USD } },
        OR: [{ launchBlock: null }, { launchBlock: { lte: cursor.lastBlock } }],
      },
      orderBy: { arcMarket: { liquidityUsd: "desc" } },
      include: { pools: true },
      take: TOKENS_PER_RUN,
    });
    if (tokens.length === 0) return { backfilled: null };
    const done: unknown[] = [];
    for (const t of tokens) {
      try {
        done.push(await this.backfillToken(t, cursor.lastBlock));
      } catch (err) {
        const msg = (err as Error).message;
        // Network blips retry next tick; a history the RPC can't serve (too many
        // logs) is set aside so it doesn't block every token behind it.
        // (every RPC failing the same getLogs = a history too big to serve, e.g. WETH/EURC)
        const transient = /ENOTFOUND|ECONNRESET|ECONNREFUSED|fetch failed/i.test(msg) && !/eth_getLogs/.test(msg);
        if (!transient) {
          await db.token.update({ where: { id: t.id }, data: { holderHistory: "unavailable" } });
        }
        done.push({ token: t.symbol, error: msg.slice(0, 120) });
      }
    }
    return { backfilled: done };
  }

  private async backfillToken(
    t: Awaited<ReturnType<ReturnType<typeof getDb>["token"]["findFirstOrThrow"]>> & {
      pools: Array<{ id: string; address: string; venue: string }>;
    },
    to: bigint,
  ) {
    const db = getDb();
    const creation = await this.creationBlock(t.mint as Address, t.launchBlock ?? to);
    if (creation > to) return { token: t.symbol, skipped: "activity indexer not caught up yet" };
    if (to - creation > MAX_SPAN) {
      await db.token.update({ where: { id: t.id }, data: { holderHistory: "too_long", creationBlock: creation } });
      return { token: t.symbol, skipped: "history too long" };
    }

    const v4Pools = t.pools.filter((p) => p.venue === "UNISWAP_V4");
    const poolIds = v4Pools.map((p) => p.address as Hex);
    const [transfers, swaps, modifies] = await Promise.all([
      scanBlockRange(creation, to, CHUNK, (f, tt) =>
        this.client.getLogs({ address: t.mint as Address, event: TRANSFER, fromBlock: f, toBlock: tt }),
      ),
      poolIds.length
        ? scanBlockRange(t.launchBlock ?? creation, to, CHUNK, (f, tt) =>
            this.client.getLogs({ address: POOL_MANAGER, event: SWAP, args: { id: poolIds }, fromBlock: f, toBlock: tt }),
          )
        : Promise.resolve([]),
      poolIds.length
        ? scanBlockRange(t.launchBlock ?? creation, to, CHUNK, (f, tt) =>
            this.client.getLogs({
              address: POOL_MANAGER,
              event: MODIFY_LIQUIDITY,
              args: { id: poolIds },
              fromBlock: f,
              toBlock: tt,
            }),
          )
        : Promise.resolve([]),
    ]);

    const ref = await this.client.getBlock({ blockNumber: to });
    const tsAt = (b: bigint) => new Date((Number(ref.timestamp) - Number(to - b) * 0.51) * 1000);
    const decimals = t.decimals ?? 18;

    const bal = new Map<string, { net: bigint; received: bigint; first: bigint | null }>();
    const add = (holder: string, v: bigint, block: bigint) => {
      const d = bal.get(holder) ?? { net: 0n, received: 0n, first: null };
      d.net += v;
      if (v > 0n) {
        d.received += v;
        if (d.first === null || block < d.first) d.first = block;
      }
      bal.set(holder, d);
    };
    for (const l of transfers) {
      const { from, to: dst, value } = l.args;
      if (!from || !dst || value === undefined) continue;
      if (from.toLowerCase() !== ZERO) add(from.toLowerCase(), -value, l.blockNumber);
      add(dst.toLowerCase(), value, l.blockNumber);
    }
    const poolRow = new Map(v4Pools.map((p) => [p.address, p.id]));
    const swapRows = swaps.flatMap((l) => {
      const poolId = l.args.id ? poolRow.get(l.args.id.toLowerCase()) : undefined;
      if (!poolId || l.args.amount0 === undefined || l.args.amount1 === undefined) return [];
      const v = interpretSwap(t.mint, decimals, l.args.amount0, l.args.amount1);
      return [
        {
          id: `${l.transactionHash}:${l.logIndex}`,
          poolId,
          ts: tsAt(l.blockNumber),
          blockNumber: l.blockNumber,
          side: v.side,
          sender: (l.args.sender ?? ZERO).toLowerCase(),
          usdcAmount: v.usdcAmount.toString(),
          tokenAmount: v.tokenAmount.toString(),
          priceUsd: v.priceUsd === null ? null : v.priceUsd.toString(),
        },
      ];
    });
    const lpRows = modifies.flatMap((l) => {
      const poolId = l.args.id ? poolRow.get(l.args.id.toLowerCase()) : undefined;
      if (!poolId) return [];
      const sender = (l.args.sender ?? ZERO).toLowerCase();
      return [
        {
          id: `${l.transactionHash}:${l.logIndex}`,
          poolId,
          sender,
          positionId:
            sender === POSITION_MANAGER.toLowerCase() && l.args.salt ? BigInt(l.args.salt).toString() : null,
          liquidityDelta: (l.args.liquidityDelta ?? 0n).toString(),
          blockNumber: l.blockNumber,
        },
      ];
    });

    // The pool creator stands in for the token creator when it wasn't known.
    let creator = t.deployerWallet;
    if ((creator === "unknown" || !creator) && t.launchTxHash) {
      creator = await this.client
        .getTransaction({ hash: t.launchTxHash as Hex })
        .then((tx) => tx.from.toLowerCase())
        .catch(() => "unknown");
    }

    const rows = [...bal.entries()].filter(([, d]) => d.net !== 0n || d.received !== 0n);
    await db.$transaction(
      async (tx) => {
        await tx.arcTokenBalance.deleteMany({ where: { tokenId: t.id } });
        for (let i = 0; i < rows.length; i += 2000) {
          const part = rows.slice(i, i + 2000);
          await tx.$executeRawUnsafe(
            `INSERT INTO "arc_token_balances" ("token_id", "holder", "balance", "received", "first_block")
             SELECT $1, * FROM unnest($2::text[], $3::numeric[], $4::numeric[], $5::bigint[])`,
            t.id,
            part.map(([h]) => h),
            part.map(([, d]) => d.net.toString()),
            part.map(([, d]) => d.received.toString()),
            part.map(([, d]) => (d.first === null ? null : d.first.toString())),
          );
        }
        if (swapRows.length) await tx.arcSwap.createMany({ data: swapRows, skipDuplicates: true });
        if (lpRows.length) await tx.arcLpEvent.createMany({ data: lpRows, skipDuplicates: true });
        await tx.token.update({
          where: { id: t.id },
          data: { holderHistory: "complete", creationBlock: creation, deployerWallet: creator },
        });
      },
      { timeout: 120_000 },
    );
    return {
      token: t.symbol,
      blocks: (to - creation).toString(),
      holders: rows.length,
      swaps: swapRows.length,
      lpEvents: lpRows.length,
    };
  }

  /** First block where the contract has code (binary search on eth_getCode). */
  private async creationBlock(token: Address, upper: bigint): Promise<bigint> {
    let lo = 0n;
    let hi = upper;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      const code = await this.client.getCode({ address: token, blockNumber: mid }).catch(() => undefined);
      if (code && code !== "0x") hi = mid;
      else lo = mid + 1n;
    }
    return lo;
  }
}

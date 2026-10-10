import { getDb } from "@riven/shared";
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  arc,
  BURN_ADDRESSES,
  LAUNCHPAD_SOURCES,
  POOL_MANAGER,
  POSITION_MANAGER,
  USDC, arcTransport, quoteDecimals, quoteIsCurrency0 } from "./config";
import { scanBlockRange } from "./factory-log-indexer.service";

const CURSOR = "arc:activity";
const CHUNK_BLOCKS = 9_999n;
const MAX_BLOCKS_PER_RUN = BigInt(process.env.ARC_ACTIVITY_BLOCKS_PER_RUN ?? "60000");
/** Upper bound on events committed per pass (see the cut below). */
const MAX_EVENTS_PER_RUN = 15_000;
/** rpc.mainnet.arc.io rejects filters with more than 20 addresses or topic values. */
const FILTER_BATCH = 20;
/**
 * Holders and swaps are followed for ~48h after launch (~340k blocks at ~510ms) —
 * when nearly all rugs happen — to keep RPC load flat as the token list grows.
 */
const ACTIVE_BLOCKS = BigInt(process.env.ARC_ACTIVE_BLOCKS ?? "340000");
const ZERO = "0x0000000000000000000000000000000000000000";

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const SWAP = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);
const MODIFY_LIQUIDITY = parseAbiItem(
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
);

interface TrackedToken {
  id: string;
  mint: string;
  deployerWallet: string;
  decimals: number;
}

export interface SwapView {
  side: "buy" | "sell";
  usdcAmount: number;
  tokenAmount: number;
  priceUsd: number | null;
}

/**
 * v4 Swap amounts are the swapper's balance deltas: negative means the swapper
 * paid that currency in. A buy is therefore USDC < 0 and token > 0. Verified on a
 * real Argus dev-buy (USDC delta -2500, token delta +499M).
 */
export function interpretSwap(
  token: string,
  decimals: number,
  amount0: bigint,
  amount1: bigint,
  quoteMint?: string | null,
): SwapView {
  const usdcIsCurrency0 = quoteIsCurrency0(quoteMint, token);
  const usdcDelta = usdcIsCurrency0 ? amount0 : amount1;
  const tokenDelta = usdcIsCurrency0 ? amount1 : amount0;
  const abs = (n: bigint) => (n < 0n ? -n : n);
  const usdcAmount = Number(abs(usdcDelta)) / 10 ** quoteDecimals(quoteMint);
  const tokenAmount = Number(abs(tokenDelta)) / 10 ** decimals;
  return {
    side: usdcDelta < 0n ? "buy" : "sell",
    usdcAmount,
    tokenAmount,
    priceUsd: tokenAmount > 0 ? usdcAmount / tokenAmount : null,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Follows every indexed Arc token after launch: holder balances (from ERC-20
 * Transfer logs), creator burns, and v4 swaps / liquidity removals on its pool.
 * Never runs ahead of the launch indexers, so a token's launch-block transfers
 * are always inside a range this service has yet to scan.
 */
export class ArcActivityIndexerService {
  private readonly client: PublicClient;

  constructor(client?: PublicClient) {
    this.client =
      client ??
      createPublicClient({
        chain: arc,
        transport: arcTransport(),
      });
  }

  async indexActivityOnce() {
    const db = getDb();
    const launchCursors = await db.arcIndexerCursor.findMany({
      // Never run ahead of any discovery source, so a token's first transfers are
      // always in a range this service has yet to scan.
      where: { source: { in: [...LAUNCHPAD_SOURCES.map((s) => `${s.id}:factory`), "v4:pools"] } },
    });
    if (launchCursors.length === 0) return { scannedFrom: null, scannedTo: null };
    const bound = launchCursors.reduce(
      (m, c) => (c.lastBlock < m ? c.lastBlock : m),
      launchCursors[0]!.lastBlock,
    );

    const cursor = await db.arcIndexerCursor.findUnique({ where: { source: CURSOR } });
    let fromBlock: bigint;
    if (cursor) {
      fromBlock = cursor.lastBlock + 1n;
    } else {
      const first = await db.token.findFirst({
        where: { launchBlock: { not: null } },
        orderBy: { launchBlock: "asc" },
        select: { launchBlock: true },
      });
      if (!first?.launchBlock) return { scannedFrom: null, scannedTo: null };
      fromBlock = first.launchBlock;
    }
    if (fromBlock > bound) return { scannedFrom: null, scannedTo: null, upToDate: true };
    let toBlock =
      fromBlock + MAX_BLOCKS_PER_RUN - 1n > bound ? bound : fromBlock + MAX_BLOCKS_PER_RUN - 1n;

    // Tokens leaving the followed set stop receiving transfers while the cursor
    // moves on, so their balances go stale. Mark them partial: the scorer stops
    // trusting their holders, and the backfill rebuilds them if they come back.
    const activeFrom = toBlock > ACTIVE_BLOCKS ? toBlock - ACTIVE_BLOCKS : 0n;
    await db.token.updateMany({
      where: {
        launchBlock: { not: null, lt: activeFrom },
        OR: [{ holderHistory: null }, { holderHistory: "complete" }],
        AND: [
          {
            OR: [
              { arcMarket: null },
              { arcMarket: { liquidityUsd: null } },
              { arcMarket: { liquidityUsd: { lt: 1000 } } },
            ],
          },
        ],
      },
      data: { holderHistory: "partial" },
    });

    // Followed: tokens whose full holder history we have ("complete", or legacy
    // launchpad rows with no flag) that launched in the active window, plus older
    // complete tokens that still have real liquidity.
    const rows = await db.token.findMany({
      where: {
        launchBlock: { not: null, lte: toBlock },
        OR: [{ holderHistory: null }, { holderHistory: "complete" }],
        AND: [
          {
            OR: [
              { launchBlock: { gte: toBlock > ACTIVE_BLOCKS ? toBlock - ACTIVE_BLOCKS : 0n } },
              { arcMarket: { liquidityUsd: { gte: 1000 } } },
            ],
          },
        ],
      },
      select: {
        id: true,
        mint: true,
        deployerWallet: true,
        decimals: true,
        initialSupply: true,
        pools: { select: { id: true, address: true, venue: true, excludedHolders: true, quoteMint: true } },
      },
    });
    const supplyRaw = new Map(
      rows.map((r) => [r.id, Number(r.initialSupply) * 10 ** (r.decimals ?? 18)]),
    );
    const ignoreSellers = new Set<string>([
      ...rows.flatMap((r) => r.pools.flatMap((p) => (Array.isArray(p.excludedHolders) ? (p.excludedHolders as string[]) : []))),
    ]);
    const tokens = new Map<string, TrackedToken>(
      rows.map((r) => [
        r.mint,
        { id: r.id, mint: r.mint, deployerWallet: r.deployerWallet, decimals: r.decimals ?? 18 },
      ]),
    );
    const pools = new Map<string, { poolRowId: string; token: TrackedToken; quoteMint: string | null }>();
    for (const r of rows) {
      for (const p of r.pools) {
        if (p.venue === "UNISWAP_V4")
          pools.set(p.address, { poolRowId: p.id, token: tokens.get(r.mint)!, quoteMint: p.quoteMint });
      }
    }

    const getTransfers = (batch: string[], from: bigint, to: bigint) =>
      this.client.getLogs({
        address: batch as Address[],
        event: TRANSFER,
        fromBlock: from,
        toBlock: to,
      });
    const getSwaps = (batch: string[], from: bigint, to: bigint) =>
      this.client.getLogs({
        address: POOL_MANAGER,
        event: SWAP,
        args: { id: batch as Hex[] },
        fromBlock: from,
        toBlock: to,
      });
    // Liquidity changes are rare chain-wide (~400 per 10k blocks), so one unfiltered
    // query per range is cheaper than batching by pool; matched locally below.
    const getModifies = (from: bigint, to: bigint) =>
      this.client.getLogs({
        address: POOL_MANAGER,
        event: MODIFY_LIQUIDITY,
        fromBlock: from,
        toBlock: to,
      });

    const transfers: Awaited<ReturnType<typeof getTransfers>> = [];
    for (const batch of chunk([...tokens.keys()], FILTER_BATCH)) {
      transfers.push(
        ...(await scanBlockRange(fromBlock, toBlock, CHUNK_BLOCKS, (f, t) => getTransfers(batch, f, t))),
      );
    }
    const swapLogs: Awaited<ReturnType<typeof getSwaps>> = [];
    const modifyLogs: Awaited<ReturnType<typeof getModifies>> = [];
    for (const batch of chunk([...pools.keys()], FILTER_BATCH)) {
      swapLogs.push(
        ...(await scanBlockRange(fromBlock, toBlock, CHUNK_BLOCKS, (f, t) => getSwaps(batch, f, t))),
      );
    }
    if (pools.size > 0) {
      modifyLogs.push(...(await scanBlockRange(fromBlock, toBlock, CHUNK_BLOCKS, getModifies)));
    }

    // Busy ranges (wash-traded launches can emit tens of thousands of events) are
    // cut at the block where MAX_EVENTS_PER_RUN is reached, so one pass never
    // builds a write too big to commit; the rest is picked up next pass.
    const eventBlocks = [...transfers, ...swapLogs, ...modifyLogs]
      .map((l) => l.blockNumber)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (eventBlocks.length > MAX_EVENTS_PER_RUN) {
      const cut = eventBlocks[MAX_EVENTS_PER_RUN]! - 1n;
      // Never stall: always advance at least one block.
      toBlock = cut >= fromBlock ? cut : fromBlock;
      const keep = <T extends { blockNumber: bigint }>(xs: T[]) => xs.filter((x) => x.blockNumber <= toBlock);
      transfers.splice(0, transfers.length, ...keep(transfers));
      swapLogs.splice(0, swapLogs.length, ...keep(swapLogs));
      modifyLogs.splice(0, modifyLogs.length, ...keep(modifyLogs));
    }

    // Arc blocks are ~510ms and regular, so interpolating between the range's two
    // end timestamps is accurate to a second or two without a getBlock per event.
    const [startBlock, endBlock] = await Promise.all([
      this.client.getBlock({ blockNumber: fromBlock }),
      this.client.getBlock({ blockNumber: toBlock }),
    ]);
    const t0 = Number(startBlock.timestamp);
    const t1 = Number(endBlock.timestamp);
    const span = Number(toBlock - fromBlock) || 1;
    const tsAt = (block: bigint) =>
      new Date((t0 + ((t1 - t0) * Number(block - fromBlock)) / span) * 1000);

    // Per (token, holder): net balance change, total received, first block received.
    const deltas = new Map<string, { net: bigint; received: bigint; first: bigint | null }>();
    const addDelta = (tokenId: string, holder: string, v: bigint, block: bigint) => {
      const key = `${tokenId}|${holder}`;
      const d = deltas.get(key) ?? { net: 0n, received: 0n, first: null };
      d.net += v;
      if (v > 0n) {
        d.received += v;
        if (d.first === null || block < d.first) d.first = block;
      }
      deltas.set(key, d);
    };
    const burns: Array<{
      tokenId: string;
      wallet: string;
      amount: string;
      attributed: boolean;
      burnedAt: Date;
      txHash: string;
    }> = [];
    const alerts: Array<{ tokenId: string; type: "WHALE_DUMP"; message: string; details: object }> = [];
    // A transfer into the PoolManager is only a sale when its tx also swapped and
    // didn't add liquidity — launch seeding and LP adds look identical otherwise.
    const swapTxs = new Set(swapLogs.map((l) => l.transactionHash));
    const liquidityTxs = new Set(modifyLogs.map((l) => l.transactionHash));
    for (const log of transfers) {
      const token = tokens.get(log.address.toLowerCase());
      const { from, to, value } = log.args;
      if (!token || !from || !to || value === undefined) continue;
      const f = from.toLowerCase();
      const t = to.toLowerCase();
      // Anti-rug: one wallet selling 5%+ of supply into the pool in a single transfer.
      const supply = supplyRaw.get(token.id) ?? 0;
      const isSale = swapTxs.has(log.transactionHash) && !liquidityTxs.has(log.transactionHash);
      if (t === POOL_MANAGER.toLowerCase() && isSale && f !== ZERO && supply > 0 && !ignoreSellers.has(f)) {
        const share = (Number(value) / supply) * 100;
        if (share >= 5) {
          alerts.push({
            tokenId: token.id,
            type: "WHALE_DUMP",
            message: `A wallet just sold ${share.toFixed(1)}% of the supply`,
            details: { wallet: f, sharePct: share, tx: log.transactionHash, block: log.blockNumber.toString() },
          });
        }
      }
      if (f !== ZERO) addDelta(token.id, f, -value, log.blockNumber);
      addDelta(token.id, t, value, log.blockNumber);
      if (BURN_ADDRESSES.has(t) && f !== ZERO) {
        burns.push({
          tokenId: token.id,
          wallet: f,
          amount: (Number(value) / 10 ** token.decimals).toString(),
          attributed: f === token.deployerWallet.toLowerCase(),
          burnedAt: tsAt(log.blockNumber),
          txHash: `${log.transactionHash}:${log.logIndex}`,
        });
      }
    }

    const swaps: Array<{
      id: string;
      poolId: string;
      ts: Date;
      blockNumber: bigint;
      side: "buy" | "sell";
      sender: string;
      usdcAmount: string;
      tokenAmount: string;
      priceUsd: string | null;
    }> = [];
    for (const log of swapLogs) {
      const pool = log.args.id ? pools.get(log.args.id.toLowerCase()) : undefined;
      const { amount0, amount1, sender } = log.args;
      if (!pool || amount0 === undefined || amount1 === undefined) continue;
      const view = interpretSwap(pool.token.mint, pool.token.decimals, amount0, amount1, pool.quoteMint);
      swaps.push({
        id: `${log.transactionHash}:${log.logIndex}`,
        poolId: pool.poolRowId,
        ts: tsAt(log.blockNumber),
        blockNumber: log.blockNumber,
        side: view.side,
        sender: (sender ?? ZERO).toLowerCase(),
        usdcAmount: view.usdcAmount.toString(),
        tokenAmount: view.tokenAmount.toString(),
        priceUsd: view.priceUsd === null ? null : view.priceUsd.toString(),
      });
    }
    const removedPools = new Set<string>();
    const lpEvents: Array<{
      id: string;
      poolId: string;
      sender: string;
      positionId: string | null;
      liquidityDelta: string;
      blockNumber: bigint;
    }> = [];
    for (const log of modifyLogs) {
      const pool = log.args.id ? pools.get(log.args.id.toLowerCase()) : undefined;
      if (!pool) continue;
      const delta = log.args.liquidityDelta ?? 0n;
      if (delta < 0n) removedPools.add(pool.poolRowId);
      const sender = (log.args.sender ?? ZERO).toLowerCase();
      // PositionManager uses the position NFT id as the salt.
      const positionId =
        sender === POSITION_MANAGER.toLowerCase() && log.args.salt ? BigInt(log.args.salt).toString() : null;
      lpEvents.push({
        id: `${log.transactionHash}:${log.logIndex}`,
        poolId: pool.poolRowId,
        sender,
        positionId,
        liquidityDelta: delta.toString(),
        blockNumber: log.blockNumber,
      });
    }

    const balanceRows = [...deltas.entries()].filter(
      ([, d]) => d.net !== 0n || d.received !== 0n,
    );
    // Balance increments aren't idempotent, so they commit atomically with the
    // cursor; batched so no single statement gets huge.
    await db.$transaction(async (tx) => {
      for (const rows of chunk(balanceRows, 2000)) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "arc_token_balances" ("token_id", "holder", "balance", "received", "first_block")
           SELECT * FROM unnest($1::text[], $2::text[], $3::numeric[], $4::numeric[], $5::bigint[])
           ON CONFLICT ("token_id", "holder") DO UPDATE SET
             "balance" = "arc_token_balances"."balance" + EXCLUDED."balance",
             "received" = "arc_token_balances"."received" + EXCLUDED."received",
             "first_block" = LEAST(COALESCE("arc_token_balances"."first_block", EXCLUDED."first_block"), EXCLUDED."first_block")`,
          rows.map(([k]) => k.split("|")[0]),
          rows.map(([k]) => k.split("|")[1]),
          rows.map(([, d]) => d.net.toString()),
          rows.map(([, d]) => d.received.toString()),
          rows.map(([, d]) => (d.first === null ? null : d.first.toString())),
        );
      }
      if (burns.length > 0) await tx.burn.createMany({ data: burns, skipDuplicates: true });
      if (swaps.length > 0) await tx.arcSwap.createMany({ data: swaps, skipDuplicates: true });
      if (lpEvents.length > 0) await tx.arcLpEvent.createMany({ data: lpEvents, skipDuplicates: true });
      if (alerts.length > 0) await tx.alert.createMany({ data: alerts });
      for (const id of removedPools) {
        await tx.pool.updateMany({
          where: { id, lpRemovedAt: null },
          data: { lpRemovedAt: new Date() },
        });
      }
      await tx.arcIndexerCursor.upsert({
        where: { source: CURSOR },
        create: { source: CURSOR, lastBlock: toBlock },
        update: { lastBlock: toBlock },
      });
    }, { timeout: 120_000 });

    return {
      scannedFrom: fromBlock.toString(),
      scannedTo: toBlock.toString(),
      tokens: tokens.size,
      transfers: transfers.length,
      swaps: swaps.length,
      burns: burns.length,
      lpRemovals: removedPools.size,
      lpEvents: lpEvents.length,
      whaleDumps: alerts.length,
    };
  }
}

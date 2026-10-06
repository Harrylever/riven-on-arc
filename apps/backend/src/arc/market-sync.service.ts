import { getDb } from "@clawdex/shared";
import { USDC } from "./config";

const DEXSCREENER = "https://api.dexscreener.com/tokens/v1/arc/";
/** DexScreener allows 300 req/min on this endpoint; stay far below it. */
const BATCH = 30;
const CALLS_PER_RUN = Number(process.env.ARC_MARKET_CALLS_PER_RUN ?? "10");

interface DexPair {
  pairAddress?: string;
  url?: string;
  baseToken?: { address?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number; quote?: number };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
  info?: { imageUrl?: string; websites?: Array<{ url: string }>; socials?: Array<{ type: string; url: string }> };
}

/** Best pair per token: deepest USDC pair, else deepest pair of any quote. */
export function pickPairs(pairs: DexPair[]): Map<string, DexPair> {
  const best = new Map<string, DexPair>();
  const usdc = USDC.toLowerCase();
  const rank = (p: DexPair) =>
    (p.quoteToken?.address?.toLowerCase() === usdc ? 1e15 : 0) + (p.liquidity?.usd ?? 0);
  for (const p of pairs) {
    const addr = p.baseToken?.address?.toLowerCase();
    if (!addr) continue;
    const cur = best.get(addr);
    if (!cur || rank(p) > rank(cur)) best.set(addr, p);
  }
  return best;
}

const dec = (n: number | string | undefined | null) =>
  n === undefined || n === null || n === "" || !Number.isFinite(Number(n)) ? null : String(n);

/**
 * Market snapshot (price, cap, liquidity, volume, change, txns, socials) for
 * Arc tokens from DexScreener. Display only — the score never reads it except
 * as a fallback for "USDC in the pool" on tokens whose swaps Riven didn't index.
 */
export class MarketSyncService {
  async syncOnce() {
    const db = getDb();
    const freshSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
    // Priority: fresh launches, then tokens with real liquidity, then the stalest rest.
    const [fresh, liquid, stale] = await Promise.all([
      db.token.findMany({
        where: { launchTime: { gte: freshSince } },
        select: { id: true, mint: true },
        orderBy: { launchTime: "desc" },
        take: 120,
      }),
      db.token.findMany({
        where: { arcMarket: { liquidityUsd: { gte: 500 } } },
        select: { id: true, mint: true },
        orderBy: { arcMarket: { updatedAt: "asc" } },
        take: 120,
      }),
      db.token.findMany({
        where: { OR: [{ arcMarket: null }, { arcMarket: { updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } } }] },
        select: { id: true, mint: true },
        orderBy: { launchTime: "desc" },
        take: 120,
      }),
    ]);
    const queue = [...new Map([...fresh, ...liquid, ...stale].map((t) => [t.mint, t])).values()].slice(
      0,
      BATCH * CALLS_PER_RUN,
    );

    let updated = 0;
    let listed = 0;
    for (let i = 0; i < queue.length; i += BATCH) {
      const batch = queue.slice(i, i + BATCH);
      let pairs: DexPair[] = [];
      try {
        const res = await fetch(DEXSCREENER + batch.map((t) => t.mint).join(","), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 429) break; // back off until next tick
        if (!res.ok) continue;
        pairs = (await res.json()) as DexPair[];
      } catch {
        continue;
      }
      const best = pickPairs(Array.isArray(pairs) ? pairs : []);
      for (const t of batch) {
        const p = best.get(t.mint);
        const data = p
          ? {
              pairAddress: p.pairAddress ?? null,
              dexUrl: p.url ?? null,
              priceUsd: dec(p.priceUsd),
              marketCap: dec(p.marketCap ?? p.fdv),
              fdv: dec(p.fdv),
              liquidityUsd: dec(p.liquidity?.usd),
              volume5m: dec(p.volume?.m5),
              volume1h: dec(p.volume?.h1),
              volume6h: dec(p.volume?.h6),
              volume24h: dec(p.volume?.h24),
              change5m: dec(p.priceChange?.m5),
              change1h: dec(p.priceChange?.h1),
              change6h: dec(p.priceChange?.h6),
              change24h: dec(p.priceChange?.h24),
              buys24h: p.txns?.h24?.buys ?? null,
              sells24h: p.txns?.h24?.sells ?? null,
              imageUrl: p.info?.imageUrl ?? null,
              socials: {
                usdcInPool: p.quoteToken?.address?.toLowerCase() === USDC.toLowerCase() ? p.liquidity?.quote ?? null : null,
                websites: (p.info?.websites ?? []).map((w) => w.url),
                socials: (p.info?.socials ?? []).map((s) => ({ type: s.type, url: s.url })),
              },
              pairCreatedAt: p.pairCreatedAt ? new Date(p.pairCreatedAt) : null,
            }
          : null;
        if (!data) {
          // No pair this time (DexScreener gaps happen): keep the last snapshot
          // rather than wiping liquidity, which would drop the token from indexing.
          await db.arcMarket.upsert({
            where: { tokenId: t.id },
            create: { tokenId: t.id, liquidityUsd: null, volume24h: null },
            // Touch it so the sync queue (oldest first) moves on to other tokens.
            update: { updatedAt: new Date() },
          });
          updated++;
          continue;
        }
        listed++;
        await db.arcMarket.upsert({
          where: { tokenId: t.id },
          create: { tokenId: t.id, ...data },
          update: data,
        });
        updated++;
      }
    }
    return { queued: queue.length, updated, listed };
  }
}

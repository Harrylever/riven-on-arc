import { getDb } from "@clawdex/shared";
import { createPublicClient, http, parseAbi, type Address, type PublicClient } from "viem";
import { arc, cleanText, USDC } from "./config";

/** Arc launchpads publish the token's icon on the token itself: logo() → "ipfs://…". */
const LOGO_ABI = parseAbi(["function logo() view returns (string)"]);
const LOGO_PER_RUN = Number(process.env.ARC_LOGO_LOOKUPS_PER_RUN ?? "300");

const DEXSCREENER = "https://api.dexscreener.com/tokens/v1/arc/";
/** GeckoTerminal knows icons DexScreener doesn't (majors, CoinGecko-listed tokens). 30 req/min free. */
const GECKO = "https://api.geckoterminal.com/api/v2/networks/arc/tokens/multi/";
const GECKO_CALLS_PER_RUN = Number(process.env.ARC_GECKO_CALLS_PER_RUN ?? "4");
/** DexScreener allows 300 req/min on this endpoint; 40 sequential calls per tick stays well below it. */
const BATCH = 30;
const CALLS_PER_RUN = Number(process.env.ARC_MARKET_CALLS_PER_RUN ?? "40");

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
  private readonly client: PublicClient;

  constructor(client?: PublicClient) {
    this.client =
      client ??
      createPublicClient({
        chain: arc,
        transport: http(process.env.ARC_RPC_URL ?? "https://rpc.mainnet.arc.io", { timeout: 20_000, retryCount: 2 }),
      });
  }

  async syncOnce() {
    const db = getDb();
    const freshSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const cap = BATCH * CALLS_PER_RUN;
    const ago = (ms: number) => new Date(Date.now() - ms);
    // Priority: tokens that trade (kept fresh, like a screener), fresh launches,
    // tokens never looked up yet (so every Arc token gets listed), then the stalest rest.
    const [active, fresh, unseen, stale] = await Promise.all([
      db.token.findMany({
        where: {
          arcMarket: {
            OR: [{ liquidityUsd: { gte: 100 } }, { volume24h: { gt: 0 } }],
            updatedAt: { lt: ago(90 * 1000) },
          },
        },
        select: { id: true, mint: true },
        orderBy: { arcMarket: { updatedAt: "asc" } },
        take: Math.round(cap * 0.4),
      }),
      db.token.findMany({
        where: { launchTime: { gte: freshSince }, OR: [{ arcMarket: null }, { arcMarket: { updatedAt: { lt: ago(3 * 60 * 1000) } } }] },
        select: { id: true, mint: true },
        orderBy: { launchTime: "desc" },
        take: Math.round(cap * 0.2),
      }),
      db.token.findMany({
        where: { arcMarket: null },
        select: { id: true, mint: true },
        orderBy: { launchTime: "desc" },
        take: Math.round(cap * 0.4),
      }),
      db.token.findMany({
        where: { arcMarket: { updatedAt: { lt: ago(6 * 60 * 60 * 1000) } } },
        select: { id: true, mint: true },
        orderBy: { arcMarket: { updatedAt: "asc" } },
        take: Math.round(cap * 0.2),
      }),
    ]);
    const queue = [...new Map([...active, ...fresh, ...unseen, ...stale].map((t) => [t.mint, t])).values()].slice(0, cap);

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
              // only overwrite an icon with a real one — never wipe one we found elsewhere
              ...(p.info?.imageUrl ? { imageUrl: p.info.imageUrl } : {}),
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
    const logos = await this.fillLogos().catch(() => 0);
    const icons = await this.fillIcons();
    return { queued: queue.length, updated, listed, logos, icons };
  }

  private readonly iconTried = new Set<string>();
  private readonly logoTried = new Set<string>();

  /** Icons the token sets on-chain (logo()), read in one multicall per batch. */
  private async fillLogos() {
    const db = getDb();
    const missing = await db.token.findMany({
      where: { imageUri: null, OR: [{ arcMarket: null }, { arcMarket: { imageUrl: null } }] },
      select: { id: true, mint: true },
      orderBy: [{ arcMarket: { volume24h: { sort: "desc", nulls: "last" } } }, { launchTime: "desc" }],
      take: LOGO_PER_RUN * 3,
    });
    const todo = missing.filter((t) => !this.logoTried.has(t.mint)).slice(0, LOGO_PER_RUN);
    if (todo.length === 0) return 0;
    const res = await this.client.multicall({
      allowFailure: true,
      contracts: todo.map((t) => ({ address: t.mint as Address, abi: LOGO_ABI, functionName: "logo" }) as const),
    });
    let found = 0;
    for (const [i, t] of todo.entries()) {
      this.logoTried.add(t.mint);
      const r = res[i];
      if (r?.status !== "success") continue;
      const uri = cleanText(String(r.result), 400);
      if (!/^(ipfs:\/\/|https:\/\/|ar:\/\/)\S+$/.test(uri)) continue;
      await db.token.update({ where: { id: t.id }, data: { imageUri: uri } });
      found++;
    }
    return found;
  }

  /** Icons for listed tokens that still have none, from GeckoTerminal (30 per call). */
  private async fillIcons() {
    const db = getDb();
    const missing = await db.token.findMany({
      where: { imageUri: null, arcMarket: { imageUrl: null, OR: [{ liquidityUsd: { gt: 0 } }, { volume24h: { gt: 0 } }] } },
      select: { id: true, mint: true },
      orderBy: { arcMarket: { volume24h: { sort: "desc", nulls: "last" } } },
      take: 600,
    });
    const todo = missing.filter((t) => !this.iconTried.has(t.mint)).slice(0, BATCH * GECKO_CALLS_PER_RUN);
    let found = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const res = await fetch(GECKO + batch.map((t) => t.mint).join(","), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (!res || res.status === 429) break;
      batch.forEach((t) => this.iconTried.add(t.mint));
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as {
        data?: Array<{ attributes?: { address?: string; image_url?: string | null } }>;
      } | null;
      for (const d of json?.data ?? []) {
        const addr = d.attributes?.address?.toLowerCase();
        const url = d.attributes?.image_url;
        const t = batch.find((x) => x.mint === addr);
        if (!t || !url || !/^https:\/\//.test(url) || url.includes("missing")) continue;
        await db.arcMarket.update({ where: { tokenId: t.id }, data: { imageUrl: url } });
        found++;
      }
    }
    return found;
  }
}

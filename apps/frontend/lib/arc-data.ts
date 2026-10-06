// Server-only module: imports Prisma via @clawdex/shared, never import from a client component.
import {
  arcBand,
  fakeReasons,
  getDb,
  type ArcBand,
  type ArcFlag,
  type SubScoreKey,
} from "@clawdex/shared"

/**
 * Read side of Riven. Scores come only from the backend pipeline's on-chain
 * analysis; market numbers (price, liquidity, volume, change) come from the
 * DexScreener snapshot and are display-only.
 */

export const EXPLORER = "https://explorer.arc.io"
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/"

export type { SortKey, BandFilter, AgeFilter, PadFilter, ScreenerFilters } from "./screener-params"
import { PAGE_SIZE, type AgeFilter, type ScreenerFilters } from "./screener-params"

export interface TokenSummary {
  address: string
  name: string
  symbol: string
  decimals: number
  image: string | null
  launchpad: string
  launchedAt: string
  priceUsd: number | null
  marketCap: number | null
  liquidityUsd: number | null
  usdcInPool: number | null
  volume: { m5: number | null; h1: number | null; h6: number | null; h24: number | null }
  change: { m5: number | null; h1: number | null; h6: number | null; h24: number | null }
  buys24h: number | null
  sells24h: number | null
  holders: number | null
  /** Published score, 1–10. */
  score: number | null
  band: ArcBand
  verdict: string
  dangers: string[]
  fake: boolean
  fakeReasons: string[]
  /** Other tokens on Arc using the same ticker. */
  copies: number
  dexUrl: string | null
  pairAddress: string | null
  scoredAt: string | null
}

export interface CreatorToken {
  address: string
  symbol: string
  name: string
  image: string | null
  launchedAt: string
  athX: number | null
  nowX: number | null
  athMarketCap: number | null
  score: number | null
  band: ArcBand
  status: "alive" | "dead" | "rugged"
}

export interface CreatorRecord {
  wallet: string
  launches: number
  alive: number
  dead: number
  rugged: number
  bestAthX: number | null
  tokens: CreatorToken[]
}

export interface TokenAlert {
  id: string
  type: string
  message: string
  createdAt: string
  token: { address: string; symbol: string; image: string | null }
}

export interface TokenDetail extends TokenSummary {
  creator: string
  launchTx: string | null
  links: string[]
  socials: Array<{ type: string; url: string }>
  subScores: Record<SubScoreKey, { points: number; max: number }> | null
  flags: ArcFlag[]
  confidence: string | null
  feePct: number | null
  topHolders: Array<{ address: string; pct: number; tag: string | null }>
  trades: Array<{ id: string; side: string; usdc: number; tokens: number; ts: string }>
  priceSeries: Array<{ t: number; p: number }>
  creatorRecord: CreatorRecord | null
  alerts: TokenAlert[]
  holderHistory: string | null
  /** Every other token using this ticker or name, oldest first. */
  copyList: TokenSummary[]
}

interface Signals {
  verdict?: string
  flags?: ArcFlag[]
  subScores?: Record<SubScoreKey, { points: number; max: number }>
  market?: { feePct?: number | null; poolUsdc?: number | null }
  inputs?: { holders?: { count?: number } | null }
  topHolders?: Array<{ address: string; pct: number; tag: string | null }>
}

export function imageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith("ipfs://")) return IPFS_GATEWAY + raw.slice("ipfs://".length)
  if (/^https?:\/\//i.test(raw)) return raw
  return null
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** arc-v2 rows predate flag codes: derive them from the (stable) flag text. */
const TEXT_CODES: Array<[RegExp, string]> = [
  [/^Volume looks fake/, "WASH"],
  [/^Holders own only/, "DEAD"],
  [/^Serial launcher/, "SERIAL"],
  [/^Creator dumped/, "CREATOR_DUMP"],
  [/^Liquidity has already been removed/, "LP_REMOVED"],
  [/^Liquidity is not locked/, "LP_UNLOCKED"],
  [/^Contract can still create/, "MINT"],
  [/^Contract is upgradeable/, "UPGRADE"],
  [/^Someone can pause/, "RESTRICT"],
  [/^No sells seen yet/, "NO_SELLS"],
  [/wallets funded by the creator/, "INSIDERS"],
  [/^Creator holds/, "CREATOR_HEAVY"],
  [/^Snipers/, "SNIPERS"],
  [/^Copycat/, "COPYCAT"],
]
/**
 * Names that only the real issuer would use. On Arc (Circle's chain) a random
 * token called "Circle" or "USDC" is impersonation, whatever its contract says.
 */
const BRANDS = /^(circle|usdc|usdt|eurc|tether|arc|arc network|coinbase|binance|uniswap|ethereum|eth|bitcoin|btc|solana|blackrock)$/i

/** Fake signals that need no holder history, so unscored tokens get caught too. */
function marketFakeReasons(t: { name: string; symbol: string }, vol24: number | null, usdcInPool: number | null): string[] {
  const out: string[] = []
  const brand = [t.name, t.symbol].map((x) => x.trim()).find((x) => BRANDS.test(x))
  if (brand) out.push(`Impersonates ${brand} — not an official token`)
  if (vol24 !== null && usdcInPool !== null && vol24 > 1000 && vol24 > 20 * Math.max(usdcInPool, 1)) {
    out.push(`Volume looks fake: $${Math.round(vol24).toLocaleString()} traded but only $${Math.round(usdcInPool)} in the pool`)
  }
  return out
}

function withCodes(flags: ArcFlag[] | undefined): ArcFlag[] {
  return (flags ?? []).map((f) =>
    f.code ? f : { ...f, code: TEXT_CODES.find(([re]) => re.test(f.text))?.[1] ?? "INFO" },
  )
}
const PAD_LABEL: Record<string, string> = { ARGUS: "Argus", TOLLY: "Tolly", OTHER: "Uniswap v4" }

const INCLUDE = {
  arcMarket: true,
  scoreRuns: { orderBy: { calculatedAt: "desc" as const }, take: 1 },
}

type TokenRow = Awaited<ReturnType<typeof rows>>[number]
async function rows(where: object, orderBy: object | object[], take: number) {
  return getDb().token.findMany({ where: { pools: { some: {} }, ...where }, orderBy, take, include: INCLUDE })
}

/** v2 rows were stored 0–100; v3+ store the 1–10 score directly. */
function scoreOf(run: { score: unknown; methodology: string | null } | undefined): number | null {
  if (!run) return null
  const s = Number(run.score)
  return run.methodology === "arc-v2" || run.methodology === null ? Math.max(1, Math.round(s) / 10) : s
}

/** How many other tokens share each ticker (case-insensitive), for copycat warnings. */
async function copyCounts(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))]
  if (unique.length === 0) return new Map()
  const rows = await getDb().token.findMany({
    where: { OR: unique.map((sym) => ({ symbol: { equals: sym, mode: "insensitive" as const } })) },
    select: { symbol: true },
  })
  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = r.symbol.trim().toLowerCase()
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

async function withCopies<T extends TokenSummary>(list: T[]): Promise<T[]> {
  const counts = await copyCounts(list.map((t) => t.symbol))
  return list.map((t) => ({ ...t, copies: Math.max(0, (counts.get(t.symbol.trim().toLowerCase()) ?? 1) - 1) }))
}

function summarize(t: TokenRow): TokenSummary {
  const run = t.scoreRuns[0]
  const sig = (run?.signals ?? {}) as Signals
  const flags = withCodes(sig.flags)
  const m = t.arcMarket
  const score = scoreOf(run)
  const socialsJson = (m?.socials ?? null) as { usdcInPool?: number | null } | null
  const usdcInPool = sig.market?.poolUsdc ?? socialsJson?.usdcInPool ?? null
  const scored = fakeReasons(flags)
  const reasons = [
    ...scored,
    ...marketFakeReasons(t, num(m?.volume24h), usdcInPool).filter(
      (r) => !(r.startsWith("Volume looks fake") && scored.some((x) => x.startsWith("Volume looks fake"))),
    ),
  ]
  return {
    address: t.mint,
    name: t.name || t.symbol || "Unnamed",
    symbol: t.symbol || "?",
    decimals: t.decimals ?? 18,
    image: imageUrl(t.imageUri ?? t.metadataUri) ?? imageUrl(m?.imageUrl),
    launchpad: PAD_LABEL[t.launchpad] ?? t.launchpad,
    launchedAt: t.launchTime.toISOString(),
    priceUsd: num(m?.priceUsd) ?? num(t.currentPrice),
    marketCap: num(m?.marketCap) ?? num(t.marketCap),
    liquidityUsd: num(m?.liquidityUsd),
    usdcInPool,
    volume: { m5: num(m?.volume5m), h1: num(m?.volume1h), h6: num(m?.volume6h), h24: num(m?.volume24h) },
    change: { m5: num(m?.change5m), h1: num(m?.change1h), h6: num(m?.change6h), h24: num(m?.change24h) },
    buys24h: m?.buys24h ?? null,
    sells24h: m?.sells24h ?? null,
    holders: sig.inputs?.holders?.count ?? null,
    score,
    band: score === null ? "unscored" : arcBand(score),
    verdict: sig.verdict ?? "Scoring… Riven is still reading this token's on-chain data.",
    dangers: flags.filter((f) => f.level === "danger").map((f) => f.text),
    fake: reasons.length > 0,
    fakeReasons: reasons,
    copies: 0,
    dexUrl: m?.dexUrl ?? null,
    pairAddress: m?.pairAddress ?? null,
    scoredAt: run ? run.calculatedAt.toISOString() : null,
  }
}

const AGE_MS: Record<Exclude<AgeFilter, "all">, number> = {
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000,
}

/**
 * The screener: every indexed Arc token, filtered and sorted like DexScreener.
 * Fake tokens (wash trading, dead, serial launcher, creator dump, pulled LP)
 * are hidden unless `showFake` is set — search always finds them.
 */
export async function getScreener(
  f: ScreenerFilters,
  pageSize = PAGE_SIZE,
): Promise<{ tokens: TokenSummary[]; total: number; page: number; pages: number }> {
  const market: Record<string, object> = {}
  if (f.minLiq > 0) market.liquidityUsd = { gte: f.minLiq }
  if (f.minVol > 0) market.volume24h = { gte: f.minVol }
  if (f.minMcap > 0 || f.maxMcap > 0)
    market.marketCap = { ...(f.minMcap > 0 ? { gte: f.minMcap } : {}), ...(f.maxMcap > 0 ? { lte: f.maxMcap } : {}) }
  const where: Record<string, unknown> = {}
  if (Object.keys(market).length) where.arcMarket = market
  if (f.pad !== "all") where.launchpad = f.pad
  if (f.age !== "all") where.launchTime = { gte: new Date(Date.now() - AGE_MS[f.age]) }

  const orderBy: object | object[] =
    f.sort === "new"
      ? { launchTime: "desc" }
      : f.sort === "gainers"
        ? { arcMarket: { change24h: { sort: "desc", nulls: "last" } } }
        : f.sort === "losers"
          ? { arcMarket: { change24h: { sort: "asc", nulls: "last" } } }
          : f.sort === "mcap"
            ? { arcMarket: { marketCap: { sort: "desc", nulls: "last" } } }
            : f.sort === "liquidity"
              ? { arcMarket: { liquidityUsd: { sort: "desc", nulls: "last" } } }
              : [{ arcMarket: { volume24h: { sort: "desc", nulls: "last" } } }, { launchTime: "desc" }]

  let list = (await rows(where, orderBy, f.sort === "safest" ? 1500 : 600)).map(summarize)
  if (!f.showFake) list = list.filter((t) => !t.fake)
  if (f.band !== "all") list = list.filter((t) => t.band === f.band)
  if (f.minScore > 0) list = list.filter((t) => (t.score ?? 0) >= f.minScore)
  if (f.sort === "safest") {
    list = list.filter((t) => t.score !== null)
    list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.volume.h24 ?? 0) - (a.volume.h24 ?? 0))
  }
  const pages = Math.max(1, Math.ceil(list.length / pageSize))
  const page = Math.min(f.page ?? 1, pages)
  const tokens = await withCopies(list.slice((page - 1) * pageSize, page * pageSize))
  return { tokens, total: list.length, page, pages }
}

export async function getStats() {
  const db = getDb()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [recent, total, listed, cursor] = await Promise.all([
    rows({ launchTime: { gte: since } }, { launchTime: "desc" }, 2000),
    db.token.count({ where: { pools: { some: {} } } }),
    db.arcMarket.count({ where: { liquidityUsd: { gt: 0 } } }),
    db.arcIndexerCursor.findUnique({ where: { source: "arc:activity" } }),
  ])
  const s = recent.map(summarize)
  const scored = s.filter((r) => r.score !== null)
  return {
    tokensTracked: total,
    listed,
    launches24h: s.length,
    scored24h: scored.length,
    fake24h: s.filter((r) => r.fake).length,
    healthy24h: scored.filter((r) => r.band === "healthy").length,
    risky24h: scored.filter((r) => r.band === "risk").length,
    lastBlock: cursor ? cursor.lastBlock.toString() : null,
    syncedAt: cursor ? cursor.updatedAt.toISOString() : null,
  }
}

export async function getTokensByAddress(addresses: string[]): Promise<TokenSummary[]> {
  const clean = addresses.map((a) => a.toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a))
  if (clean.length === 0) return []
  const found = await rows({ mint: { in: clean } }, { launchTime: "desc" }, clean.length)
  const byAddr = new Map((await withCopies(found.map(summarize))).map((r) => [r.address, r]))
  return clean.map((a) => byAddr.get(a)).filter((x): x is TokenSummary => !!x)
}

/** Search always includes fake tokens — that's the one place they're shown. */
export async function searchTokens(q: string): Promise<TokenSummary[]> {
  const query = q.trim()
  if (!query) return []
  if (/^0x[0-9a-fA-F]{40}$/.test(query)) return getTokensByAddress([query])
  const found = await rows(
    {
      OR: [
        { symbol: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    [{ arcMarket: { volume24h: { sort: "desc", nulls: "last" } } }, { launchTime: "desc" }],
    40,
  )
  return withCopies(found.map(summarize))
}

export async function getCreatorRecord(wallet: string): Promise<CreatorRecord | null> {
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return null
  const db = getDb()
  const tokens = await db.token.findMany({
    where: { deployerWallet: wallet },
    orderBy: { launchTime: "desc" },
    take: 60,
    include: { ...INCLUDE, pools: { select: { id: true } } },
  })
  if (tokens.length === 0) return null
  const poolIds = tokens.flatMap((t) => t.pools.map((p) => p.id))
  // Launch price = first trade's price; ATH = highest trade price we indexed.
  const [firsts, highs] = await Promise.all([
    db.arcSwap.findMany({
      where: { poolId: { in: poolIds }, priceUsd: { not: null } },
      orderBy: { blockNumber: "asc" },
      distinct: ["poolId"],
      select: { poolId: true, priceUsd: true },
    }),
    db.arcSwap.groupBy({ by: ["poolId"], where: { poolId: { in: poolIds } }, _max: { priceUsd: true } }),
  ])
  const firstBy = new Map(firsts.map((f) => [f.poolId, Number(f.priceUsd)]))
  const highBy = new Map(highs.map((h) => [h.poolId, num(h._max.priceUsd)]))
  const list: CreatorToken[] = tokens.map((t) => {
    const s = summarize(t)
    const poolId = t.pools[0]?.id
    const launch = poolId ? firstBy.get(poolId) ?? null : null
    const ath = poolId ? highBy.get(poolId) ?? null : null
    const sig = (t.scoreRuns[0]?.signals ?? {}) as Signals
    const codes = new Set(withCodes(sig.flags).map((f) => f.code))
    const athX = launch && ath ? ath / launch : null
    const nowX = launch && s.priceUsd ? s.priceUsd / launch : null
    const ageMs = Date.now() - t.launchTime.getTime()
    const quiet = ageMs > 24 * 3_600_000 && (s.volume.h24 ?? 0) < 1
    // Rugged: liquidity pulled. Dead: everyone sold, creator dumped, price down
    // over half from launch, or no trading for a day. Otherwise alive.
    const status: CreatorToken["status"] = codes.has("LP_REMOVED")
      ? "rugged"
      : codes.has("DEAD") || codes.has("CREATOR_DUMP") || (nowX !== null && nowX < 0.5) || quiet
        ? "dead"
        : "alive"
    const supply = Number(t.initialSupply)
    return {
      address: t.mint,
      symbol: s.symbol,
      name: s.name,
      image: s.image,
      launchedAt: s.launchedAt,
      athX,
      nowX,
      athMarketCap: ath && supply ? ath * supply : null,
      score: s.score,
      band: s.band,
      status,
    }
  })
  const athValues = list.map((x) => x.athX).filter((x): x is number => x !== null)
  return {
    wallet,
    launches: list.length,
    alive: list.filter((x) => x.status === "alive").length,
    dead: list.filter((x) => x.status === "dead").length,
    rugged: list.filter((x) => x.status === "rugged").length,
    bestAthX: athValues.length ? Math.max(...athValues) : null,
    tokens: list,
  }
}

export async function getAlerts(opts: { addresses?: string[]; limit?: number } = {}): Promise<TokenAlert[]> {
  const where = opts.addresses?.length
    ? { type: { in: ["RUG_PULL", "CREATOR_DUMP", "WHALE_DUMP", "SCORE_DROP"] as const }, token: { mint: { in: opts.addresses.map((a) => a.toLowerCase()) } } }
    : { type: { in: ["RUG_PULL", "CREATOR_DUMP", "WHALE_DUMP", "SCORE_DROP"] as const } }
  const list = await getDb().alert.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 60,
    include: { token: { include: { arcMarket: true } } },
  })
  return list.map((a) => ({
    id: a.id,
    type: a.type,
    message: a.message,
    createdAt: a.createdAt.toISOString(),
    token: {
      address: a.token.mint,
      symbol: a.token.symbol,
      image: imageUrl(a.token.imageUri ?? a.token.metadataUri) ?? imageUrl(a.token.arcMarket?.imageUrl),
    },
  }))
}

export async function getEcosystem() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recent = (await rows({ launchTime: { gte: since } }, { launchTime: "desc" }, 3000)).map(summarize)
  const pads = ["Argus", "Tolly", "Uniswap v4"].map((name) => {
    const list = recent.filter((t) => t.launchpad === name)
    const scored = list.filter((t) => t.score !== null)
    const best = [...list].filter((t) => !t.fake).sort((a, b) => (b.volume.h24 ?? 0) - (a.volume.h24 ?? 0))[0] ?? null
    return {
      name,
      launches: list.length,
      fakePct: list.length ? Math.round((list.filter((t) => t.fake).length / list.length) * 100) : 0,
      riskyPct: scored.length ? Math.round((scored.filter((t) => t.band === "risk").length / scored.length) * 100) : 0,
      healthy: scored.filter((t) => t.band === "healthy").length,
      volume24h: list.reduce((s, t) => s + (t.volume.h24 ?? 0), 0),
      best,
    }
  })
  const creators = new Map<string, number>()
  const db = getDb()
  const recentRows = await db.token.findMany({
    where: { launchTime: { gte: since }, deployerWallet: { not: "unknown" } },
    select: { deployerWallet: true },
  })
  for (const r of recentRows) creators.set(r.deployerWallet, (creators.get(r.deployerWallet) ?? 0) + 1)
  const serial = [...creators.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  return { pads, serial }
}

export async function getPortfolio(wallet: string) {
  const w = wallet.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(w)) return null
  const bals = await getDb().arcTokenBalance.findMany({
    where: { holder: w, balance: { gt: 0 } },
    include: { token: { include: INCLUDE } },
    take: 200,
  })
  const holdings = bals
    .map((b) => {
      const s = summarize({ ...b.token, pools: undefined } as unknown as TokenRow)
      const amount = Number(b.balance) / 10 ** (b.token.decimals ?? 18)
      return { token: s, amount, valueUsd: s.priceUsd !== null ? amount * s.priceUsd : null }
    })
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
  return {
    wallet: w,
    holdings,
    totalUsd: holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
    atRisk: holdings.filter((h) => h.token.band === "risk" || h.token.fake).length,
  }
}

export async function getTokenDetail(address: string): Promise<TokenDetail | null> {
  const mint = address.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(mint)) return null
  const db = getDb()
  const t = await db.token.findUnique({
    where: { mint },
    include: { pools: true, ...INCLUDE },
  })
  if (!t) return null
  const [summary] = await withCopies([summarize(t)])
  const sig = (t.scoreRuns[0]?.signals ?? {}) as Signals
  const pool = t.pools[0]
  const [swaps, creatorRecord, alerts, copyRows] = await Promise.all([
    pool ? db.arcSwap.findMany({ where: { poolId: pool.id }, orderBy: { blockNumber: "desc" }, take: 400 }) : [],
    getCreatorRecord(t.deployerWallet),
    getAlerts({ addresses: [mint], limit: 20 }),
    rows(
      {
        id: { not: t.id },
        OR: [
          { symbol: { equals: t.symbol.trim(), mode: "insensitive" } },
          { name: { equals: t.name.trim(), mode: "insensitive" } },
        ],
      },
      { launchTime: "asc" },
      12,
    ),
  ])
  const marketSocials = (t.arcMarket?.socials ?? null) as {
    websites?: string[]
    socials?: Array<{ type: string; url: string }>
  } | null
  return {
    ...summary,
    creator: t.deployerWallet,
    launchTx: t.launchTxHash,
    links: [...(Array.isArray(t.links) ? (t.links as string[]) : []), ...(marketSocials?.websites ?? [])],
    socials: marketSocials?.socials ?? [],
    subScores: sig.subScores ?? null,
    flags: withCodes(sig.flags),
    confidence: t.scoreRuns[0]?.confidence ?? null,
    feePct: sig.market?.feePct ?? null,
    topHolders: sig.topHolders ?? [],
    trades: swaps.slice(0, 25).map((w) => ({
      id: w.id,
      side: w.side,
      usdc: Number(w.usdcAmount),
      tokens: Number(w.tokenAmount),
      ts: w.ts.toISOString(),
    })),
    priceSeries: swaps
      .filter((w) => w.priceUsd !== null)
      .map((w) => ({ t: w.ts.getTime(), p: Number(w.priceUsd) }))
      .reverse(),
    creatorRecord: creatorRecord ? { ...creatorRecord, tokens: creatorRecord.tokens.filter((x) => x.address !== mint) } : null,
    alerts,
    holderHistory: t.holderHistory,
    copyList: copyRows.map(summarize),
  }
}

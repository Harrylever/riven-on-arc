// Server-only module: imports Prisma via @riven/shared, never import
// from a client component.
import { cached } from "./memo"
import { imageUrl } from "./ipfs"
import {
  ARC_METHODOLOGY,
  arcBand,
  deriveVerdict,
  getDb,
  withFlagCodes,
  type ArcBand,
  type ArcFlag,
  type SubScoreKey,
} from "@riven/shared"

/**
 * Read side of Riven. Scores come only from the backend pipeline's on-chain
 * analysis; market numbers (price, liquidity, volume, change) come from the
 * DexScreener snapshot and are display-only.
 */

export const EXPLORER = "https://explorer.arc.io"

export type {
  SortKey,
  BandFilter,
  AgeFilter,
  PadFilter,
  ScreenerFilters,
  ViewFilter,
} from "./screener-params"
import {
  PAGE_SIZE,
  type AgeFilter,
  type ScreenerFilters,
} from "./screener-params"

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
  volume: {
    m5: number | null
    h1: number | null
    h6: number | null
    h24: number | null
  }
  change: {
    m5: number | null
    h1: number | null
    h6: number | null
    h24: number | null
  }
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
  /** Machine codes behind fakeReasons (WASH, SERIAL, IMPERSONATION…), same order. */
  fakeCodes: string[]
  /** Other tokens on Arc using the same ticker. */
  copies: number
  dexUrl: string | null
  pairAddress: string | null
  scoredAt: string | null
  /** DexScreener listing extras: an enhanced profile, social links, active paid boosts. */
  profile: boolean
  community: boolean
  boosts: number
  socials: Array<{ type: string; url: string }>
  websites: string[]
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
  trades: Array<{
    id: string
    side: string
    usdc: number
    tokens: number
    ts: string
  }>
  priceSeries: Array<{ t: number; p: number }>
  creatorRecord: CreatorRecord | null
  alerts: TokenAlert[]
  holderHistory: string | null
  /** Which of the three inputs a score needs have been read from the chain yet. */
  measured: { contract: boolean; liquidity: boolean; holders: boolean }
  /** Every other token using this ticker or name, oldest first. */
  copyList: TokenSummary[]
}

interface Signals {
  verdict?: string
  flags?: ArcFlag[]
  subScores?: Record<SubScoreKey, { points: number; max: number }>
  market?: { feePct?: number | null; poolUsdc?: number | null }
  inputs?: {
    holders?: { count?: number } | null
    authority?: unknown
    lp?: unknown
  }
  topHolders?: Array<{ address: string; pct: number; tag: string | null }>
}

export { imageUrl }

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

// The verdict rules (flag codes, which old flags to trust, wash trading, impersonation) live in
// @riven/shared so the scorer, the market sync and this page cannot disagree.
const withCodes = withFlagCodes
const PAD_LABEL: Record<string, string> = {
  ARGUS: "Argus",
  TOLLY: "Tolly",
  OTHER: "Uniswap v4",
}

const INCLUDE = {
  arcMarket: true,
  scoreRuns: { orderBy: { calculatedAt: "desc" as const }, take: 1 },
}

/** What summarize() reads from a token's latest score run. */
interface RunLike {
  score: unknown
  methodology: string | null
  signals: unknown
  calculatedAt: Date
}

/**
 * The latest score run for each token, in one indexed query. Loading it as a nested relation made Prisma
 * fetch every historical run (and its large signals blob) for every token on the page: 2.4s for 15 rows.
 */
async function latestRuns(ids: string[]): Promise<Map<string, RunLike>> {
  if (ids.length === 0) return new Map()
  const found = await getDb().$queryRaw<
    Array<{ token_id: string; score: unknown; methodology: string | null; signals: unknown; calculated_at: Date }>
  >`
    SELECT DISTINCT ON (token_id) token_id, score, methodology, signals, calculated_at
    FROM score_runs WHERE token_id = ANY(${ids}::text[])
    ORDER BY token_id, calculated_at DESC`
  return new Map(
    found.map((r) => [r.token_id, { score: r.score, methodology: r.methodology, signals: r.signals, calculatedAt: r.calculated_at }]),
  )
}

async function withRuns<T extends { id: string }>(list: T[]): Promise<Array<T & { scoreRuns: RunLike[] }>> {
  const runs = await latestRuns(list.map((t) => t.id))
  return list.map((t) => ({ ...t, scoreRuns: runs.has(t.id) ? [runs.get(t.id)!] : [] }))
}

type TokenRow = Awaited<ReturnType<typeof rows>>[number]
async function rows(where: object, orderBy: object | object[], take: number) {
  const list = await getDb().token.findMany({
    where: { pools: { some: {} }, ...where },
    orderBy,
    take,
    include: { arcMarket: true },
  })
  return withRuns(list)
}

/** How many other tokens share each ticker (case-insensitive), for copycat warnings. */
async function copyCounts(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.map((s) => s.trim().toLowerCase()).filter(Boolean))]
  if (unique.length === 0) return new Map()
  // lower(symbol) is indexed (tokens_symbol_lower_idx); a case-insensitive ILIKE scanned every token.
  const found = await getDb().$queryRaw<Array<{ s: string; c: number }>>`
    SELECT lower(symbol) AS s, count(*)::int AS c
    FROM tokens WHERE lower(symbol) = ANY(${unique}::text[])
    GROUP BY 1`
  return new Map(found.map((r) => [r.s, r.c]))
}

async function withCopies<T extends TokenSummary>(list: T[]): Promise<T[]> {
  const counts = await copyCounts(list.map((t) => t.symbol))
  return list.map((t) => ({
    ...t,
    copies: Math.max(0, (counts.get(t.symbol.trim().toLowerCase()) ?? 1) - 1),
  }))
}

function summarize(t: TokenRow): TokenSummary {
  const run = t.scoreRuns[0]
  const sig = (run?.signals ?? {}) as Signals
  const flags = withCodes(sig.flags)
  const m = t.arcMarket
  const socialsJson = (m?.socials ?? null) as {
    usdcInPool?: number | null
    profile?: boolean
    community?: boolean
    boosts?: number
    socials?: Array<{ type: string; url: string }>
    websites?: string[]
  } | null
  const usdcInPool = sig.market?.poolUsdc ?? socialsJson?.usdcInPool ?? null
  const verdict = deriveVerdict({
    name: t.name,
    symbol: t.symbol,
    run: run ? { score: run.score, methodology: run.methodology, flags: sig.flags } : null,
    volume24h: num(m?.volume24h),
    usdcInPool,
  })
  const score = verdict.score
  const reasons = verdict.reasons
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
    volume: {
      m5: num(m?.volume5m),
      h1: num(m?.volume1h),
      h6: num(m?.volume6h),
      h24: num(m?.volume24h),
    },
    change: {
      m5: num(m?.change5m),
      h1: num(m?.change1h),
      h6: num(m?.change6h),
      h24: num(m?.change24h),
    },
    buys24h: m?.buys24h ?? null,
    sells24h: m?.sells24h ?? null,
    holders: sig.inputs?.holders?.count ?? null,
    score,
    band: score === null ? "unscored" : arcBand(score),
    verdict:
      sig.verdict ??
      "Scoring… Riven is still reading this token's on-chain data.",
    dangers: flags.filter((f) => f.level === "danger").map((f) => f.text),
    fake: reasons.length > 0,
    fakeReasons: reasons.map((r) => r.text),
    fakeCodes: reasons.map((r) => r.code),
    copies: 0,
    dexUrl: m?.dexUrl ?? null,
    pairAddress: m?.pairAddress ?? null,
    scoredAt: run ? run.calculatedAt.toISOString() : null,
    profile: !!socialsJson?.profile,
    community: !!socialsJson?.community || (socialsJson?.socials?.length ?? 0) > 0,
    boosts: socialsJson?.boosts ?? 0,
    socials: (socialsJson?.socials ?? []).filter((x) => /^https:\/\//.test(x.url)).slice(0, 4),
    websites: (socialsJson?.websites ?? []).filter((u) => /^https:\/\//.test(u)).slice(0, 2),
  }
}

const AGE_MS: Record<Exclude<AgeFilter, "all">, number> = {
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000,
}

interface ScreenerOpts {
  /** false skips the exact row count (3.5s over 83k tokens); `total` is then just the rows returned. */
  total?: boolean
}

/**
 * The screener: every indexed Arc token, filtered and sorted like DexScreener.
 * Fake tokens (wash trading, dead, serial launcher, creator dump, pulled LP)
 * are hidden in the default "listed" view; "caught" shows only them, with
 * the evidence. Search always finds them.
 */
async function getScreenerRaw(
  f: ScreenerFilters,
  pageSize = PAGE_SIZE,
  opts: ScreenerOpts = {},
): Promise<{
  tokens: TokenSummary[]
  total: number
  page: number
  pages: number
}> {
  const market: Record<string, object> = {}
  if (f.minLiq > 0) market.liquidityUsd = { gte: f.minLiq }
  if (f.minVol > 0) market.volume24h = { gte: f.minVol }
  if (f.minMcap > 0 || f.maxMcap > 0)
    market.marketCap = {
      ...(f.minMcap > 0 ? { gte: f.minMcap } : {}),
      ...(f.maxMcap > 0 ? { lte: f.maxMcap } : {}),
    }
  const where: Record<string, unknown> = {}
  // DexScreener listing extras (stored with the market snapshot)
  if (f.has === "profile") market.socials = { path: ["profile"], equals: true }
  else if (f.has === "community") market.socials = { path: ["community"], equals: true }
  else if (f.has === "boosted") market.socials = { path: ["boosts"], gt: 0 }
  if (Object.keys(market).length) where.arcMarket = market
  if (f.pad !== "all") where.launchpad = f.pad
  if (f.age !== "all")
    where.launchTime = { gte: new Date(Date.now() - AGE_MS[f.age]) }

  // The timeframe picks which market columns rank "trending" and "gainers".
  const sfx = { "5m": "5m", "1h": "1h", "6h": "6h", "24h": "24h" }[f.tf ?? "6h"]
  const vol = `volume${sfx}`
  const chg = `change${sfx}`
  const m = (field: string, sort: "asc" | "desc" = "desc") => ({
    arcMarket: { [field]: { sort, nulls: "last" } },
  })
  // DexScreener-style: every token is listed; the ones trading now rank first,
  // tokens with no market yet follow, newest first.
  const orderBy: object[] =
    f.sort === "new"
      ? [{ launchTime: "desc" }]
      : f.sort === "gainers"
        ? [m(chg), m("volume24h")]
        : f.sort === "losers"
          ? [m(chg, "asc"), m("volume24h")]
          : f.sort === "mcap"
            ? [m("marketCap"), m("volume24h")]
            : f.sort === "liquidity"
              ? [m("liquidityUsd"), m("volume24h")]
              : f.sort === "txns"
                ? [m("buys24h"), m("sells24h"), m("volume24h")]
                : f.sort === "volume"
                  ? [m("volume24h"), m("liquidityUsd")]
                  : [m(vol), m("volume24h"), m("liquidityUsd"), { launchTime: "desc" }]
  if (f.sort === "gainers" || f.sort === "losers") {
    // only tokens that actually traded in the window can gain or lose
    where.arcMarket = { ...(where.arcMarket as object), [chg]: { not: null } }
  }

  // Fast path (the default view): the database pages over every token.
  const needsScore = f.view !== "all" || f.band !== "all" || f.minScore > 0 || f.sort === "safest" || f.sort === "gap"
  if (!needsScore) {
    const db = getDb()
    const fullWhere = { pools: { some: {} }, ...where }
    const total = opts.total === false ? null : await db.token.count({ where: fullWhere })
    const pages = total === null ? Math.max(1, f.page ?? 1) : Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(f.page ?? 1, pages)
    const found = await db.token.findMany({
      where: fullWhere,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { arcMarket: true },
    })
    const tokens = await withCopies((await withRuns(found)).map(summarize))
    return { tokens, total: total ?? tokens.length, page, pages }
  }

  // Score-based views (Safest, Flagged, band and score filters) are answered from token_score_latest, which the
  // scorer and market sync keep current: an indexed lookup instead of loading and scoring thousands of tokens.
  if (f.sort !== "gap") {
    try {
      return await screenFromSummary(f, pageSize, where, orderBy, opts)
    } catch (err) {
      // Only before the migration has been applied: fall through to the slow in-memory path below.
      if (!isMissingSummaryTable(err)) throw err
    }
  }

  // Score-based views need the computed verdict, so filter in memory over the
  // most relevant slice.
  let list = (await rows(where, orderBy, 4000)).map(summarize)
  if (f.view === "listed") list = list.filter((t) => !t.fake)
  else if (f.view === "caught") list = list.filter((t) => t.fake)
  if (f.band !== "all") list = list.filter((t) => t.band === f.band)
  if (f.minScore > 0) list = list.filter((t) => (t.score ?? 0) >= f.minScore)
  if (f.sort === "safest") {
    list = list.filter((t) => t.score !== null)
    list.sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        (b.volume.h24 ?? 0) - (a.volume.h24 ?? 0),
    )
  }
  if (f.sort === "gap") {
    // How much of the headline "liquidity" is not real USDC: biggest gap first.
    const gap = (t: TokenSummary) => (t.liquidityUsd ?? 0) - (t.usdcInPool ?? 0)
    list = list.filter((t) => t.liquidityUsd !== null && t.usdcInPool !== null && gap(t) > 0)
    list.sort((a, b) => gap(b) - gap(a))
  }
  const pages = Math.max(1, Math.ceil(list.length / pageSize))
  const page = Math.min(f.page ?? 1, pages)
  const tokens = await withCopies(
    list.slice((page - 1) * pageSize, page * pageSize),
  )
  return { tokens, total: list.length, page, pages }
}

/** Chain-wide totals for the screener header, DexScreener-style. */
async function getMarketTotalsRaw() {
  const db = getDb()
  const [agg, tokens, trading] = await Promise.all([
    db.arcMarket.aggregate({ _sum: { volume24h: true, buys24h: true, sells24h: true, liquidityUsd: true } }),
    db.token.count({ where: { pools: { some: {} } } }),
    db.arcMarket.count({ where: { volume24h: { gt: 0 } } }),
  ])
  return {
    volume24h: Number(agg._sum.volume24h ?? 0),
    txns24h: (agg._sum.buys24h ?? 0) + (agg._sum.sells24h ?? 0),
    liquidity: Number(agg._sum.liquidityUsd ?? 0),
    tokens,
    trading,
  }
}

/** Just the indexer cursor — what the header's "ARC LIVE" badge needs. */
export async function getSyncStatus() {
  const cursor = await getDb().arcIndexerCursor.findUnique({
    where: { source: "arc:activity" },
  })
  return {
    lastBlock: cursor ? cursor.lastBlock.toString() : null,
    syncedAt: cursor ? cursor.updatedAt.toISOString() : null,
  }
}

async function getStatsRaw() {
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
  // What the flagged launches were caught doing, most common first.
  const byCode = new Map<string, number>()
  for (const r of s)
    for (const c of new Set(r.fakeCodes))
      byCode.set(c, (byCode.get(c) ?? 0) + 1)
  return {
    tokensTracked: total,
    listed,
    launches24h: s.length,
    scored24h: scored.length,
    fake24h: s.filter((r) => r.fake).length,
    healthy24h: scored.filter((r) => r.band === "healthy").length,
    caution24h: scored.filter((r) => r.band === "caution").length,
    risky24h: scored.filter((r) => r.band === "risk").length,
    volume24h: s.reduce((sum, r) => sum + (r.volume.h24 ?? 0), 0),
    reasons24h: [...byCode.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count })),
    lastBlock: cursor ? cursor.lastBlock.toString() : null,
    syncedAt: cursor ? cursor.updatedAt.toISOString() : null,
  }
}

export async function getTokensByAddress(
  addresses: string[],
): Promise<TokenSummary[]> {
  const clean = addresses
    .map((a) => a.toLowerCase())
    .filter((a) => /^0x[0-9a-f]{40}$/.test(a))
  if (clean.length === 0) return []
  const found = await rows(
    { mint: { in: clean } },
    { launchTime: "desc" },
    clean.length,
  )
  const byAddr = new Map(
    (await withCopies(found.map(summarize))).map((r) => [r.address, r]),
  )
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
    [
      { arcMarket: { volume24h: { sort: "desc", nulls: "last" } } },
      { launchTime: "desc" },
    ],
    40,
  )
  return withCopies(found.map(summarize))
}

export async function getCreatorRecord(
  wallet: string,
): Promise<CreatorRecord | null> {
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
    db.arcSwap.groupBy({
      by: ["poolId"],
      where: { poolId: { in: poolIds } },
      _max: { priceUsd: true },
    }),
  ])
  const firstBy = new Map(firsts.map((f) => [f.poolId, Number(f.priceUsd)]))
  const highBy = new Map(highs.map((h) => [h.poolId, num(h._max.priceUsd)]))
  const list: CreatorToken[] = tokens.map((t) => {
    const s = summarize(t)
    const poolId = t.pools[0]?.id
    const launch = poolId ? (firstBy.get(poolId) ?? null) : null
    const ath = poolId ? (highBy.get(poolId) ?? null) : null
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
      : codes.has("DEAD") ||
          codes.has("CREATOR_DUMP") ||
          (nowX !== null && nowX < 0.5) ||
          quiet
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
  const athValues = list
    .map((x) => x.athX)
    .filter((x): x is number => x !== null)
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

async function getAlertsRaw(
  opts: { addresses?: string[]; limit?: number } = {},
): Promise<TokenAlert[]> {
  const where = opts.addresses?.length
    ? {
        type: {
          in: ["RUG_PULL", "CREATOR_DUMP", "WHALE_DUMP", "SCORE_DROP"] as const,
        },
        token: { mint: { in: opts.addresses.map((a) => a.toLowerCase()) } },
      }
    : {
        type: {
          in: ["RUG_PULL", "CREATOR_DUMP", "WHALE_DUMP", "SCORE_DROP"] as const,
        },
      }
  const list = await getDb().alert.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 60,
    include: { token: { include: { arcMarket: true } } },
  })
  return list.map((a) => ({
    id: a.id,
    type: a.type,
    // evidence wording, also for alerts stored before the wording change
    message: a.message.replace(/\bdumped\b/g, "sold"),
    createdAt: a.createdAt.toISOString(),
    token: {
      address: a.token.mint,
      symbol: a.token.symbol,
      image:
        imageUrl(a.token.imageUri ?? a.token.metadataUri) ??
        imageUrl(a.token.arcMarket?.imageUrl),
    },
  }))
}

export async function getEcosystem() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recent = (
    await rows({ launchTime: { gte: since } }, { launchTime: "desc" }, 3000)
  ).map(summarize)
  const pads = ["Argus", "Tolly", "Uniswap v4"].map((name) => {
    const list = recent.filter((t) => t.launchpad === name)
    const scored = list.filter((t) => t.score !== null)
    const best =
      [...list]
        .filter((t) => !t.fake)
        .sort((a, b) => (b.volume.h24 ?? 0) - (a.volume.h24 ?? 0))[0] ?? null
    return {
      name,
      launches: list.length,
      fakePct: list.length
        ? Math.round((list.filter((t) => t.fake).length / list.length) * 100)
        : 0,
      riskyPct: scored.length
        ? Math.round(
            (scored.filter((t) => t.band === "risk").length / scored.length) *
              100,
          )
        : 0,
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
  for (const r of recentRows)
    creators.set(r.deployerWallet, (creators.get(r.deployerWallet) ?? 0) + 1)
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
      const s = summarize({
        ...b.token,
        pools: undefined,
      } as unknown as TokenRow)
      const amount = Number(b.balance) / 10 ** (b.token.decimals ?? 18)
      return {
        token: s,
        amount,
        valueUsd: s.priceUsd !== null ? amount * s.priceUsd : null,
      }
    })
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
  return {
    wallet: w,
    holdings,
    totalUsd: holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
    atRisk: holdings.filter((h) => h.token.band === "risk" || h.token.fake)
      .length,
  }
}

export async function getTokenDetail(
  address: string,
): Promise<TokenDetail | null> {
  const mint = address.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(mint)) return null
  const db = getDb()
  const t = await db.token.findUnique({
    where: { mint },
    include: { pools: { orderBy: { createdAt: "asc" } }, ...INCLUDE },
  })
  if (!t) return null
  const [summary] = await withCopies([summarize(t)])
  const sig = (t.scoreRuns[0]?.signals ?? {}) as Signals
  const pool = t.pools[0]
  const [swaps, creatorRecord, alerts, copyRows] = await Promise.all([
    pool
      ? db.arcSwap.findMany({
          where: { poolId: pool.id },
          orderBy: { blockNumber: "desc" },
          take: 400,
        })
      : [],
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
    links: [
      ...(Array.isArray(t.links) ? (t.links as string[]) : []),
      ...(marketSocials?.websites ?? []),
    ],
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
    creatorRecord: creatorRecord
      ? {
          ...creatorRecord,
          tokens: creatorRecord.tokens.filter((x) => x.address !== mint),
        }
      : null,
    alerts,
    holderHistory: t.holderHistory,
    measured: {
      contract: sig.inputs?.authority != null,
      liquidity: sig.inputs?.lp != null,
      holders: sig.inputs?.holders != null,
    },
    copyList: copyRows.map(summarize),
  }
}

export interface Callout {
  id: string
  author: string
  authorName: string | null
  text: string
  url: string
  postedAt: string
  likes: number | null
  reposts: number | null
  token: TokenSummary
}

async function getCalloutsRaw(limit: number, tokenAddress?: string): Promise<Callout[]> {
  const db = getDb()
  const rows = await db.arcCallout.findMany({
    where: tokenAddress ? { token: { mint: tokenAddress.toLowerCase() } } : undefined,
    orderBy: { postedAt: "desc" },
    take: limit,
    include: { token: { include: INCLUDE } },
  })
  const summaries = await withCopies(rows.map((r) => summarize(r.token as TokenRow)))
  return rows.map((r, i) => ({
    id: r.id,
    author: r.author,
    authorName: r.authorName,
    text: r.text,
    url: r.url,
    postedAt: r.postedAt.toISOString(),
    likes: r.likes,
    reposts: r.reposts,
    token: summaries[i]!,
  }))
}

/** Latest KOL callouts on X, newest first, each with the token's live Riven summary. Cached a minute, shared. */
export const getCallouts = (limit = 12, tokenAddress?: string): Promise<Callout[]> =>
  cached(`callouts:${limit}:${tokenAddress?.toLowerCase() ?? ""}`, 60_000, () => getCalloutsRaw(limit, tokenAddress), { shared: true })

/**
 * Arc in numbers for the home page — things only Arc makes possible to measure
 * this way: every pool is quoted in USDC (Arc's gas token), so "real dollars a
 * seller can exit into" is one on-chain read per pool.
 */
async function getArcPulseRaw() {
  const db = getDb()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [byType, markets, liveCalls, rescans] = await Promise.all([
    db.alert.groupBy({ by: ["type"], where: { createdAt: { gte: since } }, _count: true }),
    db.arcMarket.findMany({ where: { volume24h: { gt: 0 } }, select: { socials: true, liquidityUsd: true } }),
    db.perpSignal.count({ where: { outcome: "pending" } }).catch(() => 0),
    // Distinct tokens, not rows: old runs are pruned, so a row count would shrink as the table is cleaned.
    db.$queryRaw<Array<{ n: bigint }>>`SELECT count(DISTINCT token_id) AS n FROM score_runs WHERE calculated_at >= ${since}`,
  ])
  const count = (t: string) => byType.find((x) => x.type === t)?._count ?? 0
  const realUsdc = markets.reduce((sum, m) => {
    const v = (m.socials as { usdcInPool?: number | null } | null)?.usdcInPool
    return sum + (typeof v === "number" && Number.isFinite(v) ? v : 0)
  }, 0)
  // What DexScreener-style feeds call "liquidity" for the same pools: the headline Riven contradicts.
  const reportedLiquidity = markets.reduce((sum, m) => sum + (num(m.liquidityUsd) ?? 0), 0)
  return {
    reportedLiquidityUsd: reportedLiquidity,
    liquidityPulls24h: count("RUG_PULL"),
    creatorSells24h: count("CREATOR_DUMP"),
    whaleSells24h: count("WHALE_DUMP"),
    realUsdcInTradingPools: realUsdc,
    tradingPools: markets.length,
    livePerpCalls: liveCalls,
    scoresComputed24h: Number(rescans[0]?.n ?? 0),
  }
}

/**
 * Does the score warn in time? For every token first scored under the current
 * methodology: what band it got, and whether liquidity was pulled or the creator
 * sold out AFTER that first score. Alerts that fired before the first score
 * can't be "predicted", so they are counted apart and left out of the rates.
 */
export interface AccuracyRow {
  band: "healthy" | "caution" | "risk"
  scored: number
  badAfter: number
}
async function getAccuracyRaw() {
  const db = getDb()
  const first = await db.scoreRun.findMany({
    where: { methodology: ARC_METHODOLOGY, band: { in: ["healthy", "caution", "risk"] } },
    orderBy: { calculatedAt: "asc" },
    distinct: ["tokenId"],
    select: { tokenId: true, band: true, calculatedAt: true },
  })
  const bad = await db.alert.findMany({
    where: { type: { in: ["RUG_PULL", "CREATOR_DUMP"] } },
    select: { tokenId: true, createdAt: true },
  })
  const firstBad = new Map<string, Date>()
  for (const a of bad) {
    const have = firstBad.get(a.tokenId)
    if (!have || a.createdAt < have) firstBad.set(a.tokenId, a.createdAt)
  }
  const rows = new Map<string, AccuracyRow>(
    (["risk", "caution", "healthy"] as const).map((band) => [band, { band, scored: 0, badAfter: 0 }]),
  )
  let alreadyHappened = 0
  for (const r of first) {
    const row = rows.get(r.band ?? "")
    if (!row) continue
    const hit = firstBad.get(r.tokenId)
    if (hit && hit <= r.calculatedAt) {
      alreadyHappened++
      continue
    }
    row.scored++
    if (hit) row.badAfter++
  }
  const bands = [...rows.values()]
  const totalBad = bands.reduce((s, r) => s + r.badAfter, 0)
  const warned = bands.filter((r) => r.band !== "healthy").reduce((s, r) => s + r.badAfter, 0)
  return {
    methodology: ARC_METHODOLOGY,
    bands,
    scored: bands.reduce((s, r) => s + r.scored, 0),
    totalBad,
    /** Share of later pulls/dumps that were already rated Caution or Risk at first score. */
    caughtShare: totalBad > 0 ? warned / totalBad : null,
    alreadyHappened,
    since: first[0]?.calculatedAt.toISOString() ?? null,
  }
}

export const getAccuracy = () => cached("accuracy", 300_000, () => getAccuracyRaw(), { shared: true })

export const getStats = () => cached("stats", 60_000, () => getStatsRaw(), { shared: true })

export const getArcPulse = () => cached("pulse", 60_000, () => getArcPulseRaw(), { shared: true })

export const getMarketTotals = () => cached("totals", 60_000, () => getMarketTotalsRaw(), { shared: true })

const isMissingSummaryTable = (err: unknown) =>
  (err as { code?: string })?.code === "P2021" || /token_score_latest/.test(String((err as Error)?.message))

/** Flagged = a trusted score flag or a market/name flag; no row at all means not scored and not flagged. */
const FLAGGED = { OR: [{ scoreCodes: { isEmpty: false } }, { marketCodes: { isEmpty: false } }] }
const NOT_FLAGGED = { scoreCodes: { isEmpty: true }, marketCodes: { isEmpty: true } }

async function screenFromSummary(
  f: ScreenerFilters,
  pageSize: number,
  where: Record<string, unknown>,
  orderBy: object | object[],
  opts: ScreenerOpts,
) {
  const db = getDb()
  const and: object[] = []
  if (f.view === "caught") and.push({ scoreLatest: { is: FLAGGED } })
  if (f.view === "listed") and.push({ OR: [{ scoreLatest: { is: null } }, { scoreLatest: { is: NOT_FLAGGED } }] })
  if (f.band === "unscored") and.push({ OR: [{ scoreLatest: { is: null } }, { scoreLatest: { is: { score: null } } }] })
  else if (f.band !== "all") and.push({ scoreLatest: { is: { band: f.band } } })
  if (f.minScore > 0) and.push({ scoreLatest: { is: { score: { gte: f.minScore } } } })
  if (f.sort === "safest") and.push({ scoreLatest: { is: { score: { not: null } } } })
  const order =
    f.sort === "safest"
      ? [{ scoreLatest: { score: { sort: "desc" as const, nulls: "last" as const } } }, { arcMarket: { volume24h: { sort: "desc" as const, nulls: "last" as const } } }]
      : orderBy
  const fullWhere = { pools: { some: {} }, ...where, AND: and }
  const total = opts.total === false ? null : await db.token.count({ where: fullWhere })
  const pages = total === null ? Math.max(1, f.page ?? 1) : Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(f.page ?? 1, pages)
  const found = await db.token.findMany({
    where: fullWhere,
    orderBy: order,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { arcMarket: true },
  })
  const tokens = await withCopies((await withRuns(found)).map(summarize))
  return { tokens, total: total ?? tokens.length, page, pages }
}

/** Screener lists, cached for a minute per filter set and shared across instances. */
export const getScreener = (f: ScreenerFilters, pageSize = PAGE_SIZE, opts: ScreenerOpts = {}) =>
  cached(`screener:${JSON.stringify(f)}:${pageSize}:${opts.total === false ? "n" : "t"}`, 60_000, () => getScreenerRaw(f, pageSize, opts), { shared: true })

export interface MarketsSummary {
  volume24h: number
  trading: number
  liquidity: number
  /** Approximate (the planner's row estimate): counting 83k tokens exactly takes seconds. */
  tokens: number
  launches24h: number
  flaggedTotal: number
  flagged24h: number
  syncedAt: string | null
}

async function getMarketsSummaryRaw(): Promise<MarketsSummary> {
  const db = getDb()
  const since = new Date(Date.now() - 24 * 3_600_000)
  const [m, est, launches, flaggedTotal, flagged24h, cursor] = await Promise.all([
    db.$queryRaw<Array<{ v: unknown; trading: bigint; liq: unknown }>>`
      SELECT COALESCE(sum(volume_24h), 0) AS v, count(*) FILTER (WHERE volume_24h > 0) AS trading, COALESCE(sum(liquidity_usd), 0) AS liq
      FROM arc_markets`,
    db.$queryRaw<Array<{ n: bigint }>>`SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'tokens'`,
    db.token.count({ where: { launchTime: { gte: since } } }),
    db.tokenScoreLatest.count({ where: FLAGGED }),
    db.tokenScoreLatest.count({ where: { AND: [FLAGGED, { token: { launchTime: { gte: since } } }] } }),
    db.arcIndexerCursor.findUnique({ where: { source: "arc:activity" } }),
  ])
  return {
    volume24h: Number(m[0]?.v ?? 0),
    trading: Number(m[0]?.trading ?? 0),
    liquidity: Number(m[0]?.liq ?? 0),
    tokens: Number(est[0]?.n ?? 0),
    launches24h: launches,
    flaggedTotal,
    flagged24h,
    syncedAt: cursor ? cursor.updatedAt.toISOString() : null,
  }
}
export const getMarketsSummary = () => cached("markets-summary", 60_000, () => getMarketsSummaryRaw(), { shared: true })

export const getAlerts = (
  opts: { addresses?: string[]; limit?: number } = {},
) =>
  cached(`alerts:${JSON.stringify(opts)}`, 60_000, () => getAlertsRaw(opts), { shared: true })

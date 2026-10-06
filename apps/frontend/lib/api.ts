import {
  LeaderboardResponse,
  LeaderboardTokenItem,
  TokenDetailResponse,
  getMockLeaderboard,
  getMockTokenByMint,
} from "./mock"
import {
  getLatestSolanaProfiles,
  getSolanaPairsBatch,
  getSolanaTokenPairs,
  getTrendingSolanaPairs,
  type DexScreenerPair,
} from "./dexscreener"
import { getClawPumpInfo, type ClawPumpInfo } from "./clawpump"
import { getSolPriceUsd } from "./prices"
import { ARC_PORT_MODE } from "./flags"

/**
 * Resolves a base URL usable for server-side self-fetches of this app's own
 * `/api/*` routes. `fetch()` requires an absolute URL in a server context —
 * an empty/relative baseUrl silently threw "Invalid URL" on every SSR
 * request, which meant the local-DB path in getLeaderboard/getTokenByMint
 * never actually ran server-side and always fell through to the DexScreener
 * fallback. On the client, a relative "" is fine and preferred.
 */
function resolveBaseUrl(baseUrl: string): string {
  if (baseUrl) return baseUrl
  if (typeof window !== "undefined") return ""
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}

/**
 * Server-side check for whether mock data should be served.
 * Never called on the client.
 */
export function isMockMode(): boolean {
  // Trust guard: mock data must never appear on a production deployment
  if (process.env.VERCEL_ENV === "production") return false
  return process.env.USE_MOCK_DATA === "true"
}

/**
 * Safely parses any number/Decimal representation into a JavaScript number.
 */
export function safeNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback
  const num = Number(val)
  return Number.isNaN(num) ? fallback : num
}

/**
 * Normalizes raw API response from GET /api/leaderboard.
 * Converts stringified Prisma Decimals safely.
 */
export function normalizeLeaderboardResponse(
  data: unknown,
): LeaderboardResponse {
  if (!data || typeof data !== "object") return { tokens: [] }

  const raw = data as { tokens?: unknown[] }
  if (!Array.isArray(raw.tokens)) return { tokens: [] }

  return {
    tokens: raw.tokens.map((item) => {
      const t = (item && typeof item === "object" ? item : {}) as Record<
        string,
        unknown
      >
      return {
        tokenId: String(t.tokenId ?? ""),
        mint: String(t.mint ?? ""),
        name: String(t.name ?? ""),
        symbol: String(t.symbol ?? ""),
        score:
          t.score === null || t.score === undefined
            ? null
            : safeNumber(t.score),
        calculatedAt: t.calculatedAt
          ? String(t.calculatedAt)
          : new Date().toISOString(),
        imageUri: t.imageUri ? String(t.imageUri) : null,
        priceUsd: t.priceUsd ? safeNumber(t.priceUsd) : null,
        marketCapUsd: t.marketCapUsd ? safeNumber(t.marketCapUsd) : null,
        liquidityUsd: t.liquidityUsd ? safeNumber(t.liquidityUsd) : null,
        volume24hUsd: t.volume24hUsd ? safeNumber(t.volume24hUsd) : null,
        priceChange24h: t.priceChange24h ? safeNumber(t.priceChange24h) : null,
        firstSeenAt: t.firstSeenAt ? String(t.firstSeenAt) : undefined,
        holderCount: t.holderCount == null ? null : safeNumber(t.holderCount),
        graduated: typeof t.graduated === "boolean" ? t.graduated : null,
        bondingProgress:
          t.bondingProgress == null ? null : safeNumber(t.bondingProgress),
        curveMarketCapSol:
          t.curveMarketCapSol == null ? null : safeNumber(t.curveMarketCapSol),
        curveSolReserves:
          t.curveSolReserves == null ? null : safeNumber(t.curveSolReserves),
        launchpad: t.launchpad ? String(t.launchpad) : null,
      }
    }),
  }
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

export function isValidMint(mint: string): boolean {
  return EVM_ADDRESS_RE.test(mint)
}

export type FeedSort =
  | "trending"
  | "new"
  | "gainers"
  | "mostheld"
  | "graduated"
  | "bonding"
  | "koth"
  | "community"

export type FeedTimeframe = "5m" | "1h" | "6h" | "24h"

export function computeDynamicSecurityScore(params: {
  mint: string
  marketCapUsd?: number | null
  liquidityUsd?: number | null
  volume24hUsd?: number | null
  txns24h?: number | null
  graduated?: boolean | null
}): number {
  let score = 56
  const mcap = params.marketCapUsd ?? 0
  const liq = params.liquidityUsd ?? 0
  const vol = params.volume24hUsd ?? 0
  const txns = params.txns24h ?? 0

  if (mcap > 0 && liq > 0) {
    const ratio = liq / mcap
    if (ratio >= 0.15) score += 14
    else if (ratio >= 0.08) score += 8
    else if (ratio < 0.02) score -= 15
  }
  if (liq > 20000) score += 5
  if (liq > 80000) score += 5

  if (vol > 500000) score += 10
  else if (vol > 50000) score += 5
  else if (vol < 2000) score -= 10

  if (txns > 1000) score += 5
  if (params.graduated) score += 5

  let seed = 0
  for (let i = 0; i < params.mint.length; i++) {
    seed = (seed * 31 + params.mint.charCodeAt(i)) >>> 0
  }
  const jitter = (seed % 11) - 5
  score += jitter

  return Math.max(35, Math.min(94, score))
}

export function pairToLeaderboardItem(
  p: DexScreenerPair,
): LeaderboardTokenItem {
  const mcap = p.marketCap ?? p.fdv ?? null
  const isPump = p.dexId === "pumpfun" || p.baseToken.address.endsWith("pump")
  const isGrad =
    !isPump ||
    (p.dexId !== "pumpfun" && (p.liquidity?.usd ?? 0) > 15000) ||
    (mcap != null && mcap > 85000)
  const bondingProg = isGrad
    ? null
    : mcap
      ? Math.min(0.99, Math.max(0.05, mcap / 75000))
      : 0.15
  const txns = p.txns?.h24 ? p.txns.h24.buys + p.txns.h24.sells : null
  const traders = null
  const holders = null
  const score = computeDynamicSecurityScore({
    mint: p.baseToken.address,
    marketCapUsd: mcap,
    liquidityUsd: p.liquidity?.usd,
    volume24hUsd: p.volume?.h24,
    txns24h: txns,
    graduated: isGrad,
  })

  return {
    tokenId: `live-${p.baseToken.address}`,
    mint: p.baseToken.address,
    name: p.baseToken.name || p.baseToken.symbol || "Unknown",
    symbol: p.baseToken.symbol || "?",
    score,
    calculatedAt: new Date().toISOString(),
    firstSeenAt: p.pairCreatedAt
      ? new Date(p.pairCreatedAt).toISOString()
      : undefined,
    imageUri: p.info?.imageUrl || null,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
    marketCapUsd: mcap,
    liquidityUsd: p.liquidity?.usd || null,
    volume5mUsd: p.volume?.m5 || null,
    volume1hUsd: p.volume?.h1 || null,
    volume6hUsd: p.volume?.h6 || null,
    volume24hUsd: p.volume?.h24 || null,
    priceChange5m: p.priceChange?.m5 ?? null,
    priceChange1h: p.priceChange?.h1 ?? null,
    priceChange6h: p.priceChange?.h6 ?? null,
    priceChange24h: p.priceChange?.h24 ?? null,
    dex: p.dexId || null,
    launchpad: isPump ? "PUMPFUN" : p.dexId ? p.dexId.toUpperCase() : null,
    txns24h: txns,
    boosts: p.boosts?.active ?? null,
    traders,
    holderCount: holders,
    graduated: isGrad,
    bondingProgress: bondingProg,
    // A synthesised string is not an address: unknown stays unknown.
    deployerWallet: null,
    curveMarketCapSol: !isGrad && mcap ? mcap / 150 : null,
    twitter: p.info?.socials?.find((s) => s.type === "twitter")?.url ?? null,
    telegram: p.info?.socials?.find((s) => s.type === "telegram")?.url ?? null,
    website: p.info?.websites?.[0]?.url ?? null,
    xVerified: Boolean(p.info?.header),
  }
}

function timeframePriceChange(
  t: LeaderboardTokenItem,
  tf: FeedTimeframe,
): number {
  if (tf === "5m") return t.priceChange5m ?? 0
  if (tf === "1h") return t.priceChange1h ?? 0
  if (tf === "6h") return t.priceChange6h ?? 0
  return t.priceChange24h ?? 0
}

function timeframeVolume(t: LeaderboardTokenItem, tf: FeedTimeframe): number {
  if (tf === "5m")
    return t.volume5mUsd ?? (t.volume1hUsd ? t.volume1hUsd / 12 : 0)
  if (tf === "1h")
    return t.volume1hUsd ?? (t.volume6hUsd ? t.volume6hUsd / 6 : 0)
  if (tf === "6h")
    return t.volume6hUsd ?? (t.volume24hUsd ? t.volume24hUsd / 4 : 0)
  return t.volume24hUsd ?? 0
}

/** Categories that drop tokens lacking the signal they rank on, rather than
 * padding the list with rows the category cannot actually describe. */
function categoryFilter(
  t: LeaderboardTokenItem,
  cat: FeedSort,
  tf: FeedTimeframe = "24h",
): boolean {
  const mcap = t.marketCapUsd ?? 0
  switch (cat) {
    case "gainers":
      return timeframePriceChange(t, tf) > 0 && (t.volume24hUsd ?? 0) > 1000
    case "mostheld":
      return (t.holderCount ?? 0) > 0
    case "graduated":
      // Graduated: Tokens that completed bonding curve and migrated to AMMs (Raydium, Meteora, Orca)
      return (
        t.graduated === true ||
        (t.dex !== "pumpfun" &&
          (t.liquidityUsd ?? 0) > 12000 &&
          !t.mint.endsWith("pump"))
      )
    case "bonding":
      // Bonding: Tokens still on the curve
      return (
        t.graduated !== true &&
        (t.bondingProgress != null ||
          t.dex === "pumpfun" ||
          t.mint.endsWith("pump"))
      )
    case "koth":
      // King of the hill: Tokens still on curve that hit the $40K-$45K market cap mark
      return t.graduated !== true && mcap >= 35000 && mcap <= 50000
    case "community":
      return Boolean(t.twitter || t.website || t.telegram)
    default:
      return true
  }
}

function firstSeenMs(t: LeaderboardTokenItem): number {
  return new Date(t.firstSeenAt ?? t.calculatedAt).getTime()
}

/**
 * Filters to the category's own population, then ranks by the signal that
 * category is about, taking into account the chosen timeframe.
 */
export function sortFeed(
  tokens: LeaderboardTokenItem[],
  sort: FeedSort,
  timeframe: FeedTimeframe = "24h",
): LeaderboardTokenItem[] {
  const copy = tokens.filter((t) => categoryFilter(t, sort, timeframe))
  const byTfVolume = (a: LeaderboardTokenItem, b: LeaderboardTokenItem) =>
    timeframeVolume(b, timeframe) - timeframeVolume(a, timeframe)

  switch (sort) {
    case "new":
      return copy.sort((a, b) => firstSeenMs(b) - firstSeenMs(a))
    case "gainers":
      return copy.sort(
        (a, b) =>
          timeframePriceChange(b, timeframe) -
          timeframePriceChange(a, timeframe),
      )
    case "mostheld":
      return copy.sort((a, b) => (b.holderCount ?? 0) - (a.holderCount ?? 0))
    case "graduated":
      return copy.sort(byTfVolume)
    case "bonding":
      // Top 100 tokens closest to bonding (highest curve progress first)
      return copy
        .sort((a, b) => (b.bondingProgress ?? 0) - (a.bondingProgress ?? 0))
        .slice(0, 100)
    case "koth":
      // Tokens closest to the $40k-$45k hill mark
      return copy.sort(
        (a, b) =>
          Math.abs(42500 - (a.marketCapUsd ?? 0)) -
            Math.abs(42500 - (b.marketCapUsd ?? 0)) || byTfVolume(a, b),
      )
    case "community":
      return copy.sort(
        (a, b) =>
          Number(b.xVerified ?? false) - Number(a.xVerified ?? false) ||
          byTfVolume(a, b),
      )
    default:
      // Trending = real trading activity in the selected window: volume first,
      // transaction count as the tie-break, then score.
      //
      // Boost count is deliberately NOT part of this ordering. A DexScreener
      // boost is paid promotion, and ranking by it put a $35k-volume token above
      // one doing $4.8m — while contradicting the product's own "no paid boosts"
      // promise. Boosts are still used to *discover* candidate tokens to fetch;
      // they just do not buy position once the tokens are here.
      return copy.sort((a, b) => {
        const volDiff =
          timeframeVolume(b, timeframe) - timeframeVolume(a, timeframe)
        if (volDiff !== 0) return volDiff
        const txDiff = (b.txns24h ?? 0) - (a.txns24h ?? 0)
        if (txDiff !== 0) return txDiff
        const scoreDiff = (b.score ?? -1) - (a.score ?? -1)
        if (scoreDiff !== 0) return scoreDiff
        return firstSeenMs(b) - firstSeenMs(a)
      })
  }
}

/**
 * Fills market fields the DB does not have yet from DexScreener in one batched call.
 */
async function enrichWithMarket(
  tokens: LeaderboardTokenItem[],
): Promise<LeaderboardTokenItem[]> {
  const [pairs, clawpump, solUsd] = await Promise.all([
    getSolanaPairsBatch(tokens.map((t) => t.mint)),
    getClawPumpInfo().catch(() => new Map<string, ClawPumpInfo>()),
    getSolPriceUsd(),
  ])

  return tokens.map((t) => {
    const p = pairs.get(t.mint)
    const cp = clawpump.get(t.mint)
    const curveUsd = {
      liquidityUsd:
        solUsd != null && t.curveSolReserves != null
          ? t.curveSolReserves * solUsd
          : null,
      marketCapUsd:
        solUsd != null && t.curveMarketCapSol != null
          ? t.curveMarketCapSol * solUsd
          : null,
    }
    const socials = {
      twitter:
        cp?.twitter ??
        p?.info?.socials?.find((s) => s.type === "twitter")?.url ??
        null,
      telegram:
        cp?.telegram ??
        p?.info?.socials?.find((s) => s.type === "telegram")?.url ??
        null,
      website: cp?.website ?? p?.info?.websites?.[0]?.url ?? null,
      xVerified: cp?.xVerified ?? Boolean(p?.info?.header),
      graduated: t.graduated ?? cp?.graduated ?? null,
    }
    if (!p) {
      return {
        ...t,
        ...socials,
        liquidityUsd: t.liquidityUsd ?? curveUsd.liquidityUsd,
        marketCapUsd: t.marketCapUsd ?? curveUsd.marketCapUsd,
      }
    }
    const txns = p.txns?.h24 ? p.txns.h24.buys + p.txns.h24.sells : null
    const mcap = p.marketCap ?? p.fdv ?? curveUsd.marketCapUsd
    const isPump = p.dexId === "pumpfun" || t.mint.endsWith("pump")
    const isGrad =
      t.graduated ??
      (!isPump ||
        (p.dexId !== "pumpfun" && (p.liquidity?.usd ?? 0) > 15000) ||
        (mcap != null && mcap > 85000))
    const bondingProg = isGrad
      ? null
      : (t.bondingProgress ??
        (mcap ? Math.min(0.99, Math.max(0.05, mcap / 75000)) : 0.15))

    return {
      ...t,
      ...socials,
      graduated: isGrad,
      bondingProgress: bondingProg,
      volume5mUsd: p.volume?.m5 ?? null,
      volume1hUsd: p.volume?.h1 ?? null,
      volume6hUsd: p.volume?.h6 ?? null,
      volume24hUsd: t.volume24hUsd ?? p.volume?.h24 ?? null,
      priceChange5m: p.priceChange?.m5 ?? null,
      priceChange1h: t.priceChange1h ?? p.priceChange?.h1 ?? null,
      priceChange6h: p.priceChange?.h6 ?? null,
      priceChange24h: t.priceChange24h ?? p.priceChange?.h24 ?? null,
      imageUri: t.imageUri ?? p.info?.imageUrl ?? null,
      priceUsd: t.priceUsd ?? (p.priceUsd ? Number(p.priceUsd) : null),
      marketCapUsd: t.marketCapUsd ?? mcap,
      liquidityUsd: t.liquidityUsd ?? p.liquidity?.usd ?? curveUsd.liquidityUsd,
      dex: p.dexId ?? null,
      txns24h: txns,
      boosts: p.boosts?.active ?? null,
      traders: t.traders ?? null,
      holderCount: t.holderCount ?? null,
    }
  })
}

/**
 * Fetch the token feed with real-time DexScreener trending bangers and multi-timeframe stats.
 */
export async function getLeaderboard(
  baseUrl = "",
  sort: FeedSort = "trending",
  timeframe: FeedTimeframe = "24h",
): Promise<LeaderboardResponse> {
  if (ARC_PORT_MODE) {
    return { tokens: [], source: "arc-indexing" }
  }

  if (typeof window === "undefined" && isMockMode()) {
    return { ...getMockLeaderboard(), source: "mock" }
  }

  // Always fetch real-time trending pairs from DexScreener (boosts + high volume)
  // so the feed delivers actual market bangers instead of empty or stale 3K MCAP coins.
  let trendingItems: LeaderboardTokenItem[] = []
  try {
    const trendingPairs = await getTrendingSolanaPairs()
    trendingItems = trendingPairs.map(pairToLeaderboardItem)
  } catch (err) {
    console.error("Failed to fetch trending Solana pairs:", err)
  }

  let dbItems: LeaderboardTokenItem[] = []
  try {
    const res = await fetch(`${resolveBaseUrl(baseUrl)}/api/leaderboard`, {
      cache: "no-store",
    })
    if (res.ok) {
      const normalized = normalizeLeaderboardResponse(await res.json())
      if (normalized.tokens.length > 0) {
        dbItems = await enrichWithMarket(normalized.tokens)
      }
    }
  } catch {
    // DB fetch failed or not running; fallback to DexScreener live tokens
  }

  // Merge: DexScreener trending bangers + DB tokens, deduplicated by mint
  const mergedMap = new Map<string, LeaderboardTokenItem>()
  // Trending items first (high priority for trending/bangers)
  for (const item of trendingItems) {
    mergedMap.set(item.mint, item)
  }
  // Overlay DB items (preserving on-chain scores and inspections)
  for (const item of dbItems) {
    const existing = mergedMap.get(item.mint)
    if (existing) {
      mergedMap.set(item.mint, {
        ...existing,
        score: item.score ?? existing.score,
        launchpad: item.launchpad ?? existing.launchpad,
        holderCount: item.holderCount ?? existing.holderCount,
      })
    } else {
      mergedMap.set(item.mint, item)
    }
  }

  const allTokens = [...mergedMap.values()]

  if (allTokens.length > 0) {
    return {
      tokens: sortFeed(allTokens, sort, timeframe),
      source: dbItems.length > 0 ? "db" : "dexscreener",
    }
  }

  // Secondary fallback: latest profiles
  try {
    const profiles = await getLatestSolanaProfiles()
    if (profiles.length > 0) {
      const top = profiles.slice(0, 30)
      const pairs = await getSolanaPairsBatch(top.map((p) => p.tokenAddress))
      const tokens: LeaderboardTokenItem[] = top.map((p) => {
        const pair = pairs.get(p.tokenAddress)
        if (pair) return pairToLeaderboardItem(pair)
        return {
          tokenId: `live-${p.tokenAddress}`,
          mint: p.tokenAddress,
          name: p.tokenAddress.slice(0, 8),
          symbol: "?",
          score: null,
          calculatedAt: new Date().toISOString(),
          imageUri: p.icon || null,
          priceUsd: null,
          marketCapUsd: null,
          liquidityUsd: null,
          volume24hUsd: null,
          priceChange24h: null,
        }
      })
      return {
        tokens: sortFeed(tokens, sort, timeframe),
        source: "dexscreener",
      }
    }
  } catch (err) {
    console.error(
      "Failed to fetch live DexScreener profiles for leaderboard:",
      err,
    )
  }

  return { tokens: [] }
}

/**
 * Fetch full breakdown for a token by mint. Returns null when the mint is not a
 * valid address, or is unknown to ClawDex, Helius and DexScreener.
 */
export async function getTokenByMint(
  mint: string,
  baseUrl = "",
): Promise<TokenDetailResponse | null> {
  if (ARC_PORT_MODE) return null

  if (typeof window === "undefined" && isMockMode()) {
    return getMockTokenByMint(mint)
  }

  if (!isValidMint(mint)) return null

  const [pairs, tokenDetail] = await Promise.all([
    getSolanaTokenPairs(mint),
    (async (): Promise<TokenDetailResponse | null> => {
      try {
        const res = await fetch(
          `${resolveBaseUrl(baseUrl)}/api/token/${mint}`,
          {
            next: { revalidate: 30 },
          },
        )
        return res.ok ? ((await res.json()) as TokenDetailResponse) : null
      } catch (e) {
        console.warn(`Local /api/token/${mint} error:`, e)
        return null
      }
    })(),
  ])
  const primaryPair = pairs[0]

  let detail = tokenDetail

  // Not in ClawDex's index and not resolvable on chain: only show a page if a
  // DEX pair exists. Score, authority check and burns stay null: ClawDex has not
  // checked this token, and claiming "revoked"/"locked" would be a false signal.
  if (!detail) {
    if (!primaryPair) return null
    detail = {
      token: {
        id: `live-${mint}`,
        mint,
        name: primaryPair.baseToken?.name ?? "Unknown token",
        symbol: primaryPair.baseToken?.symbol ?? "?",
        decimals: 6,
        imageUri: primaryPair.info?.imageUrl ?? null,
        metadataUri: null,
        launchpad: primaryPair.dexId ? primaryPair.dexId.toUpperCase() : null,
        discoveredVia: "LIVE_CHAIN",
        firstSeenAt: primaryPair.pairCreatedAt
          ? new Date(primaryPair.pairCreatedAt).toISOString()
          : new Date().toISOString(),
        deployerWallet: null,
      },
      score: null,
      authorityCheck: null,
      recentBurns: [],
    }
  }

  if (primaryPair) {
    detail.market = {
      pairAddress: primaryPair.pairAddress,
      priceUsd: primaryPair.priceUsd ? Number(primaryPair.priceUsd) : undefined,
      marketCapUsd: primaryPair.marketCap ?? primaryPair.fdv,
      liquidityUsd: primaryPair.liquidity?.usd,
      volume24hUsd: primaryPair.volume?.h24,
      priceChange24h: primaryPair.priceChange?.h24,
      priceChange1h: primaryPair.priceChange?.h1,
      dex: primaryPair.dexId,
      txns24h: primaryPair.txns?.h24
        ? primaryPair.txns.h24.buys + primaryPair.txns.h24.sells
        : undefined,
    }
  }

  if (detail && !detail.score) {
    const dynScore = computeDynamicSecurityScore({
      mint,
      marketCapUsd: detail.market?.marketCapUsd,
      liquidityUsd: detail.market?.liquidityUsd,
      volume24hUsd: detail.market?.volume24hUsd,
      txns24h: detail.market?.txns24h,
      graduated: detail.token.launchpad !== "PUMPFUN",
    })
    detail.score = {
      id: `score-${mint}`,
      tokenId: detail.token.id,
      score: dynScore,
      calculatedAt: new Date().toISOString(),
      verdict:
        dynScore >= 75
          ? "SAFE_LIQUID"
          : dynScore >= 50
            ? "CAUTION_MONITOR"
            : "HIGH_RISK",
      gateMultiplier: 1.0,
      concentrationScore: Math.round(dynScore * 0.1 * 10) / 10,
      burnScore: 8.0,
      liquidityScore: Math.min(10, Math.round(dynScore * 0.1 * 10) / 10),
    }
  }

  return detail
}

export type {
  LeaderboardResponse,
  LeaderboardTokenItem,
  TokenAuthorityDetail,
  TokenBurnDetail,
  TokenDetailResponse,
  TokenIdentity,
  TokenMarketData,
  TokenScoreDetail,
} from "./mock"

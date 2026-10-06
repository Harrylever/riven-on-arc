/**
 * Hyperliquid Info API client for ClawDex Perpetual Intelligence Terminal.
 * Hyperliquid's Info API is 100% public, permissionless, and does NOT require an API key.
 * Base endpoint: https://api.hyperliquid.xyz/info
 */

const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/info"

export interface HyperliquidAssetMeta {
  name: string
  szDecimals: number
  maxLeverage: number
  marginTableId: number
}

export interface HyperliquidAssetCtx {
  funding: string
  openInterest: string
  prevDayPx: string
  dayNtlVlm: string
  premium: string
  oraclePx: string
  markPx: string
  midPx: string
  impactPxs: string[]
  dayBaseVlm: string
}

export interface PerpMarket {
  symbol: string
  markPrice: number
  indexPrice: number
  oraclePrice: number
  prevDayPrice: number
  change24h: number
  volume24h: number
  openInterest: number
  openInterestUsd: number
  fundingHourly: number
  fundingApr: number
  fundingBias: "LONG_HEAVY" | "SHORT_HEAVY" | "NEUTRAL"
  maxLeverage: number
  szDecimals: number
  isSolana: boolean
  isMajor: boolean
}

export interface Candle {
  time: number
  closeTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  trades: number
}

export interface OrderbookLevel {
  price: number
  size: number
  total: number
}

export interface PerpOrderbook {
  coin: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  spread: number
  spreadPct: number
}

// Known Solana ecosystem tokens on Hyperliquid
export const SOLANA_PERP_SYMBOLS = new Set([
  "SOL",
  "JUP",
  "RAY",
  "WIF",
  "BONK",
  "POPCAT",
  "PYTH",
  "DRIFT",
  "KMNO",
  "ME",
  "W",
  "JTO",
  "TNSR",
  "ORCA",
  "RENDER",
  "HONEY",
  "MOBILE",
  "HNT",
  "PENGU",
  "FARTCOIN",
  "AI16Z",
  "GRIFFAIN",
  "TRUMP",
  "MELANIA",
])

export const MAJOR_SYMBOLS = new Set([
  "BTC",
  "ETH",
  "SOL",
  "HYPE",
  "BNB",
  "XRP",
])

/**
 * Universal POST helper for Hyperliquid /info API
 */
export async function queryHyperliquid<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(HYPERLIQUID_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // 10s timeout to avoid hanging
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    throw new Error(`Hyperliquid API error: HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

/**
 * Fetch all perpetual markets, parse their metadata and 24h stats.
 */
export async function getHyperliquidMarkets(): Promise<PerpMarket[]> {
  const [meta, assetCtxs] = await queryHyperliquid<
    [{ universe: HyperliquidAssetMeta[] }, HyperliquidAssetCtx[]]
  >({ type: "metaAndAssetCtxs" })

  if (
    !meta?.universe ||
    !assetCtxs ||
    meta.universe.length !== assetCtxs.length
  ) {
    throw new Error("Invalid metaAndAssetCtxs response from Hyperliquid")
  }

  const markets: PerpMarket[] = []

  for (let i = 0; i < meta.universe.length; i++) {
    const u = meta.universe[i]
    const ctx = assetCtxs[i]

    const markPrice = Number.parseFloat(ctx.markPx) || 0
    const prevDayPrice = Number.parseFloat(ctx.prevDayPx) || markPrice
    const openInterestTokens = Number.parseFloat(ctx.openInterest) || 0
    const openInterestUsd = openInterestTokens * markPrice
    const volume24h = Number.parseFloat(ctx.dayNtlVlm) || 0
    const fundingHourly = Number.parseFloat(ctx.funding) || 0
    // Annualized APR = hourly rate * 24 * 365 * 100%
    const fundingApr = fundingHourly * 24 * 365 * 100
    const change24h =
      prevDayPrice > 0 ? ((markPrice - prevDayPrice) / prevDayPrice) * 100 : 0

    let fundingBias: "LONG_HEAVY" | "SHORT_HEAVY" | "NEUTRAL" = "NEUTRAL"
    if (fundingApr >= 10) fundingBias = "LONG_HEAVY"
    else if (fundingApr <= -5) fundingBias = "SHORT_HEAVY"

    const isSolana = SOLANA_PERP_SYMBOLS.has(u.name.toUpperCase())
    const isMajor = MAJOR_SYMBOLS.has(u.name.toUpperCase())

    markets.push({
      symbol: u.name,
      markPrice,
      indexPrice: Number.parseFloat(ctx.midPx) || markPrice,
      oraclePrice: Number.parseFloat(ctx.oraclePx) || markPrice,
      prevDayPrice,
      change24h,
      volume24h,
      openInterest: openInterestTokens,
      openInterestUsd,
      fundingHourly,
      fundingApr,
      fundingBias,
      maxLeverage: u.maxLeverage,
      szDecimals: u.szDecimals,
      isSolana,
      isMajor,
    })
  }

  // Sort by 24h volume descending
  return markets.sort((a, b) => b.volume24h - a.volume24h)
}

/**
 * Fetch historical candles for a coin.
 */
export async function getHyperliquidCandles(
  coin: string,
  interval: "15m" | "1h" | "4h" | "1d" = "1h",
  limit = 72,
): Promise<Candle[]> {
  const now = Date.now()
  const intervalMs =
    interval === "15m"
      ? 15 * 60 * 1000
      : interval === "1h"
        ? 60 * 60 * 1000
        : interval === "4h"
          ? 4 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000

  const startTime = now - limit * intervalMs

  interface RawCandle {
    t: number
    T: number
    s: string
    i: string
    o: string
    c: string
    h: string
    l: string
    v: string
    n: number
  }

  const rawCandles = await queryHyperliquid<RawCandle[]>({
    type: "candleSnapshot",
    req: {
      coin,
      interval,
      startTime,
      endTime: now,
    },
  })

  if (!Array.isArray(rawCandles)) return []

  return rawCandles.map((c) => ({
    time: c.t,
    closeTime: c.T,
    open: Number.parseFloat(c.o) || 0,
    high: Number.parseFloat(c.h) || 0,
    low: Number.parseFloat(c.l) || 0,
    close: Number.parseFloat(c.c) || 0,
    volume: Number.parseFloat(c.v) || 0,
    trades: c.n,
  }))
}

/**
 * Fetch L2 orderbook snapshot and compute cumulative depth.
 */
export async function getHyperliquidOrderbook(
  coin: string,
  depth = 15,
): Promise<PerpOrderbook> {
  interface RawL2Book {
    coin: string
    time: number
    levels: [
      Array<{ px: string; sz: string; n: number }>,
      Array<{ px: string; sz: string; n: number }>,
    ]
  }

  const raw = await queryHyperliquid<RawL2Book>({
    type: "l2Book",
    coin,
  })

  const rawBids = raw?.levels?.[0] ?? []
  const rawAsks = raw?.levels?.[1] ?? []

  let bidTotal = 0
  const bids: OrderbookLevel[] = rawBids.slice(0, depth).map((b) => {
    const size = Number.parseFloat(b.sz) || 0
    bidTotal += size
    return {
      price: Number.parseFloat(b.px) || 0,
      size,
      total: bidTotal,
    }
  })

  let askTotal = 0
  const asks: OrderbookLevel[] = rawAsks.slice(0, depth).map((a) => {
    const size = Number.parseFloat(a.sz) || 0
    askTotal += size
    return {
      price: Number.parseFloat(a.px) || 0,
      size,
      total: askTotal,
    }
  })

  const bestBid = bids[0]?.price ?? 0
  const bestAsk = asks[0]?.price ?? 0
  const spread = bestAsk > bestBid ? bestAsk - bestBid : 0
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0

  return {
    coin,
    bids,
    asks,
    spread,
    spreadPct,
  }
}

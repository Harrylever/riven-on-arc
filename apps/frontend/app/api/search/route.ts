import { NextResponse } from "next/server"
import { getDb } from "@clawdex/shared"
import { searchDexScreener, getSolanaTokenPairs } from "@/lib/dexscreener"
import { getMadeOnSolFeed } from "@/lib/kols"

import { num } from "@/lib/contract"
import { MOCK_PERP_SIGNALS } from "@/lib/mock-perps"

export const dynamic = "force-dynamic"

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export interface SearchTokenResult {
  mint: string
  name: string
  symbol: string
  imageUri: string | null
  priceUsd: number | null
  marketCapUsd: number | null
  volume24hUsd: number | null
  priceChange24h: number | null
  dex: string | null
  launchpad?: string | null
  isCa?: boolean
}

export interface SearchPerpResult {
  id: string
  exchange: "BYBIT" | "MEXC" | "BINANCE"
  symbol: string
  bias: "LONG" | "SHORT"
  confidence: number
  entryPrice: number
  stopLoss: number
  t1: number
  outcome: string
  scanTime: string
}

export interface SearchPersonResult {
  name: string
  handle?: string | null
  wallet?: string | null
  winrate?: number | null
  tradesCount?: number | null
  avatar?: string | null
}

export interface SearchNewsResult {
  id: string
  title: string
  snippet: string
  source: string
  time: string
  tokenSymbol?: string
  mint?: string
}

export interface SearchResponse {
  query: string
  isCa: boolean
  tokens: SearchTokenResult[]
  perps: SearchPerpResult[]
  people: SearchPersonResult[]
  news: SearchNewsResult[]
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const rawQ = url.searchParams.get("q")?.trim() ?? ""
  if (!rawQ || rawQ.length < 2) {
    return NextResponse.json({
      query: rawQ,
      isCa: false,
      tokens: [],
      perps: [],
      people: [],
      news: [],
    })
  }

  const arcMode = process.env.NEXT_PUBLIC_CHAIN_MODE !== "solana"
  const isCa = (arcMode ? EVM_ADDRESS_RE : BASE58_ADDRESS_RE).test(rawQ)
  if (arcMode) {
    return NextResponse.json({
      query: rawQ,
      isCa,
      tokens: [],
      perps: [],
      people: [],
      news: [],
    })
  }

  // Legacy Solana search is available only when explicitly running that mode.
  const cleanKeyword = rawQ.replace(/^\$/, "").trim()
  const lowerKeyword = cleanKeyword.toLowerCase()

  const [dexPairs, caPairs, kolFeed, dbData] = await Promise.all([
    // DexScreener keyword search across Solana tokens
    searchDexScreener(cleanKeyword).catch(() => []),

    // If it's a CA, fetch direct pair data preserving case
    isCa ? getSolanaTokenPairs(rawQ).catch(() => []) : Promise.resolve([]),

    // KOLs / People feed
    getMadeOnSolFeed(100).catch(() => ({ trades: [], count: 0 })),

    (async () => {
      try {
        const db = getDb()
        const perpTerm = cleanKeyword
          .toUpperCase()
          .replace(/[-/]/g, "")
          .replace(/PERP$/, "")

        const [tokens, alerts, perps] = await Promise.all([
          db.token.findMany({
            where: {
              OR: [
                { symbol: { contains: cleanKeyword, mode: "insensitive" } },
                { name: { contains: cleanKeyword, mode: "insensitive" } },
                ...(isCa ? [{ mint: rawQ }] : []),
              ],
            },
            take: 20,
            select: {
              mint: true,
              name: true,
              symbol: true,
              imageUri: true,
              launchpad: true,
            },
          }),
          db.alert.findMany({
            where: {
              OR: [
                { message: { contains: cleanKeyword, mode: "insensitive" } },
                {
                  token: {
                    symbol: { contains: cleanKeyword, mode: "insensitive" },
                  },
                },
              ],
            },
            take: 10,
            include: { token: { select: { symbol: true, mint: true } } },
          }),
          db.perpSignal.findMany({
            where: {
              symbol: { contains: perpTerm, mode: "insensitive" },
            },
            take: 10,
            orderBy: { scanTime: "desc" },
          }),
        ])
        return { tokens, alerts, perps }
      } catch {
        return { tokens: [], alerts: [], perps: [] }
      }
    })(),
  ])

  // Merge Tokens: CA direct match first, then DexScreener search + DB tokens
  const tokenMap = new Map<string, SearchTokenResult>()

  if (isCa && caPairs.length > 0) {
    const primary = caPairs[0]
    tokenMap.set(primary.baseToken.address, {
      mint: primary.baseToken.address,
      name: primary.baseToken.name || rawQ.slice(0, 8),
      symbol: primary.baseToken.symbol || "TOKEN",
      imageUri: primary.info?.imageUrl || null,
      priceUsd: primary.priceUsd ? Number(primary.priceUsd) : null,
      marketCapUsd: primary.marketCap ?? primary.fdv ?? null,
      volume24hUsd: primary.volume?.h24 ?? null,
      priceChange24h: primary.priceChange?.h24 ?? null,
      dex: primary.dexId ?? null,
      launchpad: primary.dexId ? primary.dexId.toUpperCase() : null,
      isCa: true,
    })
  }

  for (const p of dexPairs) {
    if (!tokenMap.has(p.baseToken.address)) {
      tokenMap.set(p.baseToken.address, {
        mint: p.baseToken.address,
        name: p.baseToken.name || p.baseToken.symbol,
        symbol: p.baseToken.symbol,
        imageUri: p.info?.imageUrl || null,
        priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
        marketCapUsd: p.marketCap ?? p.fdv ?? null,
        volume24hUsd: p.volume?.h24 ?? null,
        priceChange24h: p.priceChange?.h24 ?? null,
        dex: p.dexId ?? null,
        launchpad:
          p.dexId === "pumpfun"
            ? "PUMPFUN"
            : p.dexId
              ? p.dexId.toUpperCase()
              : null,
      })
    }
  }

  for (const t of dbData.tokens) {
    if (!tokenMap.has(t.mint)) {
      tokenMap.set(t.mint, {
        mint: t.mint,
        name: t.name,
        symbol: t.symbol,
        imageUri: t.imageUri,
        priceUsd: null,
        marketCapUsd: null,
        volume24hUsd: null,
        priceChange24h: null,
        dex: null,
        launchpad: t.launchpad,
      })
    }
  }

  const tokens = [...tokenMap.values()].slice(0, 25)

  // Search People & KOLs
  const personMap = new Map<string, SearchPersonResult>()

  // Filter MadeOnSol KOLs
  for (const t of kolFeed.trades) {
    const kolName = t.kol_name || ""
    const kolTwitter = t.kol_twitter || ""
    const kolWallet = t.wallet_address || ""

    if (
      kolName.toLowerCase().includes(lowerKeyword) ||
      kolTwitter.toLowerCase().includes(lowerKeyword) ||
      kolWallet.toLowerCase() === lowerKeyword
    ) {
      const key = kolWallet || kolName
      if (!personMap.has(key)) {
        personMap.set(key, {
          name: kolName || `KOL ${kolWallet.slice(0, 6)}`,
          handle: kolTwitter ? `@${kolTwitter.replace(/^@/, "")}` : null,
          wallet: kolWallet,
          winrate: t.kol_winrate_7d ?? t.kol_winrate_30d ?? null,
          tradesCount: 1,
        })
      } else {
        const cur = personMap.get(key)!
        cur.tradesCount = (cur.tradesCount ?? 1) + 1
      }
    }
  }

  // People come only from the MadeOnSol feed above, where the name, handle and
  // win rate are all reported by the source. A previous version padded this with
  // a hardcoded celebrity list carrying an invented 68.5% win rate and 42 trades
  // for every one of them — never attach statistics to a person we cannot measure.
  const people = [...personMap.values()].slice(0, 10)

  // Search News & Signals
  const newsList: SearchNewsResult[] = []

  for (const a of dbData.alerts) {
    newsList.push({
      id: a.id,
      title: `${a.type.replace(/_/g, " ")}: ${a.token.symbol}`,
      snippet: a.message,
      source: "ClawDex Onchain Signal",
      time: a.createdAt.toISOString(),
      tokenSymbol: a.token.symbol,
      mint: a.token.mint,
    })
  }

  // Generate news/signal hits from KOL calls matching the query
  for (const t of kolFeed.trades) {
    const symbol = t.token_symbol || ""
    const name = t.token_name || ""
    if (
      symbol.toLowerCase().includes(lowerKeyword) ||
      name.toLowerCase().includes(lowerKeyword) ||
      (t.kol_name && t.kol_name.toLowerCase().includes(lowerKeyword))
    ) {
      newsList.push({
        id: `kol-${t.tx_signature || t.traded_at}-${t.token_mint}`,
        title: `${t.kol_name || "KOL"} ${t.action.toUpperCase()} ${t.token_symbol || "Token"}`,
        snippet: `Called on Solana: ${t.action} of ${t.sol_amount.toFixed(1)} SOL at market cap $${((t.market_cap_usd_at_trade ?? 0) / 1000).toFixed(0)}K.`,
        source: "KOL Intel Call",
        time: t.traded_at,
        tokenSymbol: t.token_symbol,
        mint: t.token_mint,
      })
    }
  }

  // No synthetic filler item here: an empty news list means nothing matched,
  // which the UI states plainly rather than dressing up as a "trend report".
  const news = newsList.slice(0, 10)

  // Search Perpetual Signals
  const perpTerm = cleanKeyword
    .toUpperCase()
    .replace(/[-/]/g, "")
    .replace(/PERP$/, "")

  const dbPerps: SearchPerpResult[] = dbData.perps.map((p) => ({
    id: p.id,
    exchange: p.exchange as "BYBIT" | "MEXC" | "BINANCE",
    symbol: p.symbol,
    bias: p.bias as "LONG" | "SHORT",
    confidence: p.confidence,
    entryPrice: num(p.entryPrice),
    stopLoss: num(p.stopLoss),
    t1: num(p.t1),
    outcome: p.outcome,
    scanTime: p.scanTime.toISOString(),
  }))

  const mockPerps: SearchPerpResult[] = MOCK_PERP_SIGNALS.filter((m) =>
    m.symbol.toUpperCase().includes(perpTerm),
  ).map((p) => ({
    id: p.id,
    exchange: p.exchange,
    symbol: p.symbol,
    bias: p.bias,
    confidence: p.confidence,
    entryPrice: p.entryPrice,
    stopLoss: p.stopLoss,
    t1: p.t1,
    outcome: p.outcome,
    scanTime: p.scanTime,
  }))

  const seenPerpKeys = new Set(
    dbPerps.map((p) => `${p.exchange}-${p.symbol}-${p.bias}`),
  )
  const perps = [
    ...dbPerps,
    ...mockPerps.filter(
      (m) => !seenPerpKeys.has(`${m.exchange}-${m.symbol}-${m.bias}`),
    ),
  ].slice(0, 10)

  return NextResponse.json({
    query: rawQ,
    isCa,
    tokens,
    perps,
    people,
    news,
  })
}

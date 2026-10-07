// Server-only. Riven's analysis engine for a perp pair: it reads the market
// (Hyperliquid), sakz-bot's open call and the news, and writes a plain-English
// read of what's moving the pair and why. Riven (and the optional AI voice)
// only ever reads this back — it never advises a trade.
import { getDb } from "@clawdex/shared"
import { getHyperliquidMarkets, type PerpMarket } from "./hyperliquid"
import { getNews, type NewsItem } from "./news"
import { signalCoinKey } from "./perp-symbols"

export interface PerpCall {
  id: string
  bias: "LONG" | "SHORT"
  confidence: number
  entryPrice: number
  stopLoss: number
  t1: number
  t2: number
  t3: number
  scanTime: string
  exchange: string
}

export interface PerpInsight {
  coin: string
  market: PerpMarket | null
  call: PerpCall | null
  news: NewsItem[]
  /** 0–10: how much is going on (move size, volume, news, funding stress). Not a buy score. */
  activity: number
  mood: "happy" | "warn" | "danger" | "idle"
  /** One line: the most likely reason it's moving. */
  why: string
  bullets: string[]
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
const money = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`
const price = (n: number) => (n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${n.toPrecision(4)}`)

export async function getPerpInsight(coinRaw: string): Promise<PerpInsight> {
  const coin = signalCoinKey(coinRaw)
  const [markets, newsAll, row] = await Promise.all([
    getHyperliquidMarkets().catch(() => [] as PerpMarket[]),
    getNews({ limit: 120 }).catch(() => [] as NewsItem[]),
    getDb()
      .perpSignal.findMany({ where: { outcome: "pending" }, orderBy: { scanTime: "desc" }, take: 300 })
      .then((rows) => rows.find((r) => signalCoinKey(r.symbol) === coin) ?? null)
      .catch(() => null),
  ])
  const m = markets.find((x) => x.symbol.toUpperCase() === coin) ?? null
  const day = Date.now() - 24 * 3600_000
  // kPEPE-style contracts are the same coin as PEPE in the news
  const news = newsAll.filter((n) => n.coins.includes(coin) || n.coins.includes(coin.replace(/^K(?=[A-Z])/, "")))
  const recent = news.filter((n) => new Date(n.publishedAt).getTime() > day)
  const bull = recent.filter((n) => n.sentiment === "bullish").length
  const bear = recent.filter((n) => n.sentiment === "bearish").length
  const call: PerpCall | null = row
    ? {
        id: row.id,
        bias: row.bias as PerpCall["bias"],
        confidence: row.confidence,
        entryPrice: Number(row.entryPrice),
        stopLoss: Number(row.stopLoss),
        t1: Number(row.t1),
        t2: Number(row.t2),
        t3: Number(row.t3),
        scanTime: row.scanTime.toISOString(),
        exchange: row.exchange,
      }
    : null

  const bullets: string[] = []
  let why = "Nothing unusual: no big move, no news, funding is calm."
  let activity = 0
  let mood: PerpInsight["mood"] = "idle"

  if (m) {
    const ch = m.change24h
    const big = Math.abs(ch) >= 5
    bullets.push(`${coin} is ${pct(ch)} in 24h at ${price(m.markPrice)} (Hyperliquid mark).`)
    bullets.push(`24h volume ${money(m.volume24h)}; open interest ${money(m.openInterestUsd)}.`)
    const oiTurn = m.openInterestUsd > 0 ? m.volume24h / m.openInterestUsd : 0
    if (oiTurn > 3) bullets.push("Trading is heavy relative to open positions — lots of short-term flipping.")
    if (m.fundingBias === "LONG_HEAVY")
      bullets.push(`Funding is positive (${m.fundingApr.toFixed(1)}% APR): longs are paying shorts, so the long side is crowded.`)
    else if (m.fundingBias === "SHORT_HEAVY")
      bullets.push(`Funding is negative (${m.fundingApr.toFixed(1)}% APR): shorts are paying longs, so the short side is crowded.`)

    // What best explains the move: news that agrees with it, or leverage without news.
    const newsAgrees = (ch > 0 && bull > bear) || (ch < 0 && bear > bull)
    if (big && recent.length > 0 && newsAgrees) {
      const lead = recent.find((n) => n.sentiment === (ch > 0 ? "bullish" : "bearish")) ?? recent[0]!
      why = `The ${ch > 0 ? "pump" : "drop"} lines up with ${ch > 0 ? "positive" : "negative"} news: “${lead.title}” (${lead.source}).`
    } else if (big && recent.length > 0) {
      why = `It's moving ${pct(ch)} and is in the news, but the headlines don't clearly explain the direction — check them below.`
    } else if (big && m.fundingBias === (ch > 0 ? "LONG_HEAVY" : "SHORT_HEAVY")) {
      why = `The ${ch > 0 ? "pump" : "drop"} looks leverage-driven: no matching news, and the ${ch > 0 ? "long" : "short"} side is crowded — those moves can snap back fast.`
    } else if (big) {
      why = `A ${pct(ch)} move with no matching news yet — could be whale flow or news Riven hasn't seen.`
    } else if (recent.length > 0) {
      why = `Quiet price action, but ${recent.length} news stor${recent.length === 1 ? "y" : "ies"} mention ${coin} today.`
    }
    activity = Math.min(10, Math.abs(ch) / 2.5 + Math.min(3, recent.length) + (m.fundingBias === "NEUTRAL" ? 0 : 1) + (oiTurn > 3 ? 1 : 0))
    mood = big && ch > 0 ? "happy" : big && ch < 0 ? "warn" : "idle"
    if (m.fundingBias !== "NEUTRAL" && big) mood = "warn"
  } else {
    why = `Riven has no live Hyperliquid market for ${coin}.`
  }

  if (recent.length > 0) {
    bullets.push(`${recent.length} news stor${recent.length === 1 ? "y" : "ies"} in 24h (${bull} positive, ${bear} negative). Latest: “${recent[0]!.title}”.`)
  } else {
    bullets.push(`No news about ${coin} in the last 24h from Riven's feeds.`)
  }
  if (call) {
    bullets.push(
      `sakz-bot has an open ${call.bias} call, conviction ${call.confidence}/10: entry ${price(call.entryPrice)}, stop ${price(call.stopLoss)}, first target ${price(call.t1)}.`,
    )
  }

  return { coin, market: m, call, news: news.slice(0, 20), activity: Math.round(activity * 10) / 10, mood, why, bullets }
}

/** The insight as grounded FACTS text, for Riven's voice / the optional AI writer. */
export function insightFacts(i: PerpInsight) {
  return [
    `Pair: ${i.coin}-PERP. Activity ${i.activity}/10 (how much is going on — not a buy score).`,
    `Likely reason: ${i.why}`,
    ...i.bullets.map((b) => `• ${b}`),
    "Source: Hyperliquid market data, sakz-bot scanner, crypto news RSS (Cointelegraph, Decrypt, CoinDesk, Bitcoin Magazine).",
  ].join("\n")
}

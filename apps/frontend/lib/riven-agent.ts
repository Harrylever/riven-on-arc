// Server-only: answers questions from Riven's own data. Never invents numbers,
// never says buy or sell, always ends with the disclaimer (AGENTS.md agent rules).
import { getDb } from "@riven/shared"
import {
  getAlerts,
  getArcPulse,
  getMarketTotals,
  getCreatorRecord,
  getScreener,
  getTokenDetail,
  searchTokens,
  type TokenSummary,
} from "./arc-data"
import { DEFAULT_FILTERS } from "./screener-params"
import { usd, times } from "./riven-format"
import { getHyperliquidMarkets } from "./hyperliquid"
import { coinsIn, getNews } from "./news"
import { getPerpInsight, insightFacts } from "./perp-insight"
import { comparePair, explainConcept, FOLLOW_UP, parseScreenerQuery, type ParsedQuery } from "./agent-intent"

/** What "this" refers to on the page the question was asked from. */
export type AgentTopic = { kind: "token"; address: string } | { kind: "perp"; coin: string }

/** A perp coin named in the question ("bitcoin", "SOL", "why is HYPE pumping"). */
async function perpCoinIn(q: string): Promise<string | null> {
  const markets = await getHyperliquidMarkets().catch(() => [])
  const known = markets.map((m) => m.symbol.toUpperCase())
  const found = coinsIn(q, new Set(known)).filter((c) => known.includes(c))
  // bare tickers typed in lower case ("btc", "eth")
  if (found.length === 0) {
    for (const w of q.toUpperCase().match(/\b[A-Z0-9]{2,10}\b/g) ?? []) if (known.includes(w) && w.length >= 3) return w
  }
  return found[0] ?? null
}

export async function explainPerp(coin: string): Promise<AgentReply> {
  const i = await getPerpInsight(coin)
  return { text: `${insightFacts(i)}\n${DISCLAIMER}`, tokens: [] }
}

export const DISCLAIMER = "Not financial advice. DYOR."

export interface AgentReply {
  text: string
  tokens: TokenSummary[]
}

const ADDRESS = /0x[0-9a-fA-F]{40}/
const TICKER = /\$([A-Za-z][A-Za-z0-9]{1,14})\b/

function line(t: TokenSummary) {
  const s = t.score === null ? "not scored yet" : `${t.score.toFixed(1)}/10`
  return `• ${t.symbol} — ${s}, MC ${usd(t.marketCap)}, 24h vol ${usd(t.volume.h24)}`
}

export async function explainToken(address: string): Promise<AgentReply> {
  const t = await getTokenDetail(address)
  if (!t) {
    return {
      text: `Riven isn't tracking that token yet, so I can't say anything about it without guessing. ${DISCLAIMER}`,
      tokens: [],
    }
  }
  const dangers = t.flags
    .filter((f) => f.level === "danger")
    .map((f) => `⚠ ${f.text}`)
  const warnings = t.flags
    .filter((f) => f.level === "warning")
    .map((f) => `• ${f.text}`)
  const goods = t.flags
    .filter((f) => f.level === "good")
    .map((f) => `✓ ${f.text}`)
  const parts = [
    t.score === null
      ? `${t.symbol} isn't scored yet — Riven is still reading its on-chain data.`
      : `${t.symbol} scores ${t.score.toFixed(1)}/10 (${t.verdict})`,
  ]
  if (t.fake)
    parts.push(
      `Riven flagged it and hides it from the default list: ${t.fakeReasons.join("; ")}.`,
    )
  if (dangers.length) parts.push(dangers.slice(0, 4).join("\n"))
  if (warnings.length) parts.push(warnings.slice(0, 3).join("\n"))
  if (goods.length) parts.push(goods.slice(0, 3).join("\n"))
  if (t.creatorRecord && t.creatorRecord.launches > 1) {
    const r = t.creatorRecord
    parts.push(
      `Creator has ${r.launches} launches: ${r.alive} alive, ${r.dead} dead, ${r.rugged} rugged. Best peak ${times(r.bestAthX)}.`,
    )
  }
  if (t.alerts.length)
    parts.push(
      `Recent alerts: ${t.alerts
        .slice(0, 3)
        .map((a) => a.message)
        .join("; ")}.`,
    )
  parts.push(
    `Source: Riven score ${t.scoredAt ? `from ${new Date(t.scoredAt).toUTCString()}` : "pending"}, Arc mainnet. ${DISCLAIMER}`,
  )
  return { text: parts.join("\n\n"), tokens: [t] }
}

export async function explainTicker(ticker: string): Promise<AgentReply> {
  const found = await searchTokens(ticker)
  if (found.length === 1) return explainToken(found[0]!.address)
  if (found.length > 1) {
    return {
      text: [
        `${found.length} tokens on Arc use “${ticker}” — copycats are common. Pick the right contract:`,
        ...found
          .slice(0, 6)
          .map((t) => `${line(t)}${t.fake ? " (flagged)" : ""}`),
        DISCLAIMER,
      ].join("\n"),
      tokens: found.slice(0, 6),
    }
  }
  return {
    text: `Riven isn't tracking a token called “${ticker}” on Arc. ${DISCLAIMER}`,
    tokens: [],
  }
}

const pct = (n: number | null) => (n === null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`)

/** "What's happening on Arc?" — the whole market in a few lines. */
export async function marketOverview(): Promise<AgentReply> {
  const [pulse, totals, trending, alerts] = await Promise.all([
    getArcPulse(),
    getMarketTotals(),
    // view "all" is the fast database-paged path; the "listed" view scores thousands of tokens in
    // memory (seconds, cold). Take a small page and drop flagged tokens here instead.
    getScreener({ ...DEFAULT_FILTERS, view: "all", tf: "24h", sort: "trending" }, 12),
    getAlerts({ limit: 3 }),
  ])
  const hot = { tokens: trending.tokens.filter((t) => !t.fake).slice(0, 4) }
  return {
    text: [
      "Arc right now:",
      `• ${totals.trading} tokens traded in the last 24h — ${usd(totals.volume24h)} volume over ${totals.txns24h.toLocaleString()} trades.`,
      `• ${usd(pulse.realUsdcInTradingPools)} of real USDC sits in ${pulse.tradingPools} trading pools.`,
      `• Last 24h: ${pulse.liquidityPulls24h} liquidity pulls, ${pulse.creatorSells24h} big creator sales, ${pulse.whaleSells24h} whale sales caught; ${pulse.scoresComputed24h} score updates.`,
      pulse.livePerpCalls ? `• ${pulse.livePerpCalls} live perp calls from the scanner.` : "",
      hot.tokens.length ? `Trending: ${hot.tokens.map((t) => `${t.symbol} (${t.score === null ? "unscored" : `${t.score.toFixed(1)}/10`})`).join(", ")}.` : "",
      alerts.length ? `Latest alerts: ${alerts.map((a) => `${a.token.symbol} — ${a.message}`).join("; ")}.` : "",
      `Source: Riven's Arc mainnet index, refreshed every few seconds. ${DISCLAIMER}`,
    ]
      .filter(Boolean)
      .join("\n"),
    tokens: hot.tokens,
  }
}

/** "Which perps are moving?" / "any signals?" — markets + scanner calls. */
export async function perpsOverview(lower: string): Promise<AgentReply> {
  const [markets, db] = [await getHyperliquidMarkets().catch(() => []), getDb()]
  const calls = await db.perpSignal
    .findMany({ where: { outcome: "pending" }, orderBy: [{ confidence: "desc" }, { scanTime: "desc" }], take: 5 })
    .catch(() => [])
  const liquid = markets.filter((m) => m.volume24h > 5e6)
  const sorted = /loser|down|dump|falling/.test(lower)
    ? [...liquid].sort((a, b) => a.change24h - b.change24h)
    : /funding/.test(lower)
      ? [...liquid].sort((a, b) => Math.abs(b.fundingApr) - Math.abs(a.fundingApr))
      : /gainer|up|pump|rising/.test(lower)
        ? [...liquid].sort((a, b) => b.change24h - a.change24h)
        : [...liquid].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
  const parts = [
    /funding/.test(lower) ? "Perps with the most extreme funding (24h volume over $5M):" : "Biggest perp moves in the last 24h (volume over $5M):",
    ...sorted
      .slice(0, 6)
      .map((m) => `• ${m.symbol}: ${pct(m.change24h)}, volume ${usd(m.volume24h)}, funding ${m.fundingApr.toFixed(1)}% a year${m.fundingBias !== "NEUTRAL" ? ` (${m.fundingBias === "LONG_HEAVY" ? "longs crowded" : "shorts crowded"})` : ""}`),
  ]
  if (calls.length)
    parts.push(
      "Open scanner calls:",
      ...calls.map((c) => `• ${c.symbol} ${c.bias} — confidence ${c.confidence}/10${c.winProb != null ? `, calibrated hit chance ${Math.round(Number(c.winProb) * 100)}%` : ""}`),
    )
  else parts.push("No open scanner calls right now.")
  parts.push(`Source: Riven's live perp market feed (prices) and Riven Scanner (calls, priced on Bybit, MEXC or Binance). Calls are data, not advice. ${DISCLAIMER}`)
  return { text: parts.join("\n"), tokens: [] }
}

/** One token, found by address or ticker (first real match). */
export async function resolveToken(ref: string): Promise<TokenSummary | null> {
  if (/^0x[0-9a-f]{40}$/i.test(ref)) return getTokenDetail(ref.toLowerCase())
  const found = await searchTokens(ref)
  const exact = found.filter((t) => t.symbol.toLowerCase() === ref.toLowerCase())
  const pick = (exact.length ? exact : found).sort((a, b) => Number(a.fake) - Number(b.fake) || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0]
  return pick ? getTokenDetail(pick.address) : null
}

export async function compareTokens(refs: string[]): Promise<AgentReply> {
  const all = await Promise.all(refs.map(resolveToken))
  const found = all.filter((t): t is TokenSummary => t !== null)
  const missing = all.length - found.length
  if (found.length < 2) {
    return { text: `I could only find ${found.length} of those on Arc, so I can't compare them fairly. Try $TICKERS or 0x addresses. ${DISCLAIMER}`, tokens: found }
  }
  const row = (t: TokenSummary) =>
    `• ${t.symbol}: score ${t.score === null ? "pending" : `${t.score.toFixed(1)}/10 (${t.verdict})`}, MC ${usd(t.marketCap)}, liquidity ${usd(t.liquidityUsd)}, 24h vol ${usd(t.volume.h24)}, 24h ${pct(t.change.h24)}, holders ${t.holders ?? "—"}${t.fake ? `, flagged: ${t.fakeReasons[0]}` : ""}`
  const scored = found.filter((t) => t.score !== null).sort((a, b) => b.score! - a.score!)
  const lines = ["Side by side:", ...found.map(row)]
  if (scored.length >= 2 && scored[0]!.score! - scored[1]!.score! >= 0.5)
    lines.push(`${scored[0]!.symbol} has the stronger risk score — that's about how safe its setup looks, not where its price goes.`)
  for (const t of found) {
    const d = t.dangers.slice(0, 2)
    if (d.length) lines.push(`${t.symbol} risks: ${d.join("; ")}.`)
  }
  if (missing) lines.push(`(${missing} more I couldn't find.)`)
  lines.push(`Source: Riven scores and Arc market data. ${DISCLAIMER}`)
  return { text: lines.join("\n"), tokens: found }
}

export async function screenerAnswer(p: ParsedQuery): Promise<AgentReply> {
  const res = await getScreener(p.filters, p.riskiest ? 40 : 6)
  let list = res.tokens
  if (p.riskiest) list = [...list].sort((a, b) => (a.score ?? 99) - (b.score ?? 99)).slice(0, 6)
  const what = p.understood.join(", ")
  if (list.length === 0)
    return {
      text: `No real tokens on Arc match that right now (${what}). Try loosening one condition. ${DISCLAIMER}`,
      tokens: [],
    }
  return {
    text: [
      `Tokens on Arc — ${what}. ${res.total} found, top ${list.length}:`,
      ...list.map((t) => {
        const ch = t.change[({ "5m": "m5", "1h": "h1", "6h": "h6", "24h": "h24" } as const)[p.filters.tf]]
        return `${line(t)}${ch !== null && /gainer|loser/.test(p.filters.sort) ? `, ${p.filters.tf} ${pct(ch)}` : ""}`
      }),
      `${p.filters.view === "listed" ? "Flagged tokens are hidden. " : ""}Open the Tokens page for the full list with these filters. ${DISCLAIMER}`,
    ].join("\n"),
    tokens: list,
  }
}

const HELP = [
  "Things you can ask me:",
  "• “Is $TICKER safe?” · paste any 0x address · “Who created 0x…?”",
  "• “Find tokens under $50K market cap with socials” · “Newest launches on Argus” · “Biggest gainers in the last hour”",
  "• “Compare $A vs $B” · “What does wash trading mean?” · “How is the score calculated?”",
  "• “What's happening on Arc?” · “What rugged today?”",
  "• “Why is SOL pumping?” · “Which perps are moving?” · “Any news on bitcoin?”",
].join("\n")

export interface AskContext {
  /** The token or perp pair on the page the question came from. */
  topic?: AgentTopic
  /** The token Riven last answered about (for "and its holders?"). */
  subject?: string
}

/** Latest anti-rug alerts: liquidity pulls, big creator/whale sales, score drops. */
export async function rugAlerts(): Promise<AgentReply> {
  const alerts = await getAlerts({ limit: 8 })
  if (alerts.length === 0)
    return {
      text: `No liquidity pulls, big sales or score drops caught recently. ${DISCLAIMER}`,
      tokens: [],
    }
  return {
    text: [
      "Latest anti-rug alerts on Arc:",
      ...alerts.map((a) => `• ${a.token.symbol}: ${a.message}`),
      `Source: Riven's rug radar. ${DISCLAIMER}`,
    ].join("\n"),
    tokens: [],
  }
}

/** Routes a plain-English question to the right lookup. */
export async function answer(question: string, topicOrCtx?: AgentTopic | AskContext): Promise<AgentReply> {
  const ctx: AskContext = topicOrCtx && "kind" in topicOrCtx ? { topic: topicOrCtx } : (topicOrCtx ?? {})
  const topic = ctx.topic
  const q = question.trim()
  const lower = q.toLowerCase()
  const addr = q.match(ADDRESS)?.[0]?.toLowerCase()

  if (/^(?:hi|hey|hello|yo|gm|sup|help|\?|what can you do\??|commands?)\W*$/i.test(q))
    return { text: `Hey, I'm Riven. I read Arc's chain and the perp markets and explain what I see — I never tell you to buy or sell.\n${HELP}\n${DISCLAIMER}`, tokens: [] }

  if (/happening|going on|overview|summary|pulse|how(?:'s| is) (?:the )?(?:market|arc|everything)|market today|\bstatus\b/.test(lower) && !parseScreenerQuery(q))
    return marketOverview()

  // "What is liquidity?" — definitions don't need data.
  const concept = explainConcept(q)
  if (concept) return { text: `${concept}\n${DISCLAIMER}`, tokens: [] }

  // "$A vs $B"
  const pair = comparePair(q)
  if (pair) return compareTokens(pair)

  // Perp pairs and the news that moves them.
  if (!addr && !TICKER.test(q)) {
    const named = await perpCoinIn(q)
    const coin = named ?? (topic?.kind === "perp" ? topic.coin : null)
    if (coin && (named || /pump|dump|moving|move|why|news|funding|long|short|signal|call|price|up|down|this|it\b/.test(lower))) {
      return explainPerp(coin)
    }
    if (/\bperps?\b|perpetual|futures|funding|\bpairs?\b|scanner|signals?|calls?\b/.test(lower)) return perpsOverview(lower)
    if (/\bnews|headline/.test(lower)) {
      const news = await getNews({ limit: 6 }).catch(() => [])
      return {
        text: news.length
          ? ["Latest crypto headlines:", ...news.map((n) => `• ${n.title} (${n.source}${n.coins.length ? `, about ${n.coins.join(", ")}` : ""})`), `Source: crypto news RSS. ${DISCLAIMER}`].join("\n")
          : `Riven's news feeds are unavailable right now. ${DISCLAIMER}`,
        tokens: [],
      }
    }
  }
  // "Is this safe?" on a token page means that token; "and its holders?" means the last one.
  if (!addr && !TICKER.test(q)) {
    const here = topic?.kind === "token" ? topic.address : null
    if (here && (FOLLOW_UP.test(q) || /safe|score|rug|risk|why|holder|liquid|creator|scan|dev|buy|sell|price|volume/.test(lower)))
      return explainToken(here)
    if (!here && ctx.subject && FOLLOW_UP.test(q) && !parseScreenerQuery(q)) return explainToken(ctx.subject)
  }

  if (addr) {
    if (/creator|dev|wallet|launched|deployer/.test(lower)) {
      const r = await getCreatorRecord(addr)
      if (r) {
        return {
          text: [
            `This wallet launched ${r.launches} token${r.launches > 1 ? "s" : ""} that Riven tracks: ${r.alive} still alive, ${r.dead} dead, ${r.rugged} rugged. Best peak: ${times(r.bestAthX)}.`,
            ...r.tokens
              .slice(0, 6)
              .map(
                (x) =>
                  `• ${x.symbol}: peak ${times(x.athX)}, now ${times(x.nowX)} — ${x.status}`,
              ),
            `Source: swaps Riven indexed on Arc mainnet. ${DISCLAIMER}`,
          ].join("\n"),
          tokens: [],
        }
      }
    }
    return explainToken(addr)
  }

  // An explicit $TICKER always means "tell me about this token".
  const dollar = q.match(TICKER)?.[1]
  if (dollar) return explainTicker(dollar)

  if (/\brug|alert|liquidity pull|pulled|creator sol|whale sol|score drop/.test(lower)) return rugAlerts()

  // "Find tokens under 5M market cap with socials", "safest new launches", "top gainers"…
  const parsed = parseScreenerQuery(q)
  if (parsed) {
    const reply = await screenerAnswer(parsed)
    if (parsed.filters.band === "healthy" && reply.tokens.length === 0)
      reply.text = `Right now no real token on Arc matching that scores 7/10 or higher — most launches are flagged. That's the honest answer, not a gap in the data. ${DISCLAIMER}`
    return reply
  }

  if (/happening|overview|summary|market|today|going on|status|pulse|arc\b|ecosystem|how(?:'s| is) (?:it|everything)/.test(lower)) return marketOverview()

  const bare =
    q.split(/\s+/).length <= 3 ? q.replace(/[^A-Za-z0-9]/g, "") : null
  if (bare && bare.length >= 2) {
    const reply = await explainTicker(bare)
    if (reply.tokens.length > 0) return reply
  }

  // Not sure what they meant: give the market picture (the AI voice can work
  // with it) plus what I can do — never a dead end.
  const overview = await marketOverview().catch(() => null)
  return {
    text: [
      "I'm not sure exactly what you're after, so here's what I see right now.",
      overview ? overview.text.replace(`\n${DISCLAIMER}`, "").replace(DISCLAIMER, "").trim() : "",
      HELP,
      DISCLAIMER,
    ]
      .filter(Boolean)
      .join("\n"),
    tokens: overview?.tokens ?? [],
  }
}

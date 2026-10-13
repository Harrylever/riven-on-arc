// Pure helpers for Ask Riven: turn a plain-English question into screener
// filters, spot comparisons, and answer "what does X mean". No I/O here, so
// it's unit-tested in agent-intent.test.ts.
import { DEFAULT_FILTERS, type ScreenerFilters, type SortKey } from "./screener-params"

/** "$5M", "5 million", "500k", "2.5b", "1,200" → dollars. */
export function parseAmount(raw: string): number | null {
  const m = raw
    .toLowerCase()
    .replace(/,/g, "")
    .match(/\$?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|mil|million|mn|b|bn|billion)?\b/)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2] ?? ""
  const mult = /^k|thousand/.test(unit) ? 1e3 : /^b/.test(unit) ? 1e9 : /^m/.test(unit) ? 1e6 : 1
  return Number.isFinite(n) ? n * mult : null
}

const AMT = String.raw`\$?\s*\d[\d,]*(?:\.\d+)?\s*(?:k|thousand|m|mil|million|mn|b|bn|billion)?\b`
const UNDER = String.raw`(?:under|below|less than|lower than|<|max(?:imum)?|at most|up to|smaller than|cheaper than)`
const OVER = String.raw`(?:over|above|more than|greater than|>|min(?:imum)?|at least|bigger than|higher than)`

function bound(q: string, subject: string, dir: "under" | "over"): number | null {
  const word = dir === "under" ? UNDER : OVER
  // "mcap under 5m" / "under 5m mcap" / "under 5m market cap"
  const a = q.match(new RegExp(`(?:${subject})\\s*(?:of|is|=|:)?\\s*${word}\\s*(${AMT})`, "i"))
  const b = q.match(new RegExp(`${word}\\s*(${AMT})\\s*(?:in\\s+)?(?:${subject})`, "i"))
  const hit = a?.[1] ?? b?.[1]
  return hit ? parseAmount(hit) : null
}

const MCAP = String.raw`market\s*cap|mcap|mc\b|marketcap|valuation|fdv`
const LIQ = String.raw`liquidity|liq\b|pool|usdc in (?:the )?pool`
const VOL = String.raw`volume|vol\b|traded`

export interface ParsedQuery {
  filters: ScreenerFilters
  /** Plain-English list of what was understood ("market cap under $5M", …). */
  understood: string[]
  /** Show the riskiest first (screener has no such sort; we reverse "safest"). */
  riskiest: boolean
}

const money = (n: number) =>
  n >= 1e9 ? `$${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(1)}K` : `$${n}`

/**
 * Reads screener intent from a question. Returns null when the question isn't
 * a "find / show / list me tokens …" kind of question.
 */
export function parseScreenerQuery(question: string): ParsedQuery | null {
  const q = question.toLowerCase()
  const f: ScreenerFilters = { ...DEFAULT_FILTERS, view: "listed", tf: "24h" }
  const understood: string[] = []
  let riskiest = false

  const maxMcap = bound(q, MCAP, "under")
  const minMcap = bound(q, MCAP, "over")
  if (maxMcap) (f.maxMcap = maxMcap), understood.push(`market cap under ${money(maxMcap)}`)
  if (minMcap) (f.minMcap = minMcap), understood.push(`market cap over ${money(minMcap)}`)
  const minLiq = bound(q, LIQ, "over")
  if (minLiq) (f.minLiq = minLiq), understood.push(`liquidity over ${money(minLiq)}`)
  const minVol = bound(q, VOL, "over")
  if (minVol) (f.minVol = minVol), understood.push(`24h volume over ${money(minVol)}`)

  const score = q.match(new RegExp(`score\\s*(?:of|is)?\\s*(?:${OVER})?\\s*(\\d+(?:\\.\\d)?)\\s*(?:\\+|/10|or (?:more|higher|above))?`))
  if (score && Number(score[1]) <= 10) {
    f.minScore = Number(score[1])
    understood.push(`score ${f.minScore}/10 or higher`)
  }

  if (/healthy liquidity|deep liquidity|good liquidity|liquid\b/.test(q) && !minLiq) {
    f.minLiq = 5000
    understood.push("liquidity over $5K")
  }

  // age
  const age = q.match(/(?:last|past|under|less than|younger than|within)\s*(?:an?\s*|one\s*|1\s*)?(hour|6\s*h(?:ours?)?|24\s*h(?:ours?)?|day|week|7\s*d(?:ays)?)/)
  // only an age when they talk about launches ("new launches in the last hour"),
  // not "gainers in the last hour" (that's the timeframe)
  const aboutLaunch = /launch|\bnew\b|created|listed|deployed|\bage\b|\bold\b|minted/.test(q)
  if ((age && aboutLaunch) || /\b(?:brand[- ]new|fresh|just launched|launched today)\b/.test(q)) {
    const a = age?.[1] ?? "day"
    f.age = /^hour/.test(a) ? "1h" : /^6/.test(a) ? "6h" : /week|^7/.test(a) ? "7d" : "24h"
    understood.push(`launched in the last ${{ "1h": "hour", "6h": "6 hours", "24h": "24 hours", "7d": "7 days", all: "" }[f.age]}`)
  }

  // launchpad
  if (/\bargus\b/.test(q)) (f.pad = "ARGUS"), understood.push("launched on Argus")
  else if (/\btolly\b/.test(q)) (f.pad = "TOLLY"), understood.push("launched on Tolly")

  // DexScreener listing extras
  if (/boost/.test(q)) (f.has = "boosted"), understood.push("with paid DexScreener boosts")
  else if (/socials?|telegram|twitter|\bx\b handle|community|discord/.test(q)) (f.has = "community"), understood.push("with social links")
  else if (/profile|website|verified info|banner/.test(q)) (f.has = "profile"), understood.push("with a DexScreener profile")

  // band / risk
  if (/\b(?:safe|safest|healthy|low[- ]?risk|legit|clean|green)\b/.test(q)) {
    f.band = "healthy"
    f.sort = "safest"
    understood.push("scored healthy (7+/10)")
  } else if (/\b(?:risky|riskiest|dangerous|red|high[- ]?risk|sketchy)\b/.test(q)) {
    f.band = "risk"
    f.view = "all" // the riskiest are usually the flagged ones
    riskiest = true
    understood.push("scored risky (under 5/10)")
  } else if (/\bcaution|yellow|medium[- ]?risk\b/.test(q)) {
    f.band = "caution"
    understood.push("scored caution (5–6.9)")
  }

  // sort
  const sorts: Array<[RegExp, SortKey, string]> = [
    [/gainer|pump|up the most|green(?:est)?\b|rising|biggest (?:move|jump)/, "gainers", "biggest gainers first"],
    [/loser|dump|down the most|falling|dropp|crash|red(?:dest)?\b/, "losers", "biggest losers first"],
    [/\bnew(?:est)?\b|latest|recent|just launched|fresh/, "new", "newest first"],
    [/most liquid|highest liquidity|liquidity (?:leaders|ranking)|by liquidity/, "liquidity", "most liquidity first"],
    [/biggest|largest|highest (?:market cap|mcap)|by (?:market cap|mcap)|top (?:market cap|mcap)/, "mcap", "largest market cap first"],
    [/most (?:traded|volume)|highest volume|by volume|volume leaders/, "volume", "most volume first"],
    [/most (?:active|txns|transactions|trades)|busiest/, "txns", "most transactions first"],
    [/trend|hot|popular|everyone|buzz/, "trending", "trending first"],
  ]
  for (const [re, key, label] of sorts) {
    if (re.test(q) && !(key === "losers" && f.band === "risk" && /\bred\b/.test(q))) {
      if (f.sort === "safest" && key === "trending") continue
      f.sort = key
      understood.push(label)
      break
    }
  }

  // timeframe for gainers / volume
  const tf = q.match(/\b(?:last|past|in)\s*(5\s*m(?:in)?|(?:an?\s*|1\s*)?hour|1\s*h|6\s*h(?:ours?)?|24\s*h(?:ours?)?|day)\b/)
  if (tf) {
    const t = tf[1]!
    f.tf = /^5/.test(t) ? "5m" : /hour|^1/.test(t) ? "1h" : /^6/.test(t) ? "6h" : "24h"
  }

  const asksForList =
    /\b(?:find|show|list|give|which|what|any|top|best|get|search|filter|tokens?|coins?|gems?|launches|memes?|projects?|gainers?|losers?|movers?|pumps?|biggest|newest|safest|riskiest)\b/.test(q)
  return understood.length > 0 && asksForList ? { filters: f, understood, riskiest } : null
}

/** Two or more things to compare: "$A vs $B", "compare 0x… and 0x…". */
export function comparePair(question: string): string[] | null {
  if (!/\bvs\.?\b|versus|compare|comparison|better[, ]|or\b.*\?|difference between/i.test(question)) return null
  const addrs = question.match(/0x[0-9a-fA-F]{40}/g) ?? []
  const tickers = [...question.matchAll(/\$([A-Za-z][A-Za-z0-9]{1,14})\b/g)].map((m) => m[1]!)
  let items = [...addrs.map((a) => a.toLowerCase()), ...tickers]
  if (items.length < 2) {
    // "compare WINDMILL and FLY" — bare upper-case words
    const bare = (question.match(/\b[A-Z][A-Z0-9]{1,14}\b/g) ?? []).filter((w) => !/^(VS|AND|OR|THE|IS|A|I|TO)$/.test(w))
    items = [...items, ...bare]
  }
  const uniq = [...new Set(items)]
  return uniq.length >= 2 ? uniq.slice(0, 3) : null
}

const GLOSSARY: Array<[RegExp, string]> = [
  [
    /\bscore|how (?:do|does) (?:you|riven) (?:rate|score|judge)|methodolog|rating/,
    "Riven scores every Arc token from 1 to 10 using only on-chain data. Five parts add up to 100 points: Contract 25 (can someone still mint or change it?), Liquidity 20 (real USDC in the pool, can it be pulled?), Holders 25 (how concentrated the supply is), Creator 15 (what happened to their earlier launches) and Activity 15 (real buyers and sellers vs wash trading). Hard caps stop a token from looking healthy while someone can still take the money. 7+ = healthy, 5–6.9 = caution, under 5 = risky. New tokens have to prove themselves over time, so very fresh launches start lower.",
  ],
  [
    /rug ?pull|\brug\b|rugged/,
    "A rug pull is when the people behind a token take the money out — usually by removing the pool's liquidity (so nobody can sell) or by dumping a big supply they kept. Riven watches for both: a liquidity pull or a large creator sale raises an alert and drops the score.",
  ],
  [
    /liquidity|\bliq\b|\blp\b/,
    "Liquidity is the money sitting in a token's trading pool. On Arc pools are quoted in USDC, so it's the real dollars a seller can exit into. Low liquidity means even small sales move the price a lot; liquidity that can be removed is the classic rug setup.",
  ],
  [
    /market ?cap|\bmcap\b|\bfdv\b/,
    "Market cap is price × total supply — what the whole token would be worth at today's price. It's not money anyone can actually take out; compare it with liquidity (real USDC in the pool) to see how thin it is.",
  ],
  [
    /wash trad/,
    "Wash trading is fake volume: the same wallets buying and selling to themselves so a token looks busy. Riven flags it when a day's volume is over 50× the USDC actually in the pool.",
  ],
  [
    /holder|concentrat|whale/,
    "Holders are the wallets owning a token. If a few wallets hold most of the supply (high concentration), they can crash the price by selling. Whales are those big holders; Riven alerts when one sells a large chunk.",
  ],
  [
    /\barc\b|circle'?s chain|what is this chain/,
    "Arc is Circle's Layer-1 blockchain. Gas is paid in USDC, so fees are in dollars and every pool here is quoted in USDC. Riven indexes Arc mainnet directly: launches from the Argus and Tolly launchpads plus Uniswap-style pools.",
  ],
  [
    /perp|perpetual|futures/,
    "A perp (perpetual future) is a contract that tracks a coin's price with no expiry, so you can bet on it going up (long) or down (short), often with leverage. Riven shows Hyperliquid perp markets, the news moving them and Riven Scanner's calls (setups found on Bybit, MEXC and Binance), and lets you use Arc USDC as margin. Leverage magnifies losses as much as gains.",
  ],
  [
    /funding/,
    "Funding is the fee longs and shorts pay each other every hour on a perp to keep its price near the real one. Positive funding means longs pay shorts (the market is long-heavy); negative means shorts pay longs.",
  ],
  [
    /open interest|\boi\b/,
    "Open interest is the total value of perp positions still open. Rising open interest with a price move means new money is joining the move; falling open interest means positions are closing.",
  ],
  [
    /boost/,
    "Boosts are paid promotion on DexScreener — a team pays to push its token up the trending list. Riven shows the ⚡ count so you know when visibility was bought. A boost says nothing about safety.",
  ],
  [
    /profile|socials?|community/,
    "A DexScreener profile means the team added a logo, banner and description; community means it lists social links like Telegram or X. Use the Profile and Community filters on the Tokens page. They show effort, not safety — scammers add socials too.",
  ],
  [
    /usdc|gas/,
    "USDC is Circle's dollar stablecoin. On Arc it's also the gas token, so you pay transaction fees in dollars instead of a volatile coin, and every trading pool is priced in USDC.",
  ],
  [
    /telegram|alert me|notify|notification/,
    "Riven can message you on Telegram: open a token or perp pair, tap “Alert me on Telegram”, link your account once with the bot, and you'll get liquidity pulls, creator sales, score drops and new perp calls for the things you track.",
  ],
  [
    /signal|call|sakz|scanner|confidence|win prob/,
    "Perp calls come from Riven Scanner (powered by sakz-bot), which looks for setups on Bybit, MEXC and Binance; the prices and paper trading on Riven are Hyperliquid's. Each call has a bias (long/short), entry, stop loss and three targets, plus a confidence that's calibrated against how its past calls actually played out. Expired calls are deleted. Calls are data, not advice.",
  ],
]

/** "What is X / what does X mean / how does Y work" → a plain explanation, or null. */
export function explainConcept(question: string): string | null {
  const q = question.toLowerCase()
  if (!/\bwhat(?:'s| is| are| does| do)\b|\bexplain\b|\bmeaning\b|\bmean\b|\bhow (?:does|do|is|are)\b|\bdefine\b|\btell me about\b/.test(q)) return null
  // A question about a specific token is not a definition.
  if (/0x[0-9a-f]{40}|\$[a-z][a-z0-9]{1,14}\b/.test(q)) return null
  for (const [re, text] of GLOSSARY) if (re.test(q)) return text
  return null
}

/** Words that mean "the thing we were just talking about". */
export const FOLLOW_UP = /\b(?:it|its|it's|this|that|they|them|their|same|one)\b/i

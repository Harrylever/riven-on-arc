// Server-only. Crypto news from free RSS feeds (no API key), tagged with the
// coins each story mentions and a simple bullish / bearish read. Feeds the
// perps pages and Riven's "why is this pair moving?" analysis.

export interface NewsItem {
  id: string
  title: string
  url: string
  source: string
  publishedAt: string
  summary: string
  image: string | null
  /** Perp coins the story mentions (BTC, ETH, SOL…). */
  coins: string[]
  sentiment: "bullish" | "bearish" | "neutral"
}

const FEEDS: Array<{ source: string; url: string }> = [
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { source: "Decrypt", url: "https://decrypt.co/feed" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { source: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/.rss/full/" },
]

/** Names people write in headlines → the perp ticker. Tickers match on their own too. */
const ALIASES: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  solana: "SOL",
  ripple: "XRP",
  dogecoin: "DOGE",
  cardano: "ADA",
  avalanche: "AVAX",
  chainlink: "LINK",
  polkadot: "DOT",
  litecoin: "LTC",
  tron: "TRX",
  toncoin: "TON",
  "the open network": "TON",
  sui: "SUI",
  aptos: "APT",
  arbitrum: "ARB",
  optimism: "OP",
  near: "NEAR",
  cosmos: "ATOM",
  injective: "INJ",
  celestia: "TIA",
  hyperliquid: "HYPE",
  pepe: "PEPE",
  shiba: "SHIB",
  "shiba inu": "SHIB",
  bonk: "BONK",
  dogwifhat: "WIF",
  uniswap: "UNI",
  aave: "AAVE",
  ethena: "ENA",
  jupiter: "JUP",
  worldcoin: "WLD",
  "render": "RENDER",
  filecoin: "FIL",
  stellar: "XLM",
  monero: "XMR",
  "bitcoin cash": "BCH",
  polygon: "POL",
  sei: "SEI",
  zcash: "ZEC",
  "binance coin": "BNB",
  bnb: "BNB",
  pump: "PUMP",
}

const BULL = /\b(surge[sd]?|soar(s|ed|ing)?|rall(y|ies|ied)|jump(s|ed)?|spike[sd]?|record high|all-time high|ath|breakout|bull(ish)?|approv(es|ed|al)|etf inflows?|partnership|integrat(es|ion)|listing|lists|launch(es|ed)?|upgrade|adopt(s|ion)|buys?|accumulat\w*|gains?|climbs?|rebound\w*)\b/i
const BEAR = /\b(plunge[sd]?|crash(es|ed)?|tumble[sd]?|slump\w*|drop(s|ped)?|falls?|fell|sell-?off|bear(ish)?|hack(ed|s)?|exploit(ed)?|drain(ed)?|lawsuit|sues|sued|charges?|ban(s|ned)?|delist\w*|outflows?|liquidat\w*|scam|fraud|rug(ged)?|rug pull|probe|investigat\w*|halt(s|ed)?|outage|depeg\w*|warn(s|ing)?)\b/i

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#822[01];|&[lr]dquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? ""

/** Which coins a story is about: ticker words ($SOL / SOL) and names (Solana). */
export function coinsIn(text: string, known: Set<string>): string[] {
  const out = new Set<string>()
  const lower = ` ${text.toLowerCase()} `
  for (const [name, coin] of Object.entries(ALIASES)) {
    if (new RegExp(`[^a-z]${name}[^a-z]`).test(lower)) out.add(coin)
  }
  for (const m of text.matchAll(/\$?\b([A-Z][A-Z0-9]{2,9})\b/g)) {
    const t = m[1]!
    // bare 3-letter caps words are often not tickers (CEO, SEC, ETF…): need $ or a known perp
    if (known.has(t) && !NOT_TICKERS.has(t)) out.add(t)
  }
  return [...out]
}
const NOT_TICKERS = new Set(["CEO", "SEC", "ETF", "USD", "THE", "AND", "FOR", "NEW", "CFTC", "IPO", "API", "DEX", "CEX", "NFT", "DAO", "GDP", "CPI", "FED", "ONE", "TWO", "ALL", "NOW", "TOP"])

export function sentimentOf(text: string): NewsItem["sentiment"] {
  const b = (text.match(new RegExp(BULL.source, "gi")) ?? []).length
  const s = (text.match(new RegExp(BEAR.source, "gi")) ?? []).length
  return b > s ? "bullish" : s > b ? "bearish" : "neutral"
}

function parseFeed(xml: string, source: string, known: Set<string>): NewsItem[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  return items.flatMap((it) => {
    const title = decode(tag(it, "title"))
    const url = decode(tag(it, "link")) || (it.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "")
    if (!title || !/^https?:\/\//.test(url)) return []
    const summary = decode(tag(it, "description")).slice(0, 280)
    const date = new Date(decode(tag(it, "pubDate")) || decode(tag(it, "dc:date")) || Date.now())
    const image =
      it.match(/<media:content[^>]*url="([^"]+)"/i)?.[1] ??
      it.match(/<media:thumbnail[^>]*url="([^"]+)"/i)?.[1] ??
      it.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i)?.[1] ??
      tag(it, "description").match(/<img[^>]*src="([^"]+)"/i)?.[1] ??
      null
    return [
      {
        id: url,
        title,
        url,
        source,
        publishedAt: (isNaN(date.getTime()) ? new Date() : date).toISOString(),
        summary,
        image: image && /^https:\/\//.test(image) ? image : null,
        coins: coinsIn(`${title} ${summary}`, known),
        sentiment: sentimentOf(`${title} ${summary}`),
      },
    ]
  })
}

/**
 * Latest crypto news, newest first, de-duplicated across feeds. Cached for 5
 * minutes by Next's fetch cache, so pages and Riven share one pull.
 */
export async function getNews(opts: { coin?: string; limit?: number; known?: string[] } = {}): Promise<NewsItem[]> {
  const known = new Set([...(opts.known ?? []), ...Object.values(ALIASES)])
  const feeds = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: { "user-agent": "Mozilla/5.0 (RivenNews; +https://riven.app)", accept: "application/rss+xml, application/xml, text/xml" },
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return []
        return parseFeed(await res.text(), f.source, known)
      } catch {
        return []
      }
    }),
  )
  const seen = new Set<string>()
  let all = feeds
    .flat()
    .filter((n) => {
      const k = n.title.toLowerCase().slice(0, 80)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  if (opts.coin) {
    const c = opts.coin.toUpperCase()
    all = all.filter((n) => n.coins.includes(c))
  }
  return all.slice(0, opts.limit ?? 30)
}

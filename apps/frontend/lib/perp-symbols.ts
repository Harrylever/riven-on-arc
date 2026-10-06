/**
 * sakz-bot reports CEX perp symbols (Bybit/Binance/MEXC): "BTCUSDT", "1000PEPEUSDT".
 * Hyperliquid names the same contracts "BTC" and "kPEPE" — meme coins quoted per
 * 1,000 units get a "k" prefix instead of "1000". Without this mapping every
 * 1000x meme signal silently failed to match a market and never showed up.
 * Keys are upper-case so they compare against market.symbol.toUpperCase().
 */
export function signalCoinKey(symbol: string): string {
  const base = symbol
    .toUpperCase()
    .replace(/[-_/]/g, "")
    .replace(/(USDT|USDC|USD|PERP)+$/, "")
  const thousand = base.match(/^1000([A-Z].*)$/)
  return thousand ? `K${thousand[1]}` : base
}

export function marketKey(hyperliquidSymbol: string): string {
  return hyperliquidSymbol.toUpperCase()
}

/** Hyperliquid meme perps: every "k"-prefixed 1000x contract plus well-known memes. */
const MEMES = new Set([
  "DOGE", "WIF", "POPCAT", "FARTCOIN", "PENGU", "TRUMP", "MELANIA", "BRETT", "MEW", "MOODENG",
  "GOAT", "PNUT", "SPX", "TURBO", "NEIRO", "NEIROETH", "MOG", "BOME", "MYRO", "PEOPLE", "CHILLGUY",
  "GRIFFAIN", "AI16Z", "BABY", "PUMP", "BRETT", "WOJAK", "TROLL", "USELESS", "HYPE",
])
const MAJORS = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "HYPE", "ADA", "AVAX", "LINK", "SUI", "LTC", "DOT", "TRX"])

export function isMemePerp(symbol: string): boolean {
  const u = symbol.toUpperCase()
  return /^K[A-Z]{2,}$/.test(u) || (MEMES.has(u) && u !== "HYPE")
}

export function isMajorPerp(symbol: string): boolean {
  return MAJORS.has(symbol.toUpperCase())
}

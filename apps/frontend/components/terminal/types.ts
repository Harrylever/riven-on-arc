import type { MadeOnSolTrade } from "@/lib/kols"
import type { Coordination, KolRow } from "@/lib/kol-intel"
import type { HoldersPayload } from "@/app/api/terminal/[mint]/route"
import type { LeaderboardTokenItem, TokenDetailResponse } from "@/lib/mock"

export type View = "tokens" | "perps" | "watchlist" | "kol" | "signals"
/** "crypto" is a price reference for majors, not a ClawDex-scored feed, so it
 * renders its own panel instead of the token list. */
export type Cat =
  | "crypto"
  | "trending"
  | "mostheld"
  | "graduated"
  | "bonding"
  | "koth"
  | "gainers"
  | "community"
  | "new"
export type Tab = "chart" | "safety" | "holders" | "kol"

/** Feed poll interval: 6 seconds so prices and stats live-refresh smoothly across the app */
export const REFRESH_MS = 6_000

export const CATEGORIES: { value: Cat; label: string; blurb: string }[] = [
  {
    value: "crypto",
    label: "Crypto",
    blurb:
      "Reference prices for major assets. Not Solana memecoins and not scored by ClawDex.",
  },
  {
    value: "trending",
    label: "Trending",
    blurb:
      "Most traded recently — ranked by 6h volume, then 24h volume, then score.",
  },
  {
    value: "mostheld",
    label: "Most held",
    blurb: "Ranked by number of wallets holding the token.",
  },
  {
    value: "graduated",
    label: "Graduated",
    blurb: "Completed the bonding curve and moved to an AMM pool.",
  },
  {
    value: "bonding",
    label: "Bonding",
    blurb: "Still on the curve, closest to graduating first.",
  },
  {
    value: "koth",
    label: "King of the hill",
    blurb: "Highest market cap of the tokens still on the curve.",
  },
  {
    value: "gainers",
    label: "Gainers",
    blurb: "Biggest 24h price gains among tokens with real volume.",
  },
  {
    value: "community",
    label: "Community",
    blurb: "Tokens with a linked X account, site or Telegram.",
  },
  { value: "new", label: "New", blurb: "Newest launches ClawDex has indexed." },
]

export interface KolPayload {
  trades: MadeOnSolTrade[]
  leaderboard: KolRow[]
  coordination: Coordination[]
  delay: string | null
  asOf: string | null
  available: boolean
}

export interface Signal {
  id: string
  type: string
  message: string
  symbol: string
  mint: string
  createdAt: string
}

export interface DetailPayload {
  detail: TokenDetailResponse
  kol: {
    trades: MadeOnSolTrade[]
    buysCount: number
    sellsCount: number
    asOf: string
  }
  holders: HoldersPayload | null
  alerts: { id: string; type: string; message: string; createdAt: string }[]
}

/** The metric a category ranks on, shown on each row so the ordering is legible. */
export function categoryMetric(
  t: LeaderboardTokenItem,
  cat: Cat,
): string | null {
  switch (cat) {
    case "mostheld":
      return t.holderCount != null
        ? `${t.holderCount.toLocaleString()} holders`
        : "— holders"
    case "bonding":
      return t.bondingProgress != null
        ? `${(t.bondingProgress * 100).toFixed(1)}% bonded`
        : null
    case "koth":
      return t.curveMarketCapSol != null
        ? `${t.curveMarketCapSol.toFixed(1)} SOL on curve`
        : null
    case "community":
      return (
        [t.twitter && "X", t.website && "site", t.telegram && "TG"]
          .filter(Boolean)
          .join(" · ") || null
      )
    case "graduated":
      return "graduated"
    default:
      return null
  }
}

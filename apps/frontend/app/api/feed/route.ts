import { NextResponse } from "next/server"
import { getLeaderboard, type FeedSort, type FeedTimeframe } from "@/lib/api"

// Live market data: never served from a build-time or route cache.
export const dynamic = "force-dynamic"

const CATEGORIES: FeedSort[] = [
  "trending",
  "new",
  "gainers",
  "mostheld",
  "graduated",
  "bonding",
  "koth",
  "community",
]

const TIMEFRAMES: FeedTimeframe[] = ["5m", "1h", "6h", "24h"]

/** GET /api/feed?cat=trending|new|gainers|mostheld|graduated|bonding|koth|community&timeframe=5m|1h|6h|24h */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const rawCat =
    url.searchParams.get("cat") ?? url.searchParams.get("sort") ?? "trending"
  const cat = (CATEGORIES as string[]).includes(rawCat)
    ? (rawCat as FeedSort)
    : "trending"

  const rawTf =
    url.searchParams.get("timeframe") ?? url.searchParams.get("tf") ?? "24h"
  const timeframe = (TIMEFRAMES as string[]).includes(rawTf)
    ? (rawTf as FeedTimeframe)
    : "24h"

  const { tokens, source } = await getLeaderboard("", cat, timeframe)
  return NextResponse.json({ tokens, source: source ?? null, cat, timeframe })
}

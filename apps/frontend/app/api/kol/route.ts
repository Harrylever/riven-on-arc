import { NextResponse } from "next/server"
import { getMadeOnSolFeed } from "@/lib/kols"
import { buildKolLeaderboard, findCoordination } from "@/lib/kol-intel"

// Live market data: never served from a build-time or route cache.
export const dynamic = "force-dynamic"

/** GET /api/kol: recent KOL trades, a win-rate leaderboard and coordination (3+ KOLs buying one token in an hour). */
export async function GET() {
  const feed = await getMadeOnSolFeed(100)
  return NextResponse.json({
    trades: feed.trades.slice(0, 40),
    leaderboard: buildKolLeaderboard(feed.trades).slice(0, 15),
    coordination: findCoordination(feed.trades),
    delay: feed.delay ?? null,
    asOf: feed.as_of ?? null,
    available: feed.trades.length > 0,
  })
}

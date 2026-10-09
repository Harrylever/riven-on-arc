import { NextResponse } from "next/server"
import { getScreener } from "@/lib/arc-data"
import { DEFAULT_FILTERS } from "@/lib/screener-params"

export const dynamic = "force-dynamic"

/**
 * GET /api/arc/ticker — what's moving on Arc right now for the header strip:
 * most traded in the last hour, topped up with the day's leaders.
 */
export async function GET() {
  try {
    const [hour, day] = await Promise.all([
      getScreener({ ...DEFAULT_FILTERS, view: "listed", sort: "trending", tf: "1h" }, 16),
      getScreener({ ...DEFAULT_FILTERS, view: "listed", sort: "trending", tf: "24h" }, 12),
    ])
    const tokens = [...new Map([...hour.tokens, ...day.tokens].map((t) => [t.address, t])).values()].slice(0, 22)
    return NextResponse.json(
      {
        tokens: tokens.map((t) => ({
          address: t.address,
          symbol: t.symbol,
          image: t.image,
          marketCap: t.marketCap,
          change24h: t.change.h1 ?? t.change.h24,
          score: t.score,
          band: t.band,
          fake: t.fake,
        })),
      },
      { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } },
    )
  } catch (err) {
    console.error(`[arc/ticker] ${(err as Error).message}`)
    return NextResponse.json({ tokens: [], error: "unavailable" }, { status: 503 })
  }
}

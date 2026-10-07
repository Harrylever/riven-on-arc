import { NextResponse } from "next/server"
import { getScreener } from "@/lib/arc-data"
import { DEFAULT_FILTERS } from "@/lib/screener-params"

export const dynamic = "force-dynamic"

/** GET /api/arc/ticker — the most-traded Arc tokens for the header strip (flagged ones included, marked). */
export async function GET() {
  try {
    const { tokens } = await getScreener({ ...DEFAULT_FILTERS, view: "all", sort: "trending" }, 18)
    return NextResponse.json(
      {
        tokens: tokens.map((t) => ({
          address: t.address,
          symbol: t.symbol,
          image: t.image,
          marketCap: t.marketCap,
          change24h: t.change.h24,
          score: t.score,
          band: t.band,
          fake: t.fake,
        })),
      },
      { headers: { "cache-control": "public, max-age=20, stale-while-revalidate=60" } },
    )
  } catch (err) {
    console.error(`[arc/ticker] ${(err as Error).message}`)
    return NextResponse.json({ tokens: [], error: "unavailable" }, { status: 503 })
  }
}

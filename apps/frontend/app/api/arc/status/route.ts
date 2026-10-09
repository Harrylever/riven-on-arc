import { NextResponse } from "next/server"
import { getStats, getSyncStatus } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

/**
 * GET /api/arc/status — last indexed Arc block and 24h launch/score counts.
 * ?light=1 returns only the sync cursor (cheap; the header polls it).
 */
export async function GET(req: Request) {
  const light = new URL(req.url).searchParams.get("light") === "1"
  try {
    return NextResponse.json(light ? await getSyncStatus() : await getStats(), {
      headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" },
    })
  } catch (err) {
    console.error(`[arc/status] ${(err as Error).message}`)
    return NextResponse.json(
      { lastBlock: null, syncedAt: null, error: "unavailable" },
      { status: 503 },
    )
  }
}

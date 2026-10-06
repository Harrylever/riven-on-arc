import { NextResponse } from "next/server"
import { getStats } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

/** GET /api/arc/status — last indexed Arc block and 24h launch/score counts. */
export async function GET() {
  try {
    return NextResponse.json(await getStats())
  } catch (err) {
    console.error(`[arc/status] ${(err as Error).message}`)
    return NextResponse.json({ lastBlock: null, syncedAt: null, error: "unavailable" }, { status: 503 })
  }
}

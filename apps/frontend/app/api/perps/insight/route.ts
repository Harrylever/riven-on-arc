import { NextResponse } from "next/server"
import { getPerpInsight } from "@/lib/perp-insight"

export const dynamic = "force-dynamic"

/** GET /api/perps/insight?coin=SOL — Riven's read of a pair: move, funding, news, open call. */
export async function GET(req: Request) {
  const coin = new URL(req.url).searchParams.get("coin")?.toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!coin) return NextResponse.json({ error: "coin required" }, { status: 400 })
  try {
    return NextResponse.json(await getPerpInsight(coin))
  } catch (err) {
    console.error(`[perps/insight] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

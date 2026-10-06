import { NextResponse } from "next/server"
import { getTokensByAddress } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

/** GET /api/arc/tokens?addresses=0x..,0x.. — summaries for the watchlist (max 50). */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("addresses") ?? ""
  const addresses = raw.split(",").map((a) => a.trim()).filter(Boolean).slice(0, 50)
  try {
    return NextResponse.json({ tokens: await getTokensByAddress(addresses) })
  } catch (err) {
    console.error(`[arc/tokens] ${(err as Error).message}`)
    return NextResponse.json({ tokens: [], error: "unavailable" }, { status: 503 })
  }
}

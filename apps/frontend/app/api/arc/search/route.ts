import { NextResponse } from "next/server"
import { searchTokens } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

/** GET /api/arc/search?q= — a 0x address, ticker or name. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80)
  try {
    return NextResponse.json({ q, tokens: await searchTokens(q) })
  } catch (err) {
    console.error(`[arc/search] ${(err as Error).message}`)
    return NextResponse.json({ q, tokens: [], error: "unavailable" }, { status: 503 })
  }
}

import { NextResponse } from "next/server"
import { getPortfolio } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

/** GET /api/arc/portfolio?wallet=0x… — a wallet's holdings in tokens Riven tracks, with scores. */
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet") ?? ""
  try {
    const p = await getPortfolio(wallet)
    if (!p)
      return NextResponse.json(
        { error: "Enter a valid 0x wallet address" },
        { status: 400 },
      )
    return NextResponse.json(p)
  } catch (err) {
    console.error(`[arc/portfolio] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

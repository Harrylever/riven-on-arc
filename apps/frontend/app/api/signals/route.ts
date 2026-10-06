import { NextResponse } from "next/server"
import { getDb } from "@clawdex/shared"

// Live market data: never served from a build-time or route cache.
export const dynamic = "force-dynamic"

/** GET /api/signals: latest monitoring alerts (concentration shifts, volume spikes, KOL coordination, ...). */
export async function GET() {
  try {
    const rows = await getDb().alert.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { token: { select: { symbol: true, mint: true } } },
    })
    return NextResponse.json({
      signals: rows.map((a) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        symbol: a.token.symbol,
        mint: a.token.mint,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.warn("[api/signals] database unavailable, serving empty feed")
    return NextResponse.json({ signals: [] })
  }
}

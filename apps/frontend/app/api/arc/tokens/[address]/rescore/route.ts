import { getDb } from "@riven/shared"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * POST — "Riven, scan this token now": flags it for the scorer's next pass
 * (~30–60s) instead of its normal cadence. Repeat taps within 30s are no-ops.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const mint = address.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(mint)) return NextResponse.json({ error: "bad address" }, { status: 400 })
  try {
    const db = getDb()
    const recent = new Date(Date.now() - 30_000)
    const res = await db.token.updateMany({
      where: { mint, OR: [{ rescoreRequestedAt: null }, { rescoreRequestedAt: { lt: recent } }] },
      data: { rescoreRequestedAt: new Date() },
    })
    return NextResponse.json({ ok: true, queued: res.count > 0 })
  } catch (err) {
    console.error(`[rescore] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

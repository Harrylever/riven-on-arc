import { getDb } from "@riven/shared"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * POST — "Riven, scan this token now": flags it for the scorer's next pass (runs every 5 minutes) and for the
 * holder backfill, instead of waiting for its normal turn. Repeat taps within 30s are no-ops.
 *
 * `?auto=1` is the token page asking on its own when it opens a token that has no score. That is stricter: it only
 * queues a token that is unscored and has a pool, and ignores repeats for 10 minutes, so it cannot be used to force
 * constant rescoring of tokens that already have a score.
 */
export async function POST(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const mint = address.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(mint)) return NextResponse.json({ error: "bad address" }, { status: 400 })
  const auto = new URL(req.url).searchParams.get("auto") === "1"
  try {
    const db = getDb()
    const recent = new Date(Date.now() - (auto ? 10 * 60_000 : 30_000))
    const res = await db.token.updateMany({
      where: {
        mint,
        OR: [{ rescoreRequestedAt: null }, { rescoreRequestedAt: { lt: recent } }],
        ...(auto ? { pools: { some: {} }, AND: [{ OR: [{ scoreLatest: null }, { scoreLatest: { is: { score: null } } }] }] } : {}),
      },
      data: { rescoreRequestedAt: new Date() },
    })
    return NextResponse.json({ ok: true, queued: res.count > 0 })
  } catch (err) {
    console.error(`[rescore] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

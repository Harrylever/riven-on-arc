import { getDb } from "@riven/shared"
import { NextResponse } from "next/server"
import { scanStatus } from "@/lib/scan-status"

export const dynamic = "force-dynamic"

/**
 * GET: where an unscored token is on its way to a score (queued, reading holders, waiting for the indexer, scored,
 * or cannot be scored), so the token page can show real progress while it waits. Read-only and cheap: two small
 * queries.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const mint = address.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(mint)) return NextResponse.json({ error: "bad address" }, { status: 400 })
  try {
    const db = getDb()
    const [token, cursor] = await Promise.all([
      db.token.findUnique({
        where: { mint },
        select: {
          launchBlock: true,
          holderHistory: true,
          rescoreRequestedAt: true,
          scoreLatest: { select: { score: true } },
          pools: { orderBy: { createdAt: "asc" }, take: 1, select: { venue: true } },
        },
      }),
      db.arcIndexerCursor.findUnique({ where: { source: "arc:activity" } }),
    ])
    if (!token) return NextResponse.json({ error: "not found" }, { status: 404 })
    const status = scanStatus({
      score: token.scoreLatest?.score ?? null,
      holderHistory: token.holderHistory,
      requestedAt: token.rescoreRequestedAt?.getTime() ?? null,
      poolVenue: token.pools[0]?.venue ?? null,
      launchBlock: token.launchBlock === null ? null : Number(token.launchBlock),
      activityBlock: cursor ? Number(cursor.lastBlock) : null,
      now: Date.now(),
    })
    return NextResponse.json(status, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    console.error(`[scan] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

import { NextResponse } from "next/server"
import { ARC_METHODOLOGY } from "@riven/shared"
import { getTokensByAddress } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

const CORS = { "access-control-allow-origin": "*" }

/**
 * GET /api/arc/tokens/0x… — Riven's public read of one token, for launchpads,
 * wallets and bots that want to show the score next to their own listing.
 * Evidence only: the same flags the token page shows, with the data timestamp.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "bad address" }, { status: 400, headers: CORS })
  }
  try {
    const [t] = await getTokensByAddress([address])
    if (!t) return NextResponse.json({ error: "unknown token" }, { status: 404, headers: CORS })
    return NextResponse.json(
      {
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        score: t.score,
        band: t.band,
        verdict: t.verdict,
        flagged: t.fake,
        flags: t.fakeReasons,
        flagCodes: t.fakeCodes,
        usdcInPool: t.usdcInPool,
        reportedLiquidityUsd: t.liquidityUsd,
        holders: t.holders,
        scoredAt: t.scoredAt,
        methodology: ARC_METHODOLOGY,
        url: `/token/${t.address}`,
        notice: "Evidence from on-chain data, not financial advice.",
      },
      { headers: { ...CORS, "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } },
    )
  } catch (err) {
    console.error(`[arc/token] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: CORS })
  }
}

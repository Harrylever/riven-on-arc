import { NextResponse } from "next/server"
import { getDb, computeScore, type ScoreInput } from "@clawdex/shared"

/**
 * POST /api/score — computes a score from already-gathered inputs and stores it.
 *
 * This does NOT gather the raw on-chain numbers itself (concentration,
 * attributed burns, liquidity ratio, authority/LP-lock status) — that's
 * the indexer's job (Phase 1, not built yet). This endpoint is what
 * the indexer/score-cron calls once it has those numbers. Internal-use only
 * for now — no auth, do not expose publicly as-is.
 */
export async function POST(req: Request) {
  const secret = process.env.SCORE_API_SECRET
  if (!secret || req.headers.get("x-score-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as { tokenId: string } & ScoreInput

  if (!body.tokenId || body.authorityGate === undefined) {
    return NextResponse.json(
      { error: "tokenId and authorityGate (object or null) are required" },
      { status: 400 },
    )
  }

  const breakdown = computeScore({
    authorityGate: body.authorityGate,
    concentrationScore: body.concentrationScore ?? null,
    burnScore: body.burnScore ?? null,
    liquidityScore: body.liquidityScore ?? null,
  })
  const db = getDb()

  const row = await db.scoreRun.create({
    data: {
      tokenId: body.tokenId,
      score: breakdown.score,
      gate: breakdown.gate,
      concentration: breakdown.concentration,
      burnScore: breakdown.burnScore,
      liquidityScore: breakdown.liquidityScore,
      partial: breakdown.partial,
      confidence: breakdown.confidence,
    },
  })

  return NextResponse.json({ breakdown, row })
}

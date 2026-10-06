import { NextResponse } from "next/server"
import { getDb, resolveTokenByMint } from "@clawdex/shared"
import {
  toAuthorityDetail,
  toBurnDetail,
  toScoreDetail,
  toTokenIdentity,
} from "@/lib/contract"

// Live market data: never served from a build-time or route cache.
export const dynamic = "force-dynamic"

/**
 * GET /api/token/[mint] — full breakdown: token info, latest score,
 * authority/LP status, recent burns, recent monitoring alerts, in the response
 * shape of docs/BLUEPRINT.md section 4 (see lib/contract.ts for the mapping
 * from raw Prisma rows).
 *
 * A DB miss falls back to on-demand resolution via Helius getAsset instead of
 * 404ing — see resolveTokenByMint's known gaps in packages/shared.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params
  if (process.env.NEXT_PUBLIC_CHAIN_MODE !== "solana") {
    return NextResponse.json(
      {
        error:
          "Arc token scoring is not available until launch events are decoded and scored.",
      },
      { status: 503 },
    )
  }
  const db = getDb()

  let token
  try {
    token = await db.token.findUnique({ where: { mint } })
  } catch (err) {
    console.error(
      "[api/token] database unavailable:",
      (err as Error).message.split("\n").pop(),
    )
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  }

  if (!token) {
    const rpcUrl = process.env.SOLANA_RPC_URL
    if (!rpcUrl) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 })
    }
    token = await resolveTokenByMint(mint, rpcUrl)
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 })
    }
  }

  let latestScore = null
  let authorityCheck = null
  let recentBurns: Awaited<ReturnType<typeof db.burn.findMany>> = []
  let recentAlerts: Awaited<ReturnType<typeof db.alert.findMany>> = []

  try {
    ;[latestScore, authorityCheck, recentBurns, recentAlerts] =
      await Promise.all([
        db.scoreRun.findFirst({
          where: { tokenId: token.id },
          orderBy: { calculatedAt: "desc" },
        }),
        db.tokenAuthorityCheck.findFirst({
          where: { tokenId: token.id },
          orderBy: { checkedAt: "desc" },
        }),
        db.burn.findMany({
          where: { tokenId: token.id },
          orderBy: { burnedAt: "desc" },
          take: 10,
        }),
        db.alert.findMany({
          where: { tokenId: token.id },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ])
  } catch (e) {
    console.warn(
      "[api/token] subsidiary query skipped due to DB:",
      (e as Error).message,
    )
  }

  return NextResponse.json({
    token: toTokenIdentity(token),
    score: latestScore ? toScoreDetail(latestScore) : null,
    authorityCheck: authorityCheck ? toAuthorityDetail(authorityCheck) : null,
    recentBurns: recentBurns.map(toBurnDetail),
    recentAlerts,
  })
}

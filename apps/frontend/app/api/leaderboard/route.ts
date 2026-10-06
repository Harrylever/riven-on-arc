import { NextResponse } from "next/server"
import { getDb, readBondingCurves, type CurveState } from "@clawdex/shared"
import { num } from "@/lib/contract"

// Live market data: never served from a build-time or route cache.
export const dynamic = "force-dynamic"

/**
 * GET /api/leaderboard — ClawDex's own indexed tokens, newest launch first, each
 * with its latest score (null when not yet scored), latest market snapshot,
 * holder count and bonding-curve state. Ranking is applied by the caller so
 * unscored fresh launches are never hidden from the feed.
 */
export async function GET() {
  if (process.env.NEXT_PUBLIC_CHAIN_MODE !== "solana") {
    return NextResponse.json({ tokens: [], source: "arc-indexing" })
  }

  const db = getDb()

  try {
    // On-demand resolved tokens (someone opened a CA) have no real launch time
    // — launchTime is the lookup time — so they are kept out of the launch feed.
    const tokens = await db.token.findMany({
      where: { discoveredVia: { not: "ON_DEMAND_RESOLUTION" } },
      orderBy: { launchTime: "desc" },
      take: 200,
      include: { pools: { select: { id: true, address: true, venue: true } } },
    })

    if (tokens.length === 0) return NextResponse.json({ tokens: [] })

    const tokenIds = tokens.map((t) => t.id)
    const poolIds = tokens.flatMap((t) => t.pools.map((p) => p.id))

    const [scores, snapshots, holderSnaps] = await Promise.all([
      db.scoreRun.findMany({
        where: { tokenId: { in: tokenIds } },
        orderBy: { calculatedAt: "desc" },
        distinct: ["tokenId"],
      }),
      poolIds.length
        ? db.pairSnapshot.findMany({
            where: { poolId: { in: poolIds } },
            orderBy: { ts: "desc" },
            distinct: ["poolId"],
          })
        : Promise.resolve([]),
      db.holderSnapshot.findMany({
        where: { tokenId: { in: tokenIds } },
        orderBy: { checkedAt: "desc" },
        distinct: ["tokenId"],
        select: { tokenId: true, holderCount: true },
      }),
    ])

    // One batched account read covers every bonding curve in the feed, which is
    // what "graduated" and "close to bonding" are derived from.
    const rpcUrl = process.env.SOLANA_RPC_URL
    const curveAddresses = tokens.flatMap((t) =>
      t.pools.filter((p) => p.venue === "PUMPFUN_CURVE").map((p) => p.address),
    )
    let curves = new Map<string, CurveState>()
    if (rpcUrl && curveAddresses.length) {
      try {
        curves = await readBondingCurves(curveAddresses, rpcUrl)
      } catch (err) {
        console.error(
          "[api/leaderboard] bonding-curve read failed:",
          (err as Error).message,
        )
      }
    }

    const scoreByToken = new Map(scores.map((s) => [s.tokenId, s]))
    const snapByPool = new Map(snapshots.map((s) => [s.poolId, s]))
    const holdersByToken = new Map(
      holderSnaps.map((h) => [h.tokenId, h.holderCount]),
    )

    const items = tokens.map((t) => {
      const score = scoreByToken.get(t.id)
      const snap = t.pools
        .map((p) => snapByPool.get(p.id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .sort((a, b) => b.ts.getTime() - a.ts.getTime())[0]

      const curvePool = t.pools.find((p) => p.venue === "PUMPFUN_CURVE")
      const curve = curvePool ? curves.get(curvePool.address) : undefined
      // A token on a non-curve pool has already migrated off the launchpad.
      const migrated = t.pools.some((p) => p.venue !== "PUMPFUN_CURVE")

      return {
        tokenId: t.id,
        mint: t.mint,
        name: t.name,
        symbol: t.symbol,
        imageUri: t.imageUri,
        launchpad: t.launchpad,
        firstSeenAt: t.launchTime.toISOString(),
        score: score ? num(score.score) : null,
        calculatedAt: (score?.calculatedAt ?? t.launchTime).toISOString(),
        priceUsd: snap?.priceUsd != null ? num(snap.priceUsd) : null,
        marketCapUsd:
          snap?.marketCapUsd != null ? num(snap.marketCapUsd) : null,
        liquidityUsd:
          snap?.liquidityUsd != null ? num(snap.liquidityUsd) : null,
        volume24hUsd: null,
        priceChange24h: null,
        holderCount: holdersByToken.get(t.id) ?? null,
        graduated: curve ? curve.complete : migrated ? true : null,
        bondingProgress: curve && !curve.complete ? curve.progress : null,
        curveMarketCapSol: curve && !curve.complete ? curve.marketCapSol : null,
        curveSolReserves:
          curve && !curve.complete ? curve.realSolReserves : null,
      }
    })

    return NextResponse.json({ tokens: items })
  } catch (err) {
    console.warn(
      "[api/leaderboard] database unavailable, falling back to live feed",
    )
    return NextResponse.json({ tokens: [] })
  }
}

import type { Metadata } from "next"
import { getDb } from "@clawdex/shared"
import { ARC_PORT_MODE } from "@/lib/flags"
import {
  AnimatedLanding,
  type LandingStats,
} from "@/components/landing/AnimatedLanding"
import { getMadeOnSolFeed } from "@/lib/kols"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Arc Launch Intelligence",
  description:
    "Arc token launches analyzed using on-chain signals that cannot be bought, with plain-English explanations.",
  alternates: { canonical: "/landing" },
}

async function getStats(): Promise<LandingStats> {
  const stats: LandingStats = {
    indexed: null,
    scored: null,
    kolsActive: null,
    signals: null,
  }
  if (ARC_PORT_MODE) return stats

  try {
    const db = getDb()
    const [indexed, scored, signals] = await Promise.all([
      db.token.count({
        where: { discoveredVia: { not: "ON_DEMAND_RESOLUTION" } },
      }),
      db.scoreRun
        .findMany({ distinct: ["tokenId"], select: { tokenId: true } })
        .then((r) => r.length),
      db.alert.count(),
    ])
    Object.assign(stats, { indexed, scored, signals })
  } catch {
    // leave nulls: the page shows a dash instead of an invented number
  }
  const feed = await getMadeOnSolFeed(100)
  if (feed.trades.length > 0)
    stats.kolsActive = new Set(feed.trades.map((t) => t.wallet_address)).size
  return stats
}

export default async function LandingPage() {
  return <AnimatedLanding stats={await getStats()} />
}

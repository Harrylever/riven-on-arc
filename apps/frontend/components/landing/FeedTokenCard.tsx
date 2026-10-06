"use client"

import { useRouter } from "next/navigation"
import { TokenCard, type TokenCardBadge } from "@/components/ds"
import type { StatItem } from "@/components/ds/StatRow"
import type { SparklineChanges } from "@/components/ds/Sparkline"

/**
 * TokenCard needs onClick-based navigation, not a wrapping <Link>: it renders
 * its own interactive buttons internally (copy-mint, watchlist star), and a
 * <button> nested inside an <a> is invalid HTML/broken accessibility.
 */
export function FeedTokenCard(props: {
  mint: string
  symbol: string
  name?: string
  imageUri?: string | null
  score: number | null
  changes?: SparklineChanges
  stats?: StatItem[]
  badges?: TokenCardBadge[]
  age?: string
}) {
  const router = useRouter()
  return (
    <TokenCard {...props} onClick={() => router.push(`/token/${props.mint}`)} />
  )
}

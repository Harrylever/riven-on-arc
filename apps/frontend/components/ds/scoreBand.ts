export type ScoreBand = "healthy" | "caution" | "risk" | "unknown"

export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score == null || Number.isNaN(score)) return "unknown"
  if (score >= 70) return "healthy"
  if (score >= 50) return "caution"
  return "risk"
}

export const BAND: Record<
  ScoreBand,
  { color: string; tint: string; label: string; icon: string }
> = {
  healthy: {
    color: "var(--score-healthy)",
    tint: "var(--score-healthy-tint)",
    label: "Looks healthy",
    icon: "check-circle",
  },
  caution: {
    color: "var(--score-caution)",
    tint: "var(--score-caution-tint)",
    label: "Some caution",
    icon: "alert-triangle",
  },
  risk: {
    color: "var(--score-risk)",
    tint: "var(--score-risk-tint)",
    label: "Risky",
    icon: "alert-octagon",
  },
  unknown: {
    color: "var(--score-unknown)",
    tint: "var(--score-unknown-tint)",
    label: "Not scored yet",
    icon: "clock",
  },
}

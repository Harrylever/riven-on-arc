import { scoreBand } from "@clawdex/shared/score"

export type ScoreVerdict = "LOOKS_HEALTHY" | "MIXED" | "RISKY" | "UNKNOWN"

export interface VerdictMeta {
  band: "green" | "yellow" | "red" | "unknown"
  label: string
  badgeClassName: string
  dotClassName: string
}

/**
 * Maps a numeric score (or null/undefined) to a verdict label and visual styling.
 * Client components can import this safely because @clawdex/shared/score is browser-safe.
 */
export function getVerdictMeta(
  score: number | null | undefined,
  isPartial = false,
): VerdictMeta {
  if (isPartial) {
    return {
      band: "yellow",
      label: "Scoring in progress — partial data",
      badgeClassName:
        "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      dotClassName: "bg-amber-500",
    }
  }

  if (score === null || score === undefined || Number.isNaN(score)) {
    return {
      band: "unknown",
      label: "Unscored",
      badgeClassName: "bg-muted text-muted-foreground border-border",
      dotClassName: "bg-muted-foreground",
    }
  }

  const band = scoreBand(score)

  switch (band) {
    case "green":
      return {
        band: "green",
        label: "Looks healthy",
        badgeClassName:
          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        dotClassName: "bg-emerald-500",
      }
    case "yellow":
      return {
        band: "yellow",
        label: "Mixed signals",
        badgeClassName:
          "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        dotClassName: "bg-amber-500",
      }
    case "red":
    default:
      return {
        band: "red",
        label: "High risk",
        badgeClassName:
          "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
        dotClassName: "bg-rose-500",
      }
  }
}

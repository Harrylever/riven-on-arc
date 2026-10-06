import type { HTMLAttributes } from "react"
import { cn } from "cn"
import { score10 } from "@/lib/format"
import { scoreBand } from "./scoreBand"

const SIZES = {
  sm: "size-[34px] text-sm",
  md: "size-12 text-xl",
  lg: "size-[72px] text-3xl",
  hero: "size-[132px] text-6xl",
} as const

const BAND_CLASS: Record<string, string> = {
  healthy:
    "border-[--score-healthy] bg-[--score-healthy-tint] text-[--score-healthy]",
  caution:
    "border-[--score-caution] bg-[--score-caution-tint] text-[--score-caution]",
  risk: "border-[--score-risk] bg-[--score-risk-tint] text-[--score-risk]",
  unknown:
    "border-[--score-unknown] bg-[--score-unknown-tint] text-[--score-unknown]",
}

export interface ScoreBadgeProps extends HTMLAttributes<HTMLDivElement> {
  score: number | null | undefined
  size?: keyof typeof SIZES
  showMax?: boolean
}

export function ScoreBadge({
  score,
  size = "md",
  showMax,
  className,
  ...rest
}: ScoreBadgeProps) {
  const band = scoreBand(score)
  return (
    <div
      data-slot="score-badge"
      className={cn(
        "grid shrink-0 place-items-center rounded-none border font-heading leading-none font-extrabold tracking-tight",
        SIZES[size],
        BAND_CLASS[band],
        className,
      )}
      {...rest}
    >
      <span className="flex items-baseline gap-0.5 tabular-nums">
        {score10(score)}
        {showMax ? (
          <span className="font-mono text-[0.4em] font-medium opacity-70">
            /10
          </span>
        ) : null}
      </span>
    </div>
  )
}

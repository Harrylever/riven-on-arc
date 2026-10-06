import type { HTMLAttributes } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertDiamondIcon,
  Alert01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "cn"
import { scoreBand, type ScoreBand } from "./scoreBand"

const BAND: Record<
  ScoreBand,
  { icon: typeof CheckmarkCircle02Icon; label: string; className: string }
> = {
  healthy: {
    icon: CheckmarkCircle02Icon,
    label: "Looks healthy",
    className: "text-[--score-healthy]",
  },
  caution: {
    icon: Alert01Icon,
    label: "Some caution",
    className: "text-[--score-caution]",
  },
  risk: {
    icon: AlertDiamondIcon,
    label: "Risky",
    className: "text-[--score-risk]",
  },
  unknown: {
    icon: Clock01Icon,
    label: "Not scored yet",
    className: "text-[--score-unknown]",
  },
}

export interface VerdictLineProps extends HTMLAttributes<HTMLDivElement> {
  score?: number | null
  band?: ScoreBand
  verdict?: string
  size?: "sm" | "md" | "lg"
}

export function VerdictLine({
  score,
  band,
  verdict,
  size = "md",
  className,
  ...rest
}: VerdictLineProps) {
  const b = BAND[band || scoreBand(score)]
  const textSize =
    size === "lg" ? "text-base" : size === "sm" ? "text-sm" : "text-[15px]"
  return (
    <div className={cn("flex items-start gap-2", className)} {...rest}>
      <HugeiconsIcon
        icon={b.icon}
        className={cn("mt-0.5 size-4 shrink-0", b.className)}
        strokeWidth={2}
      />
      <div className={cn("leading-snug", textSize)}>
        <span className={cn("font-semibold", b.className)}>{b.label}</span>
        {verdict ? (
          <span className="text-muted-foreground">
            {" — "}
            {verdict}
          </span>
        ) : null}
      </div>
    </div>
  )
}

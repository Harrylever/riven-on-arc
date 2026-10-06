import type { HTMLAttributes, ReactNode } from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Shield01Icon } from "@hugeicons/core-free-icons"
import { cn } from "cn"
import type { ScoreBand } from "./scoreBand"

const STATE_CLASS: Record<ScoreBand, string> = {
  healthy: "text-[--score-healthy]",
  caution: "text-[--score-caution]",
  risk: "text-[--score-risk]",
  unknown: "text-[--score-unknown]",
}

export interface SignalRowProps extends HTMLAttributes<HTMLDivElement> {
  icon?: IconSvgElement
  label: ReactNode
  value: ReactNode
  state?: ScoreBand
  detail?: ReactNode
}

export function SignalRow({
  icon = Shield01Icon,
  label,
  value,
  state = "healthy",
  detail,
  className,
  ...rest
}: SignalRowProps) {
  const stateClass = STATE_CLASS[state] ?? STATE_CLASS.unknown
  return (
    <div
      className={cn(
        "border-border bg-muted/40 flex items-center gap-2.5 rounded-none border px-3 py-2.5",
        className,
      )}
      {...rest}
    >
      <HugeiconsIcon
        icon={icon}
        className={cn("size-4 shrink-0", stateClass)}
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {detail ? (
          <div className="text-muted-foreground mt-0.5 text-xs">{detail}</div>
        ) : null}
      </div>
      <div
        className={cn(
          "shrink-0 font-mono text-sm font-semibold tabular-nums",
          stateClass,
        )}
      >
        {value}
      </div>
    </div>
  )
}

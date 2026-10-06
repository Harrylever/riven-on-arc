import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "cn"

export interface StatItem {
  label: ReactNode
  value: ReactNode
  tone?: "up" | "down"
}

export interface StatRowProps extends HTMLAttributes<HTMLDivElement> {
  items?: StatItem[]
  align?: "left" | "right" | "center"
  size?: "sm" | "md"
}

export function StatRow({
  items = [],
  align = "left",
  size = "md",
  className,
  ...rest
}: StatRowProps) {
  return (
    <div className={cn("flex flex-wrap gap-x-5 gap-y-2", className)} {...rest}>
      {items.map((s, i) => (
        <div key={i} className="min-w-0" style={{ textAlign: align }}>
          <div className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
            {s.label}
          </div>
          <div
            className={cn(
              "mt-0.5 font-mono font-semibold tabular-nums",
              size === "sm" ? "text-xs" : "text-sm",
              s.tone === "up"
                ? "text-[--up]"
                : s.tone === "down"
                  ? "text-[--down]"
                  : "text-foreground",
            )}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}

import type { ReactNode } from "react"

export interface StatItem {
  label: ReactNode
  value: ReactNode
  tone?: "up" | "down"
}

/** A wrapping row of small label/value stats. */
export function StatRow({ items = [], size = "md", className = "" }: { items?: StatItem[]; size?: "sm" | "md"; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-5 gap-y-2 ${className}`}>
      {items.map((s, i) => (
        <div key={i} className="min-w-0">
          <div className="font-mono text-[10px] tracking-wider text-[var(--rv-ink-3)] uppercase">{s.label}</div>
          <div
            className={`mt-0.5 font-mono font-semibold tabular-nums ${size === "sm" ? "text-xs" : "text-sm"}`}
            style={{ color: s.tone === "up" ? "var(--rv-up)" : s.tone === "down" ? "var(--rv-down)" : "var(--rv-ink)" }}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}

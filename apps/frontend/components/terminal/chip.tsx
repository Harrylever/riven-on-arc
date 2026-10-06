import type { ReactNode } from "react"

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded border border-[var(--border)] px-1 py-px text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">
      {children}
    </span>
  )
}

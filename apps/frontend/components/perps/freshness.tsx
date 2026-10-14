"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
/** How often the perps data refreshes while the tab is visible. */
export const REFRESH_MS = 6_000

/** Live "updated Ns ago" plus a manual refresh, so the data's age is never a guess. */
export function Freshness({
  updatedAt,
  refreshing,
  onRefresh,
}: {
  updatedAt: number | null
  refreshing: boolean
  onRefresh: () => void
}) {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const secs = updatedAt == null ? null : Math.round((now - updatedAt) / 1000)
  const label = refreshing
    ? "updating…"
    : secs == null
      ? "—"
      : secs < 5
        ? "just now"
        : `${secs}s ago`

  return (
    <div className="flex items-center gap-2 sm:ml-auto">
      <span
        className="cdx-num text-[11px] text-[var(--rv-ink-3)]"
        aria-live="polite"
      >
        {label}
      </span>
      <Button
        variant="plain"
        size="bare"
        onClick={onRefresh}
        disabled={refreshing}
        className="rounded-md border border-[var(--rv-stroke)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--rv-ink-3)] transition-colors hover:text-[var(--rv-ink)] disabled:opacity-50"
        title={`Auto-refreshes every ${REFRESH_MS / 1000}s while this tab is open`}
      >
        Refresh
      </Button>
    </div>
  )
}

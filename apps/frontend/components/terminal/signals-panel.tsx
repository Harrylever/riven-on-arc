"use client"

import { useEffect, useState } from "react"
import { Placeholder } from "@/components/token/TokenPanels"
import type { Signal } from "@/components/terminal/types"
import { ago } from "@/lib/format"

export function SignalsPanel({ onOpen }: { onOpen: (m: string) => void }) {
  const [signals, setSignals] = useState<Signal[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch("/api/signals")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setSignals(j.signals))
      .catch(() => setFailed(true))
  }, [])

  if (failed)
    return <Placeholder>Signals are unavailable right now.</Placeholder>
  if (!signals) return <Placeholder>Loading signals…</Placeholder>
  if (signals.length === 0)
    return (
      <Placeholder>
        No signals yet. They appear when monitoring sees a concentration shift,
        volume spike, unusual burn, authority change or KOL coordination on a
        tracked token.
      </Placeholder>
    )

  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-2 text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
        Latest signals from ClawDex monitoring
      </div>
      {signals.map((s) => (
        <button
          key={s.id}
          onClick={() => onOpen(s.mint)}
          className="flex w-full items-center gap-3 border-t border-[var(--border)] py-2 text-left text-xs first:border-t-0"
        >
          <span className="cdx-num w-36 shrink-0 text-[10px] text-[var(--text-muted)] uppercase">
            {s.type.replace(/_/g, " ")}
          </span>
          <span className="font-bold">${s.symbol}</span>
          <span className="flex-1">{s.message}</span>
          <span className="cdx-num text-[var(--text-muted)]">
            {ago(s.createdAt)}
          </span>
        </button>
      ))}
    </div>
  )
}

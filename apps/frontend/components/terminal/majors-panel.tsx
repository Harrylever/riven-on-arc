"use client"

import { useCallback, useEffect, useState } from "react"
import { Placeholder } from "@/components/token/TokenPanels"
import { Freshness } from "@/components/terminal/freshness"
import { REFRESH_MS } from "@/components/terminal/types"
import { pct, usd } from "@/lib/format"
import type { Major } from "@/app/api/majors/route"

export function MajorsPanel() {
  const [majors, setMajors] = useState<Major[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/majors", { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      setMajors(json.majors)
      setUpdatedAt(Date.now())
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Fire-and-forget: load() is async, its setState calls happen after its
    // own awaits, not synchronously within this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  if (failed)
    return <Placeholder>The price feed is unavailable right now.</Placeholder>
  if (!majors) return <Placeholder>Loading prices…</Placeholder>

  return (
    <div className="overflow-hidden rounded-none border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex justify-end border-b border-[var(--border)] px-3 py-2">
        <Freshness
          updatedAt={updatedAt}
          refreshing={refreshing}
          onRefresh={() => void load()}
        />
      </div>
      {majors.map((m) => (
        <MajorRow key={m.id} major={m} />
      ))}
      <p className="p-3 text-[10px] text-[var(--text-muted)]">
        Prices from CoinGecko, refreshed about once a minute. These are
        reference prices only — ClawDex does not score major assets.
      </p>
    </div>
  )
}

function MajorRow({ major: m }: { major: Major }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-3 transition-colors last:border-b-0 hover:bg-white/[0.02]">
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[var(--surface-raised)] shadow-sm">
        {m.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={m.logoUrl}
            alt={m.symbol}
            className="size-7 rounded-full object-contain"
            onError={(e) => {
              ;(e.target as HTMLElement).style.display = "none"
            }}
          />
        ) : (
          <span className="text-[11px] font-extrabold text-[var(--text-secondary)]">
            {m.symbol.slice(0, 3)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{m.symbol}</div>
        <div className="truncate text-[10px] text-[var(--text-muted)]">
          {m.name}
        </div>
      </div>
      <div className="cdx-num text-right">
        <div className="text-sm font-bold">
          {m.priceUsd == null
            ? "—"
            : m.priceUsd >= 1
              ? `$${m.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : `$${m.priceUsd.toFixed(4)}`}
        </div>
        <div
          className="text-[11px]"
          style={{
            color: (m.change24h ?? 0) >= 0 ? "var(--up)" : "var(--down)",
          }}
        >
          {pct(m.change24h)}
        </div>
      </div>
      <div className="cdx-num hidden w-24 text-right text-[11px] text-[var(--text-muted)] sm:block">
        {usd(m.marketCapUsd)}
      </div>
    </div>
  )
}

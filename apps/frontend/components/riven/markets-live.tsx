"use client"

import { useEffect, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { useWatchlist } from "@/hooks/use-watchlist"
import { MarketsTable } from "./markets-table"

/** How current the data is, and a plain warning when the indexer has fallen behind (new pairs may be missing). */
export function FreshnessChip({ syncedAt, serverNow }: { syncedAt: string | null; serverNow: number }) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (!syncedAt) return <p className="text-[12px] text-[var(--rv-ink-3)]">Sync status unknown.</p>
  const min = Math.max(0, Math.round((now - new Date(syncedAt).getTime()) / 60_000))
  const behind = min > 10
  const ago = min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
  return (
    <p
      className={`rounded-md px-3 py-2 text-[12px] ${
        behind
          ? "border border-[var(--rv-caution)]/30 bg-[var(--rv-caution)]/10 text-[var(--rv-ink-2)]"
          : "text-[var(--rv-ink-3)]"
      }`}
    >
      {behind
        ? `Riven last read the chain ${ago}, so the newest pairs may be missing and ages are measured from the last sync.`
        : `Chain data read ${ago}.`}
    </p>
  )
}

/** Starred tokens live in this browser, so this list is fetched on the client. */
export function WatchlistList({ serverNow }: { serverNow: number }) {
  const { mints } = useWatchlist()
  const key = mints.join(",")
  const [state, setState] = useState<{ key: string; tokens: TokenSummary[] | null; failed: boolean } | null>(null)
  useEffect(() => {
    if (!key) return
    let alive = true
    fetch(`/api/arc/tokens?addresses=${key}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { tokens: TokenSummary[] }) => alive && setState({ key, tokens: d.tokens, failed: false }))
      .catch(() => alive && setState({ key, tokens: null, failed: true }))
    return () => {
      alive = false
    }
  }, [key])

  if (!key)
    return <p className="px-4 py-10 text-center text-[13px] text-[var(--rv-ink-3)]">Star a token to watch it here. Your watchlist is saved on this device.</p>
  const mine = state?.key === key ? state : null
  if (!mine) return <p className="px-4 py-10 text-center text-[13px] text-[var(--rv-ink-3)]">Loading your watchlist…</p>
  if (mine.failed || !mine.tokens)
    return (
      <p className="px-4 py-10 text-center text-[13px] text-[var(--rv-ink-2)]">
        Couldn&apos;t load your watchlist just now. Your stars are still saved; reload to try again.
      </p>
    )
  return <MarketsTable tokens={mine.tokens} serverNow={serverNow} />
}

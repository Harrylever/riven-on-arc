"use client"

import { PageHero } from "./page-hero"
import { TelegramConnect } from "./telegram-connect"
import Link from "next/link"
import { useEffect, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { useWatchlist } from "@/hooks/use-watchlist"
import { TokenCard } from "./token-card"

export function WatchlistClient() {
  const { mints } = useWatchlist()
  const [tokens, setTokens] = useState<TokenSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [now] = useState(() => Date.now())
  const key = mints.join(",")

  useEffect(() => {
    if (!key) {
      setTokens([])
      return
    }
    let alive = true
    const load = () =>
      fetch(`/api/arc/tokens?addresses=${key}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`tokens ${r.status}`)
          return (await r.json()) as { tokens: TokenSummary[] }
        })
        .then((d) => {
          if (!alive) return
          setFailed(false)
          setTokens(d.tokens)
        })
        // Keep showing the last good list; just say it's stale.
        .catch(() => alive && setFailed(true))
    load()
    const id = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [key])

  return (
    <div className="flex flex-col gap-4">
      <PageHero
        title="Watchlist"
        lines={["Your starred tokens, scored live.", "I'll warn you if one of these gets rugged."]}
        greet="Star tokens anywhere and I'll keep an eye on them here."
      >
        Your starred tokens, rescored every 30 seconds. Saved on this device.
      </PageHero>
      <TelegramConnect />
      {failed && (
        <p
          className="rounded-lg bg-[rgba(251,191,36,0.08)] px-3 py-2 text-sm text-[var(--rv-caution)]"
          role="alert"
        >
          Couldn&apos;t refresh scores —{" "}
          {tokens?.length ? "showing the last ones loaded" : "retrying"}.
        </p>
      )}
      {tokens === null ? (
        <p className="text-sm text-[var(--rv-ink-3)]">
          {failed ? "" : "Loading…"}
        </p>
      ) : tokens.length === 0 && !failed ? (
        <div className="rv-card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="text-4xl" aria-hidden>
            ⭐
          </span>
          <p className="text-lg font-bold text-[var(--rv-ink)]">
            Nothing saved yet
          </p>
          <p className="max-w-xs text-sm text-[var(--rv-ink-2)]">
            Tap the star on any launch to keep an eye on it. Its score updates
            here live. Saved on this device only, no account needed.
          </p>
          <Link
            href="/trending"
            className="mt-1 rounded-full bg-[var(--rv-blue)] px-5 py-2.5 text-sm font-semibold text-[var(--rv-on-blue)]"
          >
            Browse launches
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {tokens.map((t) => (
            <li key={t.address}>
              <TokenCard t={t} now={now} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

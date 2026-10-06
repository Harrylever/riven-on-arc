"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ScoreBadge, TokenAvatar } from "@/components/ds"
import { Placeholder, WatchStar } from "@/components/token/TokenPanels"
import { Skeleton } from "@/components/ui/skeleton"
import { useWatchlist } from "@/hooks/use-watchlist"
import { ago, launchpadLabel, pct, usd } from "@/lib/format"
import type { LeaderboardTokenItem } from "@/lib/mock"

export function WatchlistClient() {
  const { mints, toggle, isWatched } = useWatchlist()
  const [tokens, setTokens] = useState<LeaderboardTokenItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/feed?sort=trending")
      .then((r) => r.json())
      .then((j) => !cancelled && setTokens(j.tokens ?? []))
      .catch(() => !cancelled && setTokens([]))
    return () => {
      cancelled = true
    }
  }, [])

  const watched = (tokens ?? []).filter((t) => mints.includes(t.mint))
  // Watched mints the current feed does not contain (rolled off trending, or
  // added from a direct contract lookup).
  const missing = mints.filter((m) => !(tokens ?? []).some((t) => t.mint === m))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-5">
        <h1
          className="text-2xl font-extrabold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Watchlist
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Saved in this browser only — no account needed. {mints.length} token
          {mints.length === 1 ? "" : "s"} saved.
        </p>
      </div>

      {mints.length === 0 ? (
        <Placeholder>
          Nothing saved yet. Tap the ★ on any token in the{" "}
          <Link
            href="/terminal"
            className="text-[var(--brand)] hover:underline"
          >
            terminal
          </Link>{" "}
          to add it here.
        </Placeholder>
      ) : tokens === null ? (
        <WatchlistSkeleton count={Math.min(mints.length, 5)} />
      ) : (
        <div className="overflow-hidden rounded-none border border-[var(--border)] bg-[var(--surface)]">
          {watched.map((t) => (
            <WatchlistRow
              key={t.mint}
              token={t}
              watched={isWatched(t.mint)}
              onToggle={() => toggle(t.mint)}
            />
          ))}
          {missing.map((m) => (
            <WatchlistMissingRow key={m} mint={m} onToggle={() => toggle(m)} />
          ))}
        </div>
      )}
    </div>
  )
}

function WatchlistSkeleton({ count }: { count: number }) {
  return (
    <div className="overflow-hidden rounded-none border border-[var(--border)] bg-[var(--surface)]">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 border-b border-[var(--border)] px-2.5 py-2.5 last:border-b-0"
        >
          <Skeleton className="size-4 rounded-none" />
          <Skeleton className="size-9 rounded-none" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-1.5 h-3 w-16" />
          </div>
          <Skeleton className="size-10 rounded-none" />
        </div>
      ))}
    </div>
  )
}

function WatchlistRow({
  token,
  watched,
  onToggle,
}: {
  token: LeaderboardTokenItem
  watched: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-2.5 py-2.5 last:border-b-0">
      <WatchStar watched={watched} onToggle={onToggle} />
      <Link
        href={`/terminal?mint=${token.mint}`}
        className="flex min-w-0 flex-1 items-center gap-2.5"
      >
        <TokenAvatar src={token.imageUri} symbol={token.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">{token.symbol}</span>
            {launchpadLabel(token.launchpad) && (
              <span className="shrink-0 rounded border border-[var(--border)] px-1 py-px text-[9px] font-bold text-[var(--text-muted)] uppercase">
                {launchpadLabel(token.launchpad)}
              </span>
            )}
          </div>
          <div className="cdx-num mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
            {token.name} · {ago(token.firstSeenAt ?? token.calculatedAt)} old
          </div>
        </div>
        <div className="cdx-num shrink-0 text-right text-[11px]">
          <div className="font-semibold">{usd(token.marketCapUsd)}</div>
          <div
            style={{
              color:
                (token.priceChange24h ?? 0) >= 0 ? "var(--up)" : "var(--down)",
            }}
          >
            {pct(token.priceChange24h)}
          </div>
        </div>
        <ScoreBadge score={token.score} size="sm" />
      </Link>
    </div>
  )
}

function WatchlistMissingRow({
  mint,
  onToggle,
}: {
  mint: string
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-2.5 py-2.5 last:border-b-0">
      <WatchStar watched onToggle={onToggle} />
      <Link
        href={`/terminal?mint=${mint}`}
        className="cdx-num min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]"
      >
        {mint}
      </Link>
      <span className="text-[10px] text-[var(--text-muted)]">
        not in current feed
      </span>
    </div>
  )
}

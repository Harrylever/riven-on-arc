"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { useWatchlist } from "@/hooks/use-watchlist"
import { change, changeColor, usd } from "@/lib/riven-format"
import { FlashBuy } from "./flash-buy"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { Meta, Why } from "./screener"

export interface Panel {
  id: string
  title: string
  hint: string
  accent: string
  icon: string
  href: string
  tokens: TokenSummary[]
  showWhy?: boolean
  /** What an empty panel should say. */
  empty?: string
}

function Row({ t, now, showWhy }: { t: TokenSummary; now: number; showWhy?: boolean }) {
  return (
    <li className="border-b border-[var(--rv-stroke)] last:border-0">
      <Link href={`/token/${t.address}`} className="flex items-start gap-3 px-3 py-2.5 hover:bg-[var(--rv-row-hover)]">
        <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[13.5px] font-bold text-[var(--rv-ink)]">{t.symbol}</span>
            <span className="truncate text-[11.5px] text-[var(--rv-ink-3)]">{t.name}</span>
          </div>
          <Meta t={t} now={now} />
          {showWhy && <Why t={t} />}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rv-num text-[13.5px] font-bold text-[var(--rv-ink)]">{usd(t.marketCap)}</span>
          <span className="rv-num text-[11px] font-semibold" style={{ color: changeColor(t.change.h24) }}>
            {change(t.change.h24)}
          </span>
          <span className="flex items-center gap-1.5">
            <ScoreBadge score={t.score} band={t.band} size="sm" />
            <FlashBuy token={t} />
          </span>
        </div>
      </Link>
    </li>
  )
}

function PanelBox({ p, now, children }: { p: Omit<Panel, "tokens">; now: number; children: React.ReactNode }) {
  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-card)]"
      style={{ boxShadow: `inset 0 2px 0 ${p.accent}` }}
      aria-label={p.title}
    >
      <header className="flex items-center gap-2 border-b border-[var(--rv-stroke)] px-3 py-2.5">
        <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke={p.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={p.icon} />
        </svg>
        <h2 className="text-[13.5px] font-bold text-[var(--rv-ink)]">{p.title}</h2>
        <span className="hidden truncate text-[11.5px] text-[var(--rv-ink-3)] sm:inline">{p.hint}</span>
        <Link href={p.href} className="ml-auto shrink-0 text-[11.5px] font-semibold text-[var(--rv-ice)] hover:underline">
          View all
        </Link>
      </header>
      <div className="max-h-[440px] overflow-y-auto" data-now={now}>
        {children}
      </div>
    </section>
  )
}

export function MarketBoard({ panels, serverNow }: { panels: Panel[]; serverNow: number }) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {panels.map((p) => (
        <PanelBox key={p.id} p={p} now={now}>
          {p.tokens.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-[var(--rv-ink-3)]">{p.empty ?? "Nothing here right now."}</p>
          ) : (
            <ol>
              {p.tokens.map((t) => (
                <Row key={t.address} t={t} now={now} showWhy={p.showWhy} />
              ))}
            </ol>
          )}
        </PanelBox>
      ))}
      <WatchlistPanel now={now} />
    </div>
  )
}

function WatchlistPanel({ now }: { now: number }) {
  const { mints } = useWatchlist()
  const key = mints.join(",")
  const [tokens, setTokens] = useState<TokenSummary[] | null>(null)
  useEffect(() => {
    if (!key) return
    let alive = true
    fetch(`/api/arc/tokens?addresses=${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tokens: TokenSummary[] } | null) => alive && d && setTokens(d.tokens))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [key])
  return (
    <PanelBox
      p={{ id: "watch", title: "Watchlist", hint: "Starred on this device", accent: "var(--rv-caution)", icon: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z", href: "/watchlist" }}
      now={now}
    >
      {!key ? (
        <p className="px-3 py-8 text-center text-[12.5px] text-[var(--rv-ink-3)]">Star a token to watch it here.</p>
      ) : tokens === null ? (
        <p className="px-3 py-8 text-center text-[12.5px] text-[var(--rv-ink-3)]">Loading…</p>
      ) : (
        <ol>
          {tokens.map((t) => (
            <Row key={t.address} t={t} now={now} />
          ))}
        </ol>
      )}
    </PanelBox>
  )
}

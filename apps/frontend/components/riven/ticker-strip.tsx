"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { ArcBand } from "@riven/shared"
import { visibleInterval } from "@/lib/visible-interval"
import { BAND_META, change, changeColor, usd } from "@/lib/riven-format"
import { TokenAvatar } from "./token-avatar"

interface Tick {
  address: string
  symbol: string
  image: string | null
  marketCap: number | null
  change24h: number | null
  score: number | null
  band: ArcBand
  fake: boolean
}

/** Scrolling strip of the most-traded Arc tokens, each with its Riven score. */
export function TickerStrip() {
  const [ticks, setTicks] = useState<Tick[]>([])
  // which tokens' numbers just changed: flashed for a moment
  const [moved, setMoved] = useState<Set<string>>(new Set())
  const prev = useRef(new Map<string, number | null>())
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch("/api/arc/ticker")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { tokens: Tick[] } | null) => {
          if (!alive || !d) return
          const changed = new Set(
            d.tokens.filter((t) => prev.current.has(t.address) && prev.current.get(t.address) !== t.marketCap).map((t) => t.address),
          )
          prev.current = new Map(d.tokens.map((t) => [t.address, t.marketCap]))
          setTicks(d.tokens)
          setMoved(changed)
          if (changed.size) window.setTimeout(() => alive && setMoved(new Set()), 1600)
        })
        .catch(() => {})
    load()
    // refresh about once a minute while the tab is visible; catch up when it comes back
    const stop = visibleInterval(load, 60_000)
    return () => {
      alive = false
      stop()
    }
  }, [])
  if (ticks.length === 0) return <div className="h-9 border-t border-[var(--rv-stroke)]" />

  const item = (t: Tick, k: string) => (
    <Link
      key={k}
      href={`/token/${t.address}`}
      className="flex shrink-0 items-center gap-2 rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-card)] py-1 pr-2.5 pl-1 hover:border-[var(--rv-stroke-strong)]"
    >
      <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={20} />
      <span className="text-[12px] font-bold text-[var(--rv-ink)]">{t.symbol}</span>
      <span
        className="rv-num rounded px-0.5 text-[12px] text-[var(--rv-ink-2)] transition-colors duration-700"
        style={moved.has(t.address) ? { background: "rgba(124,196,232,0.25)", color: "var(--rv-ink)" } : undefined}
      >
        {usd(t.marketCap)}
      </span>
      <span className="rv-num text-[12px] font-semibold" style={{ color: changeColor(t.change24h) }}>
        {change(t.change24h)}
      </span>
      <span
        className="rv-num rounded px-1 text-[10.5px] font-bold"
        style={{ color: BAND_META[t.band].color, background: BAND_META[t.band].tint }}
        title={t.fake ? "Flagged by Riven" : BAND_META[t.band].label}
      >
        {t.score === null ? "…" : t.score.toFixed(1)}
      </span>
    </Link>
  )

  return (
    <div className="relative flex h-9 items-center overflow-hidden border-t border-[var(--rv-stroke)]">
      <span className="z-10 flex h-full shrink-0 items-center gap-1.5 bg-[rgba(15,15,18,0.95)] pr-3 pl-4 text-[10.5px] font-bold tracking-[0.1em] text-[var(--rv-ink-3)] uppercase">
        Arc now
      </span>
      <div className="flex min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_24px,#000_calc(100%-24px),transparent)]">
        {/* Rendered twice so the -50% marquee loops seamlessly. */}
        <div className="rv-marquee flex shrink-0 gap-2 pr-2">
          {ticks.map((t) => item(t, `a-${t.address}`))}
          {ticks.map((t) => item(t, `b-${t.address}`))}
        </div>
      </div>
    </div>
  )
}

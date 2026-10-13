"use client"

// The perps page mixes two data sources that must never be confused:
//   Markets        - live prices, 24h change and volume
//   Riven Scanner  - trade setups found on Bybit, MEXC and Binance (powered by sakz-bot)
// Everything here exists to keep them visibly apart: one tab each, a strip that says where
// the data comes from, an outlined pill for scanner opinions (never styled like a price),
// and an explicit line wherever a scanner price meets a Hyperliquid price.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react"
import { ago, priceUsd } from "@/lib/format"
import { venueName } from "@/lib/perp-symbols"

export type SourceTab = "scanner" | "markets"


/** A small radar: the mark of Riven Scanner everywhere it appears. */
export function ScannerGlyph({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 8 12.2 3.8" />
    </svg>
  )
}

/** "updated 4s ago" for a timestamp in ms; "—" until there is one. Ticks on its own so it never goes stale. */
export function AgeLabel({ at, prefix }: { at: number | null; prefix: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])
  if (at === null) return <span>{prefix} —</span>
  const s = Math.max(0, Math.round((now - at) / 1000))
  return (
    <span>
      {prefix} {s < 5 ? "just now" : `${ago(new Date(at))} ago`}
    </span>
  )
}

export function SourceTabs({
  value,
  onChange,
  scannerCount,
  marketCount,
}: {
  value: SourceTab
  onChange: (t: SourceTab) => void
  scannerCount: number | null
  marketCount: number | null
}) {
  const tabs: Array<{ id: SourceTab; label: string; sub: string; count: number | null }> = [
    { id: "scanner", label: "Riven Scanner", sub: "setups from Bybit, MEXC, Binance", count: scannerCount },
    { id: "markets", label: "Markets", sub: "live perp prices", count: marketCount },
  ]
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    const next: SourceTab = value === "scanner" ? "markets" : "scanner"
    onChange(next)
    document.getElementById(`perps-tab-${next}`)?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label="Perps data source"
      className="flex overflow-hidden rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-card)]"
      onKeyDown={onKey}
    >
      {tabs.map((t) => {
        const on = value === t.id
        return (
          <button
            key={t.id}
            id={`perps-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`perps-panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 px-3 py-3 text-center transition-colors sm:justify-start sm:gap-3 sm:px-4 sm:py-2.5 sm:text-left"
            style={{
              background: on ? "rgba(124, 196, 232, 0.14)" : "transparent",
              boxShadow: on ? "inset 0 -2px 0 var(--rv-blue)" : "none",
            }}
          >
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-bold"
              style={{ color: on ? "#fff" : "var(--rv-ink-2)" }}
            >
              {t.id === "scanner" && <ScannerGlyph size={15} className="text-[var(--rv-blue)]" />}
              {t.label}
              {t.count !== null && (
                <span className="rv-num rounded-full bg-white/[0.07] px-1.5 text-[11px] font-semibold text-[var(--rv-ink-2)]">
                  {t.count}
                </span>
              )}
            </span>
            <span className="hidden truncate text-[11px] text-[var(--rv-ink-3)] sm:inline">{t.sub}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Names the data's origin and age at the top of each tab. */
export function SourceStrip({ kind, children }: { kind: SourceTab; children?: ReactNode }) {
  const scanner = kind === "scanner"
  return (
    <div
      className="rounded-[var(--rv-radius)] border px-3 py-2.5 text-[12px] text-[var(--rv-ink-2)]"
      style={{
        borderColor: scanner ? "rgba(124, 196, 232, 0.35)" : "var(--rv-stroke)",
        background: scanner ? "rgba(124, 196, 232, 0.06)" : "var(--rv-sunken)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--rv-ink)]">
          {scanner ? (
            <>
              <ScannerGlyph className="text-[var(--rv-blue)]" /> Riven Scanner
            </>
          ) : (
            "Live markets"
          )}
        </span>
        {children && <span className="rv-num text-[11px] text-[var(--rv-ink-3)]">{children}</span>}
      </div>
      <p className="mt-1 leading-snug text-[var(--rv-ink-3)]">
        {scanner
          ? "Setups found on Bybit, MEXC and Binance, powered by sakz-bot. Entry, stop and targets are priced on that exchange, so they can differ from live market prices."
          : "Live price, 24h change and volume for every perp market. A scanner pill marks a coin with an open Riven Scanner call."}
      </p>
    </div>
  )
}

/** The scanner's opinion on a market row: outlined and glyphed, so it never reads as a price. */
export function ScannerPill({
  bias,
  confidence,
  exchange,
  scanTime,
}: {
  bias: "LONG" | "SHORT"
  confidence: number
  exchange: string
  scanTime: string
}) {
  const side = bias === "LONG" ? "var(--rv-up)" : "var(--rv-down)"
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--rv-blue)]/45 px-1.5 py-px text-[9.5px] font-bold"
      title={`Riven Scanner call from ${venueName(exchange)}: ${bias} ${confidence}/10, ${ago(scanTime)} ago`}
    >
      <ScannerGlyph size={10} className="text-[var(--rv-blue)]" />
      <span style={{ color: side }}>{bias}</span>
      <span className="text-[var(--rv-ink-2)]">{confidence}/10</span>
    </span>
  )
}

/**
 * Where a call was made vs where Riven's paper account trades. `mark` is Hyperliquid's
 * live price: undefined while markets load, null when Hyperliquid doesn't list the coin.
 */
export function PriceGap({
  exchange,
  entry,
  mark,
  scanTime,
  showNow = true,
}: {
  exchange: string
  entry: number
  mark: number | null | undefined
  scanTime: string
  /** False for finished calls: today's market price says nothing about them. */
  showNow?: boolean
}) {
  const gap = mark ? ((mark - entry) / entry) * 100 : null
  return (
    <div className="rv-num space-y-0.5 text-[11px] leading-snug text-[var(--rv-ink-3)]">
      <p>
        Called on <b className="text-[var(--rv-ink-2)]">{venueName(exchange)}</b> at{" "}
        <b className="text-[var(--rv-ink-2)]">{priceUsd(entry)}</b> · {ago(scanTime)} ago
      </p>
      {showNow && <p>
        {mark === undefined ? (
          "Live market price loading…"
        ) : mark === null ? (
          "No live market for this coin, so it can't be paper-traded here"
        ) : (
          <>
            Live market price now <b className="text-[var(--rv-ink-2)]">{priceUsd(mark)}</b>
            {gap !== null && ` (${gap >= 0 ? "+" : ""}${gap.toFixed(1)}% vs entry)`}
          </>
        )}
      </p>}
    </div>
  )
}

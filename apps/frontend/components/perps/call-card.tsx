"use client"

import Link from "next/link"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { CoinIcon } from "@/components/perps/coin-icon"
import { priceUsd } from "@/lib/format"
import { signalCoinKey } from "@/lib/perp-symbols"
import { ArrowIcon } from "@/components/riven/arrow"
import { PriceGap } from "@/components/perps/source-ui"

const OUTCOME: Record<string, { label: string; color: string }> = {
  pending: { label: "Live", color: "var(--rv-blue)" },
  t1_hit: { label: "Hit T1", color: "var(--rv-up)" },
  t2_hit: { label: "Hit T2", color: "var(--rv-up)" },
  t3_hit: { label: "Hit T3", color: "var(--rv-up)" },
  sl_hit: { label: "Stopped out", color: "var(--rv-down)" },
  expired: { label: "Expired", color: "var(--rv-ink-3)" },
}

const pctFrom = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : 0)
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`

function Level({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--rv-ink-3)] uppercase">{label}</p>
      <p className="rv-num truncate text-[13px] font-bold" style={{ color: color ?? "var(--rv-ink)" }}>
        {value}
      </p>
      {sub && (
        <p className="rv-num text-[10.5px]" style={{ color: color ?? "var(--rv-ink-3)" }}>
          {sub}
        </p>
      )}
    </div>
  )
}

/**
 * One scanner call, laid out like a trading card: the pair's logo on the
 * left; on the right the side, calibrated conviction and the plan in order —
 * entry zone, stop, then the three targets.
 */
export function CallCard({
  signal: s,
  mark,
  onTrade,
}: {
  signal: PerpSignal
  /** Hyperliquid's live price: undefined while loading, null if Hyperliquid doesn't list the coin. */
  mark?: number | null
  onTrade: (s: PerpSignal) => void
}) {
  const coin = signalCoinKey(s.symbol)
  const long = s.bias === "LONG"
  const side = long ? "var(--rv-up)" : "var(--rv-down)"
  const o = OUTCOME[s.outcome] ?? OUTCOME.pending!
  const conv = Math.max(0, Math.min(10, s.confidence))
  const convColor = conv >= 7 ? "var(--rv-healthy)" : conv >= 5 ? "var(--rv-caution)" : "var(--rv-risk)"
  const calibrated = s.rawConfidence !== null && s.rawConfidence !== undefined && s.rawConfidence !== s.confidence
  return (
    <article className="rv-card flex gap-4 p-4 transition-colors hover:border-[var(--rv-stroke-strong)]">
      {/* logo */}
      <Link href={`/perps/${coin}`} className="flex w-[72px] shrink-0 flex-col items-center gap-2 pt-0.5" aria-label={`${coin} pair page`}>
        <CoinIcon coin={coin} size={64} />
        <span
          className="rounded px-2 py-0.5 text-[11px] font-extrabold"
          style={{ color: "#0b0b0d", background: side }}
        >
          {s.bias}
        </span>
      </Link>

      {/* setup */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <Link href={`/perps/${coin}`} className="text-[16px] font-bold text-[var(--rv-ink)] hover:underline">
              {coin}
              <span className="text-[12px] font-semibold text-[var(--rv-ink-3)]">/USDT</span>
            </Link>
            {s.entryConfirmed === 0 && s.outcome !== "pending" && (
              <p className="text-[11px] text-[var(--rv-ink-3)]">Entry never filled</p>
            )}
          </div>
          <span
            className="ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold"
            style={{ color: o.color, borderColor: o.color }}
          >
            {o.label}
          </span>
        </div>

        {/* conviction */}
        <div>
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-[var(--rv-ink-3)]">
              Conviction{calibrated ? " (self-calibrated)" : ""}
            </span>
            <span className="rv-num font-bold" style={{ color: convColor }}>
              {conv}/10
              {calibrated && <span className="font-medium text-[var(--rv-ink-3)]"> · raw {s.rawConfidence}</span>}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${conv * 10}%`, background: convColor }} />
          </div>
          {s.winProb !== null && s.winProb !== undefined && (
            <p className="mt-1 text-[10.5px] text-[var(--rv-ink-3)]">
              Model win odds <b className="text-[var(--rv-ink-2)]">{Math.round(s.winProb * 100)}%</b> — learned from past calls
            </p>
          )}
        </div>

        {/* the plan, in order */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-2 border-t border-[var(--rv-stroke)] pt-2.5">
          <Level label="Entry" value={priceUsd(s.entryPrice)} sub={`${priceUsd(s.entryLow)}–${priceUsd(s.entryHigh)}`} />
          <Level label="Stop" value={priceUsd(s.stopLoss)} sub={signed(pctFrom(s.entryPrice, s.stopLoss))} color="var(--rv-down)" />
          <Level
            label="Risk : reward"
            value={(() => {
              const risk = Math.abs(s.entryPrice - s.stopLoss)
              return risk > 0 ? `1 : ${(Math.abs(s.t1 - s.entryPrice) / risk).toFixed(1)}` : "—"
            })()}
            sub="to target 1"
          />
          <Level label="Target 1" value={priceUsd(s.t1)} sub={signed(pctFrom(s.entryPrice, s.t1))} color="var(--rv-up)" />
          <Level label="Target 2" value={priceUsd(s.t2)} sub={signed(pctFrom(s.entryPrice, s.t2))} color="var(--rv-up)" />
          <Level label="Target 3" value={priceUsd(s.t3)} sub={signed(pctFrom(s.entryPrice, s.t3))} color="var(--rv-up)" />
        </div>

        <PriceGap
          exchange={s.exchange}
          entry={s.entryPrice}
          mark={mark}
          scanTime={s.scanTime}
          showNow={s.outcome === "pending"}
        />

        <div className="flex items-center gap-2 pt-0.5">
          <Link
            href={`/perps/${coin}`}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--rv-ice)] hover:underline"
          >
            Chart & Riven&apos;s read
            <ArrowIcon />
          </Link>
          {s.outcome === "pending" && (
            <button
              type="button"
              onClick={() => onTrade(s)}
              disabled={mark === null}
              title={
                mark === null
                  ? "Hyperliquid doesn't list this coin"
                  : "Levels come from the scanner's exchange; the paper order fills at Hyperliquid's price"
              }
              className="rv-btn ml-auto h-8 px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Paper trade on Hyperliquid
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

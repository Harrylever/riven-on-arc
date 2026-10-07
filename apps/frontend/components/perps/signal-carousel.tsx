"use client"

import type { PerpSignal } from "@/components/perps/perps-panel"
import { ago, priceUsd } from "@/lib/format"
import { signalCoinKey } from "@/lib/perp-symbols"

const OUTCOME: Record<string, { label: string; color: string }> = {
  pending: { label: "Live", color: "var(--rv-blue)" },
  t1_hit: { label: "Hit T1", color: "var(--rv-up)" },
  t2_hit: { label: "Hit T2", color: "var(--rv-up)" },
  t3_hit: { label: "Hit T3", color: "var(--rv-up)" },
  sl_hit: { label: "Stopped", color: "var(--rv-down)" },
  expired: { label: "Expired", color: "var(--rv-ink-3)" },
}

const pctFrom = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : 0)

/**
 * The trade plan drawn as a ladder: stop, entry zone, three targets, and where
 * price is now — so the call reads at a glance, like a chart thumbnail.
 */
function Ladder({ s, mark }: { s: PerpSignal; mark: number | null }) {
  const long = s.bias === "LONG"
  const levels = [s.stopLoss, s.entryLow, s.entryHigh, s.t1, s.t2, s.t3, ...(mark ? [mark] : [])]
  const lo = Math.min(...levels)
  const hi = Math.max(...levels)
  const span = hi - lo || 1
  // top of the box = highest price
  const y = (p: number) => 8 + (1 - (p - lo) / span) * 104
  const up = "var(--rv-up)"
  const down = "var(--rv-down)"
  const tp = long ? up : down
  return (
    <svg viewBox="0 0 200 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`zone-${s.id}`} x1="0" x2="1">
          <stop offset="0" stopColor="rgba(124,196,232,0.05)" />
          <stop offset="1" stopColor="rgba(124,196,232,0.25)" />
        </linearGradient>
      </defs>
      {/* entry zone */}
      <rect x="0" y={y(s.entryHigh)} width="200" height={Math.max(2, y(s.entryLow) - y(s.entryHigh))} fill={`url(#zone-${s.id})`} />
      {[
        [s.t3, "T3", tp],
        [s.t2, "T2", tp],
        [s.t1, "T1", tp],
        [s.stopLoss, "SL", long ? down : up],
      ].map(([p, label, col]) => (
        <g key={label as string}>
          <line x1="0" x2="200" y1={y(p as number)} y2={y(p as number)} stroke={col as string} strokeOpacity={0.75} strokeDasharray={label === "SL" ? "0" : "4 4"} />
          <text x="196" y={y(p as number) - 3} textAnchor="end" fontSize="9" fontWeight="700" fill={col as string}>
            {label as string}
          </text>
        </g>
      ))}
      <text x="4" y={y(s.entryHigh) - 3} fontSize="9" fontWeight="700" fill="var(--rv-ice)">
        ENTRY
      </text>
      {mark !== null && (
        <g>
          <line x1="0" x2="200" y1={y(mark)} y2={y(mark)} stroke="var(--rv-ink)" strokeWidth={1.5} />
          <circle cx="100" cy={y(mark)} r="3.5" fill="var(--rv-ink)" />
          <text x="108" y={y(mark) + 12} fontSize="9" fontWeight="700" fill="var(--rv-ink)">
            NOW
          </text>
        </g>
      )}
    </svg>
  )
}

/** sakz-bot's calls as a swipeable row of cards, like the home page's tokens. */
export function SignalCarousel({
  signals,
  marks,
  onSelect,
}: {
  signals: PerpSignal[]
  /** Live mark price per base coin (Hyperliquid). */
  marks: Map<string, number>
  onSelect: (s: PerpSignal) => void
}) {
  if (signals.length === 0) {
    return (
      <div className="rv-card px-4 py-6 text-center text-[13px] text-[var(--rv-ink-2)]">
        No open scanner calls right now — sakz-bot scans every ~10 minutes. Connect Telegram above to get the next one.
      </div>
    )
  }
  return (
    <div className="scrollbar-hidden -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
      {signals.map((s) => {
        const coin = signalCoinKey(s.symbol)
        const long = s.bias === "LONG"
        const col = long ? "var(--rv-up)" : "var(--rv-down)"
        const mark = marks.get(coin) ?? null
        const o = OUTCOME[s.outcome] ?? OUTCOME.pending!
        const t1Pct = pctFrom(s.entryPrice, s.t1)
        const slPct = pctFrom(s.entryPrice, s.stopLoss)
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s)}
            className="group relative flex w-[232px] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-card)] text-left transition-colors hover:border-[var(--rv-stroke-strong)]"
          >
            <div
              className="relative aspect-[5/3] w-full overflow-hidden"
              style={{
                background: `linear-gradient(160deg, ${long ? "rgba(163,230,53,0.16)" : "rgba(248,113,113,0.16)"}, var(--rv-sunken) 70%)`,
              }}
            >
              <div className="absolute inset-x-2 top-7 bottom-2">
                <Ladder s={s} mark={mark} />
              </div>
              <span
                className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[11px] font-extrabold"
                style={{ color: "#0b0b0d", background: col }}
              >
                {s.bias}
              </span>
              <span
                className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] font-bold"
                style={{ color: o.color }}
              >
                {o.label}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-[var(--rv-ink)]">
                    {coin}
                    <span className="text-[11.5px] font-semibold text-[var(--rv-ink-3)]"> /USDT</span>
                  </p>
                  <p className="text-[11px] text-[var(--rv-ink-3)]">
                    {s.exchange} · {ago(s.scanTime)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="rv-num text-[13px] font-bold text-[var(--rv-ink)]">{priceUsd(mark ?? s.entryPrice)}</p>
                  <p className="text-[10.5px] text-[var(--rv-ink-3)]">{mark ? "now" : "entry"}</p>
                </div>
              </div>
              {/* conviction */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.confidence * 10)}%`, background: col }} />
                </div>
                <span className="rv-num text-[11px] font-semibold text-[var(--rv-ink-2)]">{s.confidence}/10</span>
              </div>
              <div className="rv-num grid grid-cols-3 gap-1 text-[10.5px]">
                <span className="text-[var(--rv-ink-3)]">
                  Entry
                  <b className="block text-[11.5px] text-[var(--rv-ink)]">{priceUsd(s.entryPrice)}</b>
                </span>
                <span className="text-[var(--rv-ink-3)]">
                  T1
                  <b className="block text-[11.5px]" style={{ color: "var(--rv-up)" }}>
                    {t1Pct >= 0 ? "+" : ""}
                    {t1Pct.toFixed(1)}%
                  </b>
                </span>
                <span className="text-[var(--rv-ink-3)]">
                  Stop
                  <b className="block text-[11.5px]" style={{ color: "var(--rv-down)" }}>
                    {slPct >= 0 ? "+" : ""}
                    {slPct.toFixed(1)}%
                  </b>
                </span>
              </div>
              <span className="mt-auto pt-1 text-[11.5px] font-semibold text-[var(--rv-ice)] group-hover:underline">
                See the plan · paper trade →
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

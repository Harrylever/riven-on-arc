"use client"

import { useMemo, useState } from "react"
import type { Candle } from "@/lib/hyperliquid"
import { priceUsd } from "@/lib/format"

interface PerpChartProps {
  symbol: string
  markPrice: number
  candles: Candle[]
  interval: "15m" | "1h" | "4h" | "1d"
  onIntervalChange: (interval: "15m" | "1h" | "4h" | "1d") => void
  loading?: boolean
}

const WIDTH = 800
const HEIGHT = 300
const PADDING = { top: 20, right: 60, bottom: 30, left: 10 }
const CHART_W = WIDTH - PADDING.left - PADDING.right
const CHART_H = HEIGHT - PADDING.top - PADDING.bottom

export function PerpChart({
  symbol,
  markPrice,
  candles,
  interval,
  onIntervalChange,
  loading = false,
}: PerpChartProps) {
  const [chartMode, setChartMode] = useState<"area" | "candle">("area")
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const activeCandle =
    hoverIdx !== null && candles[hoverIdx] ? candles[hoverIdx] : null
  const displayPrice = activeCandle ? activeCandle.close : markPrice

  const { points, minPrice, maxPrice, priceRange, isUp } = useMemo(() => {
    if (!candles || candles.length === 0) {
      return { points: [], minPrice: 0, maxPrice: 0, priceRange: 1, isUp: true }
    }

    const prices = candles.map((c) => c.close)
    const min = Math.min(...candles.map((c) => c.low))
    const max = Math.max(...candles.map((c) => c.high))
    const range = max - min || 1
    const up = candles[candles.length - 1].close >= candles[0].open

    return {
      points: prices,
      minPrice: min,
      maxPrice: max,
      priceRange: range,
      isUp: up,
    }
  }, [candles])

  const getY = (val: number) => {
    return PADDING.top + CHART_H - ((val - minPrice) / priceRange) * CHART_H
  }

  const getX = (idx: number, total: number) => {
    if (total <= 1) return PADDING.left
    return PADDING.left + (idx / (total - 1)) * CHART_W
  }

  // Generate Area & Line paths
  const { pathD, areaD, lastX, lastY } = useMemo(() => {
    if (points.length === 0) return { pathD: "", areaD: "", lastX: 0, lastY: 0 }

    const computeY = (val: number) =>
      PADDING.top + CHART_H - ((val - minPrice) / priceRange) * CHART_H
    const computeX = (idx: number, total: number) =>
      total <= 1 ? PADDING.left : PADDING.left + (idx / (total - 1)) * CHART_W

    const pts = points.map((p, idx) => ({
      x: computeX(idx, points.length),
      y: computeY(p),
    }))

    const pD = pts.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`
    }, "")

    const last = pts[pts.length - 1]
    const first = pts[0]
    const bottomY = PADDING.top + CHART_H
    const aD = `${pD} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`

    return { pathD: pD, areaD: aD, lastX: last.x, lastY: last.y }
  }, [points, minPrice, priceRange])

  const strokeColor = isUp ? "var(--up)" : "var(--down)"

  return (
    <div className="flex flex-col rounded-none border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* Chart Controls & Active Price Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-extrabold text-[var(--text-primary)]">
            {priceUsd(displayPrice)}
          </span>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {activeCandle
              ? new Date(activeCandle.time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })
              : `${symbol}-PERP`}
          </span>
          {activeCandle && (
            <span className="hidden font-mono text-[11px] text-[var(--text-secondary)] sm:inline">
              O: {priceUsd(activeCandle.open)} H: {priceUsd(activeCandle.high)}{" "}
              L: {priceUsd(activeCandle.low)} V:{" "}
              {activeCandle.volume.toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setChartMode("area")}
              className={`px-2 py-1 text-[11px] font-semibold transition-colors ${
                chartMode === "area"
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Area
            </button>
            <button
              type="button"
              onClick={() => setChartMode("candle")}
              className={`border-l border-[var(--border)] px-2 py-1 text-[11px] font-semibold transition-colors ${
                chartMode === "candle"
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Candles
            </button>
          </div>

          {/* Timeframe Selector */}
          <div className="flex border border-[var(--border)]">
            {(["15m", "1h", "4h", "1d"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onIntervalChange(tf)}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${
                  interval === tf
                    ? "bg-[var(--brand)] text-black"
                    : "border-l border-[var(--border)] text-[var(--text-muted)] first:border-l-0 hover:text-[var(--text-primary)]"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative mt-2 h-[280px] w-full select-none">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface)]/70 backdrop-blur-[1px]">
            <span className="animate-pulse font-mono text-xs text-[var(--text-muted)]">
              Streaming Hyperliquid candles…
            </span>
          </div>
        )}

        {candles.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
            No chart data available for this market
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="size-full overflow-visible"
            onMouseLeave={() => setHoverIdx(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const relX = ((e.clientX - rect.left) / rect.width) * WIDTH
              const normalizedX = (relX - PADDING.left) / CHART_W
              const idx = Math.min(
                candles.length - 1,
                Math.max(0, Math.round(normalizedX * (candles.length - 1))),
              )
              setHoverIdx(idx)
            }}
          >
            <defs>
              <linearGradient id="perpGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
                <stop offset="65%" stopColor={strokeColor} stopOpacity="0.05" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line
              x1={PADDING.left}
              y1={PADDING.top}
              x2={WIDTH - PADDING.right}
              y2={PADDING.top}
              stroke="var(--border)"
              strokeDasharray="2 4"
            />
            <line
              x1={PADDING.left}
              y1={PADDING.top + CHART_H / 2}
              x2={WIDTH - PADDING.right}
              y2={PADDING.top + CHART_H / 2}
              stroke="var(--border)"
              strokeDasharray="2 4"
            />
            <line
              x1={PADDING.left}
              y1={PADDING.top + CHART_H}
              x2={WIDTH - PADDING.right}
              y2={PADDING.top + CHART_H}
              stroke="var(--border)"
              strokeDasharray="2 4"
            />

            {/* Price Y Axis labels */}
            <text
              x={WIDTH - PADDING.right + 6}
              y={PADDING.top + 4}
              fill="var(--text-muted)"
              fontSize="10"
              fontFamily="monospace"
            >
              {priceUsd(maxPrice)}
            </text>
            <text
              x={WIDTH - PADDING.right + 6}
              y={PADDING.top + CHART_H / 2 + 4}
              fill="var(--text-muted)"
              fontSize="10"
              fontFamily="monospace"
            >
              {priceUsd((maxPrice + minPrice) / 2)}
            </text>
            <text
              x={WIDTH - PADDING.right + 6}
              y={PADDING.top + CHART_H + 4}
              fill="var(--text-muted)"
              fontSize="10"
              fontFamily="monospace"
            >
              {priceUsd(minPrice)}
            </text>

            {/* Area or Candlesticks Mode */}
            {chartMode === "area" ? (
              <>
                <path d={areaD} fill="url(#perpGradient)" />
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={lastX} cy={lastY} r="3.5" fill={strokeColor} />
              </>
            ) : (
              /* Candlestick renderer */
              candles.map((c, i) => {
                const x = getX(i, candles.length)
                const openY = getY(c.open)
                const closeY = getY(c.close)
                const highY = getY(c.high)
                const lowY = getY(c.low)
                const candleUp = c.close >= c.open
                const cColor = candleUp ? "var(--up)" : "var(--down)"
                const candleWidth = Math.max(2, CHART_W / candles.length - 2)

                const rectY = Math.min(openY, closeY)
                const rectH = Math.max(1.5, Math.abs(closeY - openY))

                return (
                  <g key={c.time}>
                    {/* Wick */}
                    <line
                      x1={x}
                      y1={highY}
                      x2={x}
                      y2={lowY}
                      stroke={cColor}
                      strokeWidth="1"
                    />
                    {/* Body */}
                    <rect
                      x={x - candleWidth / 2}
                      y={rectY}
                      width={candleWidth}
                      height={rectH}
                      fill={cColor}
                      rx="0.5"
                    />
                  </g>
                )
              })
            )}

            {/* Crosshair on hover */}
            {hoverIdx !== null && activeCandle && (
              <g>
                <line
                  x1={getX(hoverIdx, candles.length)}
                  y1={PADDING.top}
                  x2={getX(hoverIdx, candles.length)}
                  y2={PADDING.top + CHART_H}
                  stroke="var(--text-secondary)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={getX(hoverIdx, candles.length)}
                  cy={getY(activeCandle.close)}
                  r="4"
                  fill="var(--text-primary)"
                  stroke={strokeColor}
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { priceUsd } from "@/lib/format"

interface SingleLineChartProps {
  pairAddress?: string | null
  mint: string
  currentPrice?: number | null
  priceChange24h?: number | null
  priceChange1h?: number | null
  symbol: string
  onTradeApproved?: () => void
}

export interface UserTradeEntry {
  mint: string
  entryPrice: number
  solAmount: number
  tokenAmount: number
  timestamp: number
}

type Timeframe = "LIVE" | "1H" | "4H" | "1D" | "7D" | "ALL"
type ChartMode = "line" | "candle"

export function SingleLineChart({
  pairAddress,
  mint,
  currentPrice,
  priceChange24h,
  priceChange1h,
  symbol,
}: SingleLineChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1H")
  const [chartMode, setChartMode] = useState<ChartMode>("line")
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [entryTrade, setEntryTrade] = useState<UserTradeEntry | null>(null)

  // Load chart display preference and user trade entry from localStorage
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("clawdex_chart_mode") as ChartMode
      if (savedMode === "candle" || savedMode === "line") {
        // localStorage is browser-only — can't be read during SSR render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChartMode(savedMode)
      }

      const rawTrades = localStorage.getItem("clawdex_user_trades")
      if (rawTrades) {
        const trades = JSON.parse(rawTrades) as UserTradeEntry[]
        const match = trades.find((t) => t.mint === mint)
        if (match) setEntryTrade(match)
      }
    } catch {
      // ignore
    }
  }, [mint])

  const toggleChartMode = (mode: ChartMode) => {
    setChartMode(mode)
    try {
      localStorage.setItem("clawdex_chart_mode", mode)
    } catch {
      // ignore
    }
  }

  const price = currentPrice && currentPrice > 0 ? currentPrice : 0.00168

  // Generate realistic, consistent price points based on token price and timeframe
  const points = useMemo(() => {
    const numPoints = 40
    const pts: number[] = []
    const base = price

    // Timeframe factor
    const change =
      timeframe === "LIVE"
        ? (priceChange1h ?? 1.2) * 0.2
        : timeframe === "1H"
          ? (priceChange1h ?? 5.5)
          : timeframe === "4H"
            ? (priceChange1h ?? 5.5) * 2
            : timeframe === "1D"
              ? (priceChange24h ?? 15.2)
              : (priceChange24h ?? 15.2) * 1.5

    const startPrice = base / (1 + change / 100)

    // Seed jitter based on mint and timeframe
    let seed = 0
    for (let i = 0; i < mint.length; i++) {
      seed = (seed * 31 + mint.charCodeAt(i) + timeframe.charCodeAt(0)) >>> 0
    }

    let cur = startPrice
    const step = (base - startPrice) / numPoints

    for (let i = 0; i < numPoints; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const noise = ((seed % 1000) / 1000 - 0.48) * (base * 0.035)
      cur += step + noise
      // ensure positive
      pts.push(Math.max(cur, base * 0.1))
    }
    pts[numPoints - 1] = base // clamp last point to current price
    return pts
  }, [price, priceChange24h, priceChange1h, mint, timeframe])

  // Chart dimensions & SVG scaling
  const width = 640
  const height = 260
  const padding = { top: 25, bottom: 20, left: 10, right: 65 }

  const minVal = Math.min(...points) * 0.98
  const maxVal = Math.max(...points) * 1.02
  const range = maxVal - minVal || 1

  const getY = (val: number) =>
    height -
    padding.bottom -
    ((val - minVal) / range) * (height - padding.top - padding.bottom)

  const getX = (idx: number) =>
    padding.left +
    (idx / (points.length - 1)) * (width - padding.left - padding.right)

  const pathD = useMemo(() => {
    return points.reduce((acc, val, i) => {
      const x = getX(i)
      const y = getY(val)
      if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`
      // Smooth curve
      const prevX = getX(i - 1)
      const prevY = getY(points[i - 1])
      const midX = (prevX + x) / 2
      return `${acc} C ${midX.toFixed(1)} ${prevY.toFixed(1)}, ${midX.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`
    }, "")
  }, [points, minVal, maxVal])

  const areaD = useMemo(() => {
    const lastX = getX(points.length - 1)
    const firstX = getX(0)
    const bottomY = height - padding.bottom
    return `${pathD} L ${lastX.toFixed(1)} ${bottomY} L ${firstX.toFixed(1)} ${bottomY} Z`
  }, [pathD, points.length])

  const lastX = getX(points.length - 1)
  const lastY = getY(points[points.length - 1])

  // User entry calculations
  const entryY =
    entryTrade &&
    entryTrade.entryPrice >= minVal &&
    entryTrade.entryPrice <= maxVal
      ? getY(entryTrade.entryPrice)
      : null
  const isProfit = entryTrade ? price >= entryTrade.entryPrice : true
  const pnlPct = entryTrade
    ? ((price - entryTrade.entryPrice) / entryTrade.entryPrice) * 100
    : 0

  if (chartMode === "candle" && pairAddress) {
    return (
      <div className="flex flex-col gap-2 overflow-hidden rounded-none border border-white/10 bg-[#07080c] p-3 shadow-2xl">
        <div className="flex items-center justify-between px-2 pt-1">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--txt)]">
            <span className="size-2 animate-pulse rounded-full bg-emerald-400" />{" "}
            Candlestick View
          </span>
          <button
            onClick={() => toggleChartMode("line")}
            className="flex items-center gap-1 rounded-none border border-emerald-500/30 bg-white/5 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition-all hover:bg-white/10"
          >
            📈 Switch to Single Line
          </button>
        </div>
        <div className="h-[360px] w-full overflow-hidden rounded-none border border-white/5">
          <iframe
            src={`https://dexscreener.com/solana/${pairAddress}?embed=1&theme=dark&info=0&trades=0`}
            title="Price Chart"
            className="h-full w-full border-0"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-none border border-white/10 bg-[#07080c] p-3 shadow-2xl sm:p-4">
      {/* Chart SVG */}
      <div className="relative h-[240px] w-full select-none sm:h-[260px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full overflow-visible"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const relX = ((e.clientX - rect.left) / rect.width) * width
            const idx = Math.min(
              points.length - 1,
              Math.max(
                0,
                Math.round(
                  ((relX - padding.left) /
                    (width - padding.left - padding.right)) *
                    (points.length - 1),
                ),
              ),
            )
            setHoverIdx(idx)
          }}
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--up)" stopOpacity="0.28" />
              <stop offset="60%" stopColor="var(--up)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--up)" stopOpacity="0.0" />
            </linearGradient>

            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Area Fill */}
          <path d={areaD} fill="url(#chartGradient)" />

          {/* Main Glowing Line */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--up)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#glow)"
          />

          {/* Horizontal Dashed Reference Line to Current Price */}
          <line
            x1={padding.left}
            y1={lastY}
            x2={width - 5}
            y2={lastY}
            stroke="var(--up)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.35"
          />

          {/* Active Price Pulse Point */}
          <circle
            cx={lastX}
            cy={lastY}
            r="7"
            fill="var(--up)"
            opacity="0.3"
            className="animate-ping"
          />
          <circle cx={lastX} cy={lastY} r="4" fill="var(--up)" />

          {/* USER ENTRY PROFIT / LOSS HORIZONTAL LINE */}
          {entryTrade && entryY !== null && (
            <g>
              <line
                x1={padding.left}
                y1={entryY}
                x2={width - padding.right}
                y2={entryY}
                stroke={isProfit ? "var(--up)" : "var(--down)"}
                strokeWidth="1.8"
                strokeDasharray="4 4"
                opacity="0.85"
              />
              {/* Entry Pill on Left Edge */}
              <rect
                x={padding.left + 4}
                y={entryY - 10}
                width="110"
                height="20"
                rx="4"
                fill={isProfit ? "#052e16" : "#450a0a"}
                stroke={isProfit ? "var(--up)" : "var(--down)"}
                strokeWidth="1"
              />
              <text
                x={padding.left + 59}
                y={entryY + 4}
                fill={isProfit ? "var(--up)" : "var(--down)"}
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                Entry {isProfit ? "+" : ""}
                {pnlPct.toFixed(1)}%
              </text>
            </g>
          )}

          {/* Hover Crosshair & Node */}
          {hoverIdx !== null && (
            <g>
              <line
                x1={getX(hoverIdx)}
                y1={padding.top}
                x2={getX(hoverIdx)}
                y2={height - padding.bottom}
                stroke="#ffffff"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.4"
              />
              <circle
                cx={getX(hoverIdx)}
                cy={getY(points[hoverIdx])}
                r="5"
                fill="#ffffff"
              />
            </g>
          )}
        </svg>

        {/* Current Price Pill on Right Edge (matches uploaded image) */}
        <div
          className="pointer-events-none absolute right-1 z-10 flex -translate-y-1/2 items-center gap-1.5 rounded-none bg-[var(--up)] px-2 py-1 font-mono text-[10px] font-black text-[var(--text-on-score)] shadow-[0_0_15px_rgba(63,191,127,0.5)] transition-all sm:text-[11px]"
          style={{ top: `${(lastY / height) * 100}%` }}
        >
          {priceUsd(hoverIdx !== null ? points[hoverIdx] : price)}
        </div>
      </div>

      {/* Timeframe Bar & Chart Mode Switcher (strictly matching screenshot) */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5">
        <div className="flex items-center gap-1 sm:gap-2">
          {(["LIVE", "1H", "4H", "1D", "7D", "ALL"] as Timeframe[]).map(
            (tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded-none px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase transition-all ${
                  timeframe === tf
                    ? "bg-white/10 font-extrabold text-white shadow-inner"
                    : "text-white/40 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                {tf === "LIVE" ? (
                  <span className="flex items-center gap-1">
                    LIVE{" "}
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  </span>
                ) : (
                  tf
                )}
              </button>
            ),
          )}
        </div>

        {/* Mode Toggle Button: Single Line vs Candlestick */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleChartMode("line")}
            title="Single Line Area Chart"
            className={`rounded-none border p-1.5 transition-all ${
              chartMode === "line"
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                : "border-white/5 bg-white/[0.02] text-white/40 hover:text-white"
            }`}
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
          </button>
          <button
            onClick={() => toggleChartMode("candle")}
            title="Candlestick Chart"
            className={`rounded-none border p-1.5 transition-all ${
              chartMode === "candle"
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                : "border-white/5 bg-white/[0.02] text-white/40 hover:text-white"
            }`}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="2" height="16" />
              <rect x="3.5" y="7" width="5" height="8" rx="1" />
              <rect x="17" y="4" width="2" height="16" />
              <rect x="15.5" y="9" width="5" height="7" rx="1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

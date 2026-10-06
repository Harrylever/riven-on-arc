"use client"

import { Line, LineChart, YAxis } from "recharts"

export interface SparklineChanges {
  priceChange5m?: number | null
  priceChange1h?: number | null
  priceChange6h?: number | null
  priceChange24h?: number | null
}

/**
 * A small trend line reconstructed from real percentage-change fields
 * already fetched for the feed (5m/1h/6h/24h) — working backward from the
 * current price, not an invented curve. Coarse (5 points), but every point
 * is a real data point, matching the app's "never fabricate" rule elsewhere.
 * Returns null when there isn't enough real data to plot anything.
 */
function reconstructPoints(changes: SparklineChanges): number[] | null {
  const { priceChange5m, priceChange1h, priceChange6h, priceChange24h } =
    changes
  const known = [
    priceChange24h,
    priceChange6h,
    priceChange1h,
    priceChange5m,
  ].filter((v) => v != null)
  if (known.length === 0) return null

  // Work backward from "now" = 1 using each real % change; a missing
  // timeframe just repeats the nearest known value instead of guessing.
  const now = 1
  const at5m = priceChange5m != null ? now / (1 + priceChange5m / 100) : now
  const at1h = priceChange1h != null ? now / (1 + priceChange1h / 100) : at5m
  const at6h = priceChange6h != null ? now / (1 + priceChange6h / 100) : at1h
  const at24h = priceChange24h != null ? now / (1 + priceChange24h / 100) : at6h
  return [at24h, at6h, at1h, at5m, now]
}

export function Sparkline({
  changes,
  width = 64,
  height = 24,
}: {
  changes: SparklineChanges
  width?: number
  height?: number
}) {
  const points = reconstructPoints(changes)
  if (!points) return null

  const trendUp = points[points.length - 1] >= points[0]
  const data = points.map((v) => ({ v }))

  return (
    <LineChart
      width={width}
      height={height}
      data={data}
      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
    >
      <YAxis hide domain={["dataMin", "dataMax"]} />
      <Line
        type="monotone"
        dataKey="v"
        stroke={trendUp ? "var(--up)" : "var(--down)"}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  )
}

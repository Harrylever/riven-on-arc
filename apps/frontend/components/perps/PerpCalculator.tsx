"use client"

import { useState } from "react"
import { priceUsd, usd } from "@/lib/format"
import type { PerpMarket } from "@/lib/hyperliquid"

interface PerpCalculatorProps {
  market: PerpMarket
}

export function PerpCalculator({ market }: PerpCalculatorProps) {
  const [margin, setMargin] = useState<number>(500)
  const [leverage, setLeverage] = useState<number>(
    Math.min(5, market.maxLeverage),
  )
  const [bias, setBias] = useState<"LONG" | "SHORT">("LONG")

  const positionUsd = margin * leverage
  const positionTokens =
    market.markPrice > 0 ? positionUsd / market.markPrice : 0

  // Estimated liquidation threshold with ~10% maintenance buffer
  const mmBuffer = 0.9
  const liqPrice =
    bias === "LONG"
      ? market.markPrice * Math.max(0, 1 - (1 / leverage) * mmBuffer)
      : market.markPrice * (1 + (1 / leverage) * mmBuffer)

  const distToLiqPct =
    market.markPrice > 0
      ? Math.abs(((liqPrice - market.markPrice) / market.markPrice) * 100)
      : 0

  // Funding calculations
  // Positive hourly funding means longs pay shorts. If long, it is a cost; if short, it is a rebate.
  const hourlyFundingAmount = positionUsd * market.fundingHourly
  const isPayingFunding =
    bias === "LONG" ? market.fundingHourly > 0 : market.fundingHourly < 0

  // Risk Rating
  let riskColor = "var(--up)"
  let riskLabel = "Low Liquidation Risk"
  if (distToLiqPct < 10 || leverage >= 15) {
    riskColor = "var(--down)"
    riskLabel = "High Liquidation Risk"
  } else if (distToLiqPct < 25 || leverage >= 8) {
    riskColor = "var(--score-caution)"
    riskLabel = "Moderate Volatility Risk"
  }

  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-2 text-xs font-bold text-[var(--text-secondary)]">
        <span>Position & Liquidation Simulator</span>
        <span
          className="rounded-none border px-2 py-0.5 text-[10px] font-bold"
          style={{ borderColor: riskColor, color: riskColor }}
        >
          {riskLabel}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Controls */}
        <div className="space-y-3">
          {/* Bias switch */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[var(--text-muted)] uppercase">
              Direction
            </label>
            <div className="grid grid-cols-2 border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setBias("LONG")}
                className={`py-1.5 text-xs font-bold transition-colors ${
                  bias === "LONG"
                    ? "bg-[var(--up)] text-black"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() => setBias("SHORT")}
                className={`py-1.5 text-xs font-bold transition-colors ${
                  bias === "SHORT"
                    ? "bg-[var(--down)] text-white"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                SHORT
              </button>
            </div>
          </div>

          {/* Margin input */}
          <div>
            <div className="mb-1 flex justify-between text-[10px] font-bold text-[var(--text-muted)] uppercase">
              <span>Collateral Margin ($)</span>
              <span>${margin}</span>
            </div>
            <input
              type="number"
              min={10}
              max={1000000}
              step={50}
              value={margin}
              onChange={(e) =>
                setMargin(Math.max(1, Number(e.target.value) || 0))
              }
              className="w-full rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
            />
          </div>

          {/* Leverage slider */}
          <div>
            <div className="mb-1 flex justify-between text-[10px] font-bold text-[var(--text-muted)] uppercase">
              <span>Leverage</span>
              <span className="font-mono text-xs font-bold text-[var(--brand)]">
                {leverage}x (Max {market.maxLeverage}x)
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={market.maxLeverage}
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
            />
            <div className="mt-1 flex gap-1">
              {[2, 5, 10, 20].map((lev) => {
                if (lev > market.maxLeverage) return null
                return (
                  <button
                    key={lev}
                    type="button"
                    onClick={() => setLeverage(lev)}
                    className="border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] hover:border-[var(--brand)]"
                  >
                    {lev}x
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Results Pane */}
        <div className="flex flex-col justify-between rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-3 font-mono text-xs">
          <div className="space-y-2">
            <div className="flex justify-between border-b border-[var(--border)]/60 pb-1.5">
              <span className="text-[var(--text-muted)]">Position Size:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {usd(positionUsd)} ({positionTokens.toFixed(2)} {market.symbol})
              </span>
            </div>

            <div className="flex justify-between border-b border-[var(--border)]/60 pb-1.5">
              <span className="text-[var(--text-muted)]">Current Mark:</span>
              <span className="text-[var(--text-primary)]">
                {priceUsd(market.markPrice)}
              </span>
            </div>

            <div className="flex justify-between border-b border-[var(--border)]/60 pb-1.5">
              <span className="text-[var(--text-muted)]">
                Est. Liquidation:
              </span>
              <span className="font-bold" style={{ color: riskColor }}>
                {priceUsd(liqPrice)}
              </span>
            </div>

            <div className="flex justify-between border-b border-[var(--border)]/60 pb-1.5">
              <span className="text-[var(--text-muted)]">
                Liquidation Distance:
              </span>
              <span className="font-bold" style={{ color: riskColor }}>
                {distToLiqPct.toFixed(1)}% {bias === "LONG" ? "drop" : "rise"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">
                Est. Funding / Hr:
              </span>
              <span
                className={
                  isPayingFunding ? "text-[var(--down)]" : "text-[var(--up)]"
                }
              >
                {isPayingFunding ? "-" : "+"}$
                {Math.abs(hourlyFundingAmount).toFixed(3)}
              </span>
            </div>
          </div>

          <a
            href={`https://app.hyperliquid.xyz/trade/${market.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 border border-[var(--brand)] bg-[var(--brand)]/10 py-1.5 text-center text-xs font-bold text-[var(--brand)] transition-colors hover:bg-[var(--brand)] hover:text-black"
          >
            <span>Trade {market.symbol}-PERP on Hyperliquid</span>
            <span className="text-[10px]">↗</span>
          </a>
        </div>
      </div>
    </div>
  )
}

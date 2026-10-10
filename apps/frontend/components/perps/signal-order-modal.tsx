"use client"

import { useState } from "react"
import Link from "next/link"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { usePortfolio } from "@/hooks/use-portfolio"
import { priceUsd, ago } from "@/lib/format"
import { MiniBar } from "@/components/perps/mini-bar"
import { ArrowIcon } from "@/components/riven/arrow"

interface SignalOrderModalProps {
  signal: PerpSignal | null
  onClose: () => void
}

export function SignalOrderModal({ signal, onClose }: SignalOrderModalProps) {
  const { placeOrder, cashBalance, accountLabel } = usePortfolio()

  // Trading form state
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET" | "SPOT">(
    "LIMIT",
  )
  const [side, setSide] = useState<"LONG" | "SHORT" | "BUY">(
    signal?.bias === "SHORT" ? "SHORT" : "LONG",
  )
  const [price, setPrice] = useState<string>(
    signal ? String(signal.entryPrice) : "0",
  )
  const [usdSize, setUsdSize] = useState<string>("500")
  const [leverage, setLeverage] = useState<number>(10)
  const [selectedTp, setSelectedTp] = useState<number | null>(
    signal ? signal.t1 : null,
  )
  const [selectedSl, setSelectedSl] = useState<number | null>(
    signal ? signal.stopLoss : null,
  )
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)

  if (!signal) return null

  const biasColor = signal.bias === "LONG" ? "var(--rv-up)" : "var(--rv-down)"
  const currentPrice = Number(price) || signal.entryPrice || 1
  const numUsdSize = Number(usdSize) || 0
  const coinUnits =
    numUsdSize > 0 && currentPrice > 0 ? numUsdSize / currentPrice : 0
  const effectiveLeverage = orderType === "SPOT" ? 1 : leverage
  const requiredMargin = numUsdSize / effectiveLeverage
  const estFee = numUsdSize * 0.00045 // 0.045%

  // Risk / Reward ratio calculation
  const riskAmount = Math.abs(signal.entryPrice - signal.stopLoss)
  const rewardAmount = Math.abs(signal.t1 - signal.entryPrice)
  const rrRatio = riskAmount > 0 ? (rewardAmount / riskAmount).toFixed(2) : "—"

  const handlePercentageSelect = (pct: number) => {
    const available = cashBalance * effectiveLeverage
    const calculated = (available * pct).toFixed(0)
    setUsdSize(calculated)
  }

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setOrderError(null)

    if (numUsdSize <= 0) {
      setOrderError("Please enter a valid order size.")
      return
    }

    if (requiredMargin > cashBalance) {
      setOrderError(
        `Insufficient available cash ($${cashBalance.toFixed(2)}). Lower order size or increase leverage.`,
      )
      return
    }

    try {
      placeOrder({
        market: `${signal.symbol}-PERP`,
        type: orderType,
        side: orderType === "SPOT" ? "BUY" : side,
        size: Number(coinUnits.toFixed(4)),
        price: currentPrice,
        tp: selectedTp,
        sl: selectedSl,
        leverage: effectiveLeverage,
        exchange: signal.exchange,
      })

      setOrderSuccess(
        `Successfully placed ${orderType} ${orderType === "SPOT" ? "BUY" : side} order for ${signal.symbol}!`,
      )
      setTimeout(() => {
        setOrderSuccess(null)
      }, 4000)
    } catch (err: unknown) {
      setOrderError(
        err instanceof Error ? err.message : "Failed to place order.",
      )
    }
  }

  // Deep-link to venue exchange
  const getExchangeUrl = () => {
    const sym = signal.symbol.replace("/", "").toUpperCase()
    if (signal.exchange === "BYBIT") {
      return `https://www.bybit.com/trade/usdt/${sym}`
    } else if (signal.exchange === "BINANCE") {
      return `https://www.binance.com/en/futures/${sym}`
    } else if (signal.exchange === "MEXC") {
      return `https://futures.mexc.com/exchange/${sym}`
    }
    return `https://app.hyperliquid.xyz/trade/${sym.replace("USDT", "")}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden border border-[#162a27] bg-[#091312] text-[#d6e3e0] shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#162a27] bg-[#0c1a18] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className=" text-lg font-black text-white">
              {signal.symbol}
            </span>
            <span className="border border-[#1d3834] bg-[#091514] px-2 py-0.5 text-[11px] font-bold text-[#7d9b96] uppercase">
              {signal.exchange}
            </span>
            <span
              className="border px-2 py-0.5 text-[11px] font-extrabold uppercase"
              style={{ borderColor: biasColor, color: biasColor }}
            >
              {signal.bias}
            </span>
            <span className="border border-[#1d3834] bg-[#091514] px-2 py-0.5 text-[10px] font-bold text-[#2ee6a8]">
              R:R 1:{rrRatio}
            </span>
          </div>

          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center border border-[#1d3834] text-sm font-bold text-[#7d9b96] transition-colors hover:border-[#2ee6a8] hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body: Two columns on desktop */}
        <div className="grid flex-1 overflow-y-auto sm:grid-cols-1 md:grid-cols-12">
          {/* Left Column: Signal Intelligence Breakdown (5 cols) */}
          <div className="border-b border-[#162a27] bg-[#06100f] p-4 sm:p-5 md:col-span-5 md:border-r md:border-b-0">
            <div className="text-xs font-bold tracking-wider text-[#7d9b96] uppercase">
              Signal Intelligence & Key Levels
            </div>

            {/* Conviction Bar */}
            <div className="mt-3">
              <MiniBar
                label="Signal Conviction (0-10)"
                value={signal.confidence}
              />
            </div>

            {/* Price Targets Matrix */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between border border-[#162a27] bg-[#0c1a18] p-2.5 text-xs">
                <span className="text-[#7d9b96]">Tracked Entry</span>
                <span className="font-mono font-bold text-white">
                  {priceUsd(signal.entryPrice)}
                </span>
              </div>

              <div className="flex items-center justify-between border border-[#162a27] bg-[#0c1a18] p-2.5 text-xs">
                <span className="text-[#7d9b96]">Entry Zone</span>
                <span className="font-mono font-bold text-[#d6e3e0]">
                  {priceUsd(signal.entryLow)} – {priceUsd(signal.entryHigh)}
                </span>
              </div>

              <div className="flex items-center justify-between border border-red-500/20 bg-red-500/5 p-2.5 text-xs">
                <span className="text-red-400">Stop Loss</span>
                <span className="font-mono font-bold text-red-400">
                  {priceUsd(signal.stopLoss)}
                </span>
              </div>

              <div className="border border-[#162a27] bg-[#0c1a18] p-2.5">
                <div className="mb-1 text-[10px] font-bold text-[#7d9b96] uppercase">
                  Take Profit Targets
                </div>
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#2ee6a8]">
                      Target 1 (Conservative)
                    </span>
                    <span className="font-bold text-white">
                      {priceUsd(signal.t1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#2ee6a8]">Target 2 (Mid-Range)</span>
                    <span className="font-bold text-white">
                      {priceUsd(signal.t2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#2ee6a8]">Target 3 (Extended)</span>
                    <span className="font-bold text-white">
                      {priceUsd(signal.t3)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Call Timing & Signal Stats */}
            <div className="mt-4 border-t border-[#162a27] pt-3 text-[11px] text-[#7d9b96]">
              <div className="flex justify-between py-1">
                <span>Signal Age:</span>
                <span className="text-white">{ago(signal.scanTime)} ago</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Status:</span>
                <span className="font-bold text-[#2ee6a8] uppercase">
                  {signal.outcome.replace("_", " ")}
                </span>
              </div>
              {signal.entryConfirmed === 0 && (
                <div className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-300">
                  ⚠ Note: Price did not confirm inside entry zone during scan
                  period.
                </div>
              )}
            </div>

            {/* External Exchange Link */}
            <div className="mt-5">
              <a
                href={getExchangeUrl()}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 border border-[#1d3834] bg-[#0c1a18] py-2 text-xs font-bold text-[#2ee6a8] transition-colors hover:border-[#2ee6a8] hover:bg-[#112421]"
              >
                Open on {signal.exchange} ↗
              </a>
            </div>
          </div>

          {/* Right Column: Interactive Order Execution Panel (7 cols) */}
          <div className="p-4 sm:p-5 md:col-span-7">
            {/* Account Binding Indicator */}
            <div className="mb-3 flex items-center justify-between border border-[#162a27] bg-[#06100f] px-3 py-1.5 text-xs">
              <span className="text-[#7d9b96]">Trading Account:</span>
              <span className="font-bold text-[#2ee6a8]">{accountLabel}</span>
            </div>

            {/* Order Type Tabs: LIMIT | MARKET | BUY SPOT */}
            <div className="flex border border-[#162a27] bg-[#06100f]">
              {(["LIMIT", "MARKET", "SPOT"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setOrderType(type)
                    if (type === "SPOT") {
                      setSide("BUY")
                    } else if (side === "BUY") {
                      setSide(signal.bias === "SHORT" ? "SHORT" : "LONG")
                    }
                  }}
                  className={`flex-1 py-2 text-center text-xs font-black transition-colors ${
                    orderType === type
                      ? "bg-[#2ee6a8] text-black shadow"
                      : "text-[#7d9b96] hover:text-white"
                  }`}
                >
                  {type === "SPOT"
                    ? "Buy Spot"
                    : type === "LIMIT"
                      ? "Limit Order"
                      : "Market Order"}
                </button>
              ))}
            </div>

            {/* Side Selector (Perp only: Long vs Short) */}
            {orderType !== "SPOT" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide("LONG")}
                  className={`py-1.5 text-xs font-black transition-colors ${
                    side === "LONG"
                      ? "border border-[#2ee6a8] bg-[#2ee6a8]/20 text-[#2ee6a8]"
                      : "border border-[#162a27] bg-[#0c1a18] text-[#7d9b96] hover:text-white"
                  }`}
                >
                  LONG (Buy)
                </button>
                <button
                  type="button"
                  onClick={() => setSide("SHORT")}
                  className={`py-1.5 text-xs font-black transition-colors ${
                    side === "SHORT"
                      ? "border border-red-500 bg-red-500/20 text-red-400"
                      : "border border-[#162a27] bg-[#0c1a18] text-[#7d9b96] hover:text-white"
                  }`}
                >
                  SHORT (Sell)
                </button>
              </div>
            )}

            <form onSubmit={handleOrderSubmit} className="mt-4 space-y-3">
              {/* Order Price Input */}
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-[#7d9b96]">
                    {orderType === "MARKET"
                      ? "Market Execution Price"
                      : "Limit Price (USD)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPrice(String(signal.entryPrice))}
                    className="text-[10px] text-[#2ee6a8] hover:underline"
                  >
                    Signal Entry ({priceUsd(signal.entryPrice)})
                  </button>
                </div>
                <input
                  type="number"
                  step="any"
                  value={price}
                  disabled={orderType === "MARKET"}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full border border-[#162a27] bg-[#06100f] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#2ee6a8] disabled:opacity-60"
                />
              </div>

              {/* Order Size Input in USD */}
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-[#7d9b96]">Position Size (USD)</span>
                  <span className="text-[11px] text-[#7d9b96]">
                    ≈ {coinUnits.toFixed(4)} {signal.symbol.replace("USDT", "")}
                  </span>
                </div>
                <input
                  type="number"
                  step="any"
                  value={usdSize}
                  onChange={(e) => setUsdSize(e.target.value)}
                  className="w-full border border-[#162a27] bg-[#06100f] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#2ee6a8]"
                />

                {/* Percentage Quick Selectors */}
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {[0.25, 0.5, 0.75, 1.0].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handlePercentageSelect(pct)}
                      className="border border-[#162a27] bg-[#0c1a18] py-1 text-[11px] font-bold text-[#7d9b96] transition-colors hover:border-[#2ee6a8] hover:text-white"
                    >
                      {pct * 100}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Leverage Slider (if not spot) */}
              {orderType !== "SPOT" && (
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-[#7d9b96]">Leverage</span>
                    <span className="font-bold text-[#2ee6a8]">
                      {leverage}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="w-full accent-[#2ee6a8]"
                  />
                  <div className="flex justify-between text-[10px] text-[#7d9b96]">
                    <span>1x</span>
                    <span>10x</span>
                    <span>25x</span>
                    <span>50x</span>
                  </div>
                </div>
              )}

              {/* Quick TP / SL Presets from Signal */}
              <div className="border border-[#162a27] bg-[#06100f] p-3 text-xs">
                <div className="mb-2 font-bold text-[#7d9b96]">
                  Signal Target Presets
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTp(signal.t1)}
                    className={`border p-1.5 text-center transition-colors ${
                      selectedTp === signal.t1
                        ? "border-[#2ee6a8] bg-[#2ee6a8]/10 text-[#2ee6a8]"
                        : "border-[#162a27] text-[#7d9b96] hover:text-white"
                    }`}
                  >
                    <div className="text-[10px] font-bold">TP 1</div>
                    <div className="font-mono text-[11px]">
                      {priceUsd(signal.t1)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTp(signal.t2)}
                    className={`border p-1.5 text-center transition-colors ${
                      selectedTp === signal.t2
                        ? "border-[#2ee6a8] bg-[#2ee6a8]/10 text-[#2ee6a8]"
                        : "border-[#162a27] text-[#7d9b96] hover:text-white"
                    }`}
                  >
                    <div className="text-[10px] font-bold">TP 2</div>
                    <div className="font-mono text-[11px]">
                      {priceUsd(signal.t2)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTp(signal.t3)}
                    className={`border p-1.5 text-center transition-colors ${
                      selectedTp === signal.t3
                        ? "border-[#2ee6a8] bg-[#2ee6a8]/10 text-[#2ee6a8]"
                        : "border-[#162a27] text-[#7d9b96] hover:text-white"
                    }`}
                  >
                    <div className="text-[10px] font-bold">TP 3</div>
                    <div className="font-mono text-[11px]">
                      {priceUsd(signal.t3)}
                    </div>
                  </button>
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-[#162a27] pt-2">
                  <span className="text-[11px] text-[#7d9b96]">
                    Stop Loss Preset:
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedSl(signal.stopLoss)}
                    className={`border px-2 py-0.5 text-center font-mono text-xs transition-colors ${
                      selectedSl === signal.stopLoss
                        ? "border-red-500 bg-red-500/10 text-red-400"
                        : "border-[#162a27] text-[#7d9b96] hover:text-white"
                    }`}
                  >
                    SL ({priceUsd(signal.stopLoss)})
                  </button>
                </div>
              </div>

              {/* Order Summary breakdown */}
              <div className="space-y-1 text-xs text-[#7d9b96]">
                <div className="flex justify-between">
                  <span>Available Cash Balance:</span>
                  <span className="font-mono font-bold text-white">
                    ${cashBalance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Required Margin:</span>
                  <span className="font-mono font-bold text-white">
                    ${requiredMargin.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Taker Fee:</span>
                  <span className="font-mono">${estFee.toFixed(3)}</span>
                </div>
              </div>

              {/* Error & Success Feedback */}
              {orderError && (
                <div className="border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-400">
                  {orderError}
                </div>
              )}
              {orderSuccess && (
                <div className="border border-[#2ee6a8]/40 bg-[#2ee6a8]/10 p-2 text-xs text-[#2ee6a8]">
                  {orderSuccess}{" "}
                  <Link
                    href="/portfolio"
                    className="inline-flex items-center gap-1 font-bold underline hover:text-white"
                  >
                    View in Portfolio
                    <ArrowIcon />
                  </Link>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className={`w-full py-2.5 text-sm font-black tracking-wide uppercase transition-colors ${
                  orderType === "SPOT"
                    ? "bg-[#2ee6a8] text-black hover:bg-[#25c48f]"
                    : side === "LONG"
                      ? "bg-[#2ee6a8] text-black hover:bg-[#25c48f]"
                      : "bg-red-500 text-white hover:bg-red-600"
                }`}
              >
                {orderType === "SPOT"
                  ? `Buy Spot ${signal.symbol}`
                  : `Place ${orderType} ${side} (${leverage}x)`}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { usePortfolio } from "@/hooks/use-portfolio"
import { priceUsd, ago } from "@/lib/format"
import { MiniBar } from "@/components/perps/mini-bar"
import { ArrowIcon } from "@/components/riven/arrow"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] w-[min(56rem,calc(100vw-24px))] max-w-none flex-col gap-0 overflow-hidden rounded-[var(--rv-radius)] border-0 bg-[var(--rv-card)] p-0 text-[var(--rv-ink)] shadow-2xl ring-1 ring-[var(--rv-stroke-strong)] sm:max-w-none"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <DialogTitle className="font-sans text-lg font-black tracking-normal text-[var(--rv-ink)] normal-case">
              {signal.symbol}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Review the scanner setup and place a paper order.
            </DialogDescription>
            <span className="rounded-md border border-[var(--rv-stroke-strong)] bg-[var(--rv-sunken)] px-2 py-0.5 text-[11px] font-bold text-[var(--rv-ink-3)] uppercase">
              {signal.exchange}
            </span>
            <span
              className="rounded-md border px-2 py-0.5 text-[11px] font-extrabold uppercase"
              style={{ borderColor: biasColor, color: biasColor }}
            >
              {signal.bias}
            </span>
            <span className="rounded-md border border-[var(--rv-stroke-strong)] bg-[var(--rv-sunken)] px-2 py-0.5 text-[10px] font-bold text-[var(--rv-blue)]">
              R:R 1:{rrRatio}
            </span>
          </div>

          <DialogClose
            render={<Button variant="outline" size="icon-xs" />}
            className="size-7 rounded-md border border-[var(--rv-stroke-strong)] bg-transparent text-sm font-bold text-[var(--rv-ink-3)] transition-colors hover:border-[var(--rv-blue)] hover:text-[var(--rv-ink)]"
            aria-label="Close"
          >
            ✕
          </DialogClose>
        </div>

        {/* Modal Body: Two columns on desktop */}
        <div className="grid flex-1 overflow-y-auto sm:grid-cols-1 md:grid-cols-12">
          {/* Left Column: Signal Intelligence Breakdown (5 cols) */}
          <div className="border-b border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-4 sm:p-5 md:col-span-5 md:border-r md:border-b-0">
            <div className="text-xs font-bold tracking-wider text-[var(--rv-ink-3)] uppercase">
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
              <div className="flex items-center justify-between rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-2.5 text-xs">
                <span className="text-[var(--rv-ink-3)]">Tracked Entry</span>
                <span className="font-mono font-bold text-[var(--rv-ink)]">
                  {priceUsd(signal.entryPrice)}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-2.5 text-xs">
                <span className="text-[var(--rv-ink-3)]">Entry Zone</span>
                <span className="font-mono font-bold text-[var(--rv-ink)]">
                  {priceUsd(signal.entryLow)} – {priceUsd(signal.entryHigh)}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-md border border-[color-mix(in_srgb,var(--rv-down)_20%,transparent)] bg-[color-mix(in_srgb,var(--rv-down)_5%,transparent)] p-2.5 text-xs">
                <span className="text-[var(--rv-down)]">Stop Loss</span>
                <span className="font-mono font-bold text-[var(--rv-down)]">
                  {priceUsd(signal.stopLoss)}
                </span>
              </div>

              <div className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-2.5">
                <div className="mb-1 text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
                  Take Profit Targets
                </div>
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--rv-up)]">
                      Target 1 (Conservative)
                    </span>
                    <span className="font-bold text-[var(--rv-ink)]">
                      {priceUsd(signal.t1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--rv-up)]">
                      Target 2 (Mid-Range)
                    </span>
                    <span className="font-bold text-[var(--rv-ink)]">
                      {priceUsd(signal.t2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--rv-up)]">
                      Target 3 (Extended)
                    </span>
                    <span className="font-bold text-[var(--rv-ink)]">
                      {priceUsd(signal.t3)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Call Timing & Signal Stats */}
            <div className="mt-4 border-t border-[var(--rv-stroke)] pt-3 text-[11px] text-[var(--rv-ink-3)]">
              <div className="flex justify-between py-1">
                <span>Signal Age:</span>
                <span className="text-[var(--rv-ink)]">
                  {ago(signal.scanTime)} ago
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span>Status:</span>
                <span className="font-bold text-[var(--rv-blue)] uppercase">
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
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--rv-stroke-strong)] bg-[var(--rv-sunken)] py-2 text-xs font-bold text-[var(--rv-blue)] transition-colors hover:border-[var(--rv-blue)] hover:bg-[var(--rv-card-hover)]"
              >
                Open on {signal.exchange} ↗
              </a>
            </div>
          </div>

          {/* Right Column: Interactive Order Execution Panel (7 cols) */}
          <div className="p-4 sm:p-5 md:col-span-7">
            {/* Account Binding Indicator */}
            <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 py-1.5 text-xs">
              <span className="text-[var(--rv-ink-3)]">Trading Account:</span>
              <span className="font-bold text-[var(--rv-blue)]">
                {accountLabel}
              </span>
            </div>

            {/* Order Type Tabs: LIMIT | MARKET | BUY SPOT */}
            <div className="flex rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)]">
              {(["LIMIT", "MARKET", "SPOT"] as const).map((type) => (
                <Button
                  variant="plain"
                  size="bare"
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
                      ? "bg-[var(--rv-blue)] text-[var(--rv-on-blue)]"
                      : "text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                  }`}
                >
                  {type === "SPOT"
                    ? "Buy Spot"
                    : type === "LIMIT"
                      ? "Limit Order"
                      : "Market Order"}
                </Button>
              ))}
            </div>

            {/* Side Selector (Perp only: Long vs Short) */}
            {orderType !== "SPOT" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="plain"
                  size="bare"
                  type="button"
                  onClick={() => setSide("LONG")}
                  className={`py-1.5 text-xs font-black transition-colors ${
                    side === "LONG"
                      ? "border border-[var(--rv-up)] bg-[color-mix(in_srgb,var(--rv-up)_18%,transparent)] text-[var(--rv-up)]"
                      : "border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                  } rounded-md`}
                >
                  LONG (Buy)
                </Button>
                <Button
                  variant="plain"
                  size="bare"
                  type="button"
                  onClick={() => setSide("SHORT")}
                  className={`py-1.5 text-xs font-black transition-colors ${
                    side === "SHORT"
                      ? "border border-[var(--rv-down)] bg-[color-mix(in_srgb,var(--rv-down)_20%,transparent)] text-[var(--rv-down)]"
                      : "border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                  } rounded-md`}
                >
                  SHORT (Sell)
                </Button>
              </div>
            )}

            <form onSubmit={handleOrderSubmit} className="mt-4 space-y-3">
              {/* Order Price Input */}
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-[var(--rv-ink-3)]">
                    {orderType === "MARKET"
                      ? "Market Execution Price"
                      : "Limit Price (USD)"}
                  </span>
                  <Button
                    variant="plain"
                    size="bare"
                    type="button"
                    onClick={() => setPrice(String(signal.entryPrice))}
                    className="text-[10px] text-[var(--rv-blue)] hover:underline"
                  >
                    Signal Entry ({priceUsd(signal.entryPrice)})
                  </Button>
                </div>
                <Input
                  type="number"
                  step="any"
                  value={price}
                  disabled={orderType === "MARKET"}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 py-2 font-mono text-sm text-[var(--rv-ink)] outline-none focus:border-[var(--rv-blue)] disabled:opacity-60"
                />
              </div>

              {/* Order Size Input in USD */}
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-[var(--rv-ink-3)]">
                    Position Size (USD)
                  </span>
                  <span className="text-[11px] text-[var(--rv-ink-3)]">
                    ≈ {coinUnits.toFixed(4)} {signal.symbol.replace("USDT", "")}
                  </span>
                </div>
                <Input
                  type="number"
                  step="any"
                  value={usdSize}
                  onChange={(e) => setUsdSize(e.target.value)}
                  className="w-full rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 py-2 font-mono text-sm text-[var(--rv-ink)] outline-none focus:border-[var(--rv-blue)]"
                />

                {/* Percentage Quick Selectors */}
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {[0.25, 0.5, 0.75, 1.0].map((pct) => (
                    <Button
                      variant="plain"
                      size="bare"
                      key={pct}
                      type="button"
                      onClick={() => handlePercentageSelect(pct)}
                      className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] py-1 text-[11px] font-bold text-[var(--rv-ink-3)] transition-colors hover:border-[var(--rv-blue)] hover:text-[var(--rv-ink)]"
                    >
                      {pct * 100}%
                    </Button>
                  ))}
                </div>
              </div>

              {/* Leverage Slider (if not spot) */}
              {orderType !== "SPOT" && (
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-[var(--rv-ink-3)]">Leverage</span>
                    <span className="font-bold text-[var(--rv-blue)]">
                      {leverage}x
                    </span>
                  </div>
                  <Slider
                    aria-label="Leverage"
                    min={1}
                    max={50}
                    step={1}
                    value={leverage}
                    onValueChange={(v) =>
                      setLeverage(Array.isArray(v) ? (v[0] ?? 1) : v)
                    }
                    className="py-2 [&_[data-slot=slider-range]]:bg-[var(--rv-blue)] [&_[data-slot=slider-thumb]]:bg-[var(--rv-blue)] [&_[data-slot=slider-track]]:bg-[var(--rv-stroke)]"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--rv-ink-3)]">
                    <span>1x</span>
                    <span>10x</span>
                    <span>25x</span>
                    <span>50x</span>
                  </div>
                </div>
              )}

              {/* Quick TP / SL Presets from Signal */}
              <div className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-3 text-xs">
                <div className="mb-2 font-bold text-[var(--rv-ink-3)]">
                  Signal Target Presets
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="plain"
                    size="bare"
                    type="button"
                    onClick={() => setSelectedTp(signal.t1)}
                    className={`flex-col border p-1.5 text-center transition-colors ${
                      selectedTp === signal.t1
                        ? "border-[var(--rv-blue)] bg-[color-mix(in_srgb,var(--rv-blue)_10%,transparent)] text-[var(--rv-blue)]"
                        : "border-[var(--rv-stroke)] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                    } rounded-md`}
                  >
                    <div className="text-[10px] font-bold">TP 1</div>
                    <div className="font-mono text-[11px]">
                      {priceUsd(signal.t1)}
                    </div>
                  </Button>
                  <Button
                    variant="plain"
                    size="bare"
                    type="button"
                    onClick={() => setSelectedTp(signal.t2)}
                    className={`flex-col border p-1.5 text-center transition-colors ${
                      selectedTp === signal.t2
                        ? "border-[var(--rv-blue)] bg-[color-mix(in_srgb,var(--rv-blue)_10%,transparent)] text-[var(--rv-blue)]"
                        : "border-[var(--rv-stroke)] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                    } rounded-md`}
                  >
                    <div className="text-[10px] font-bold">TP 2</div>
                    <div className="font-mono text-[11px]">
                      {priceUsd(signal.t2)}
                    </div>
                  </Button>
                  <Button
                    variant="plain"
                    size="bare"
                    type="button"
                    onClick={() => setSelectedTp(signal.t3)}
                    className={`flex-col border p-1.5 text-center transition-colors ${
                      selectedTp === signal.t3
                        ? "border-[var(--rv-blue)] bg-[color-mix(in_srgb,var(--rv-blue)_10%,transparent)] text-[var(--rv-blue)]"
                        : "border-[var(--rv-stroke)] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                    } rounded-md`}
                  >
                    <div className="text-[10px] font-bold">TP 3</div>
                    <div className="font-mono text-[11px]">
                      {priceUsd(signal.t3)}
                    </div>
                  </Button>
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-[var(--rv-stroke)] pt-2">
                  <span className="text-[11px] text-[var(--rv-ink-3)]">
                    Stop Loss Preset:
                  </span>
                  <Button
                    variant="plain"
                    size="bare"
                    type="button"
                    onClick={() => setSelectedSl(signal.stopLoss)}
                    className={`border px-2 py-0.5 text-center font-mono text-xs transition-colors ${
                      selectedSl === signal.stopLoss
                        ? "border-[var(--rv-down)] bg-[color-mix(in_srgb,var(--rv-down)_10%,transparent)] text-[var(--rv-down)]"
                        : "border-[var(--rv-stroke)] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                    } rounded-md`}
                  >
                    SL ({priceUsd(signal.stopLoss)})
                  </Button>
                </div>
              </div>

              {/* Order Summary breakdown */}
              <div className="space-y-1 text-xs text-[var(--rv-ink-3)]">
                <div className="flex justify-between">
                  <span>Available Cash Balance:</span>
                  <span className="font-mono font-bold text-[var(--rv-ink)]">
                    ${cashBalance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Required Margin:</span>
                  <span className="font-mono font-bold text-[var(--rv-ink)]">
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
                <div className="rounded-md border border-[color-mix(in_srgb,var(--rv-down)_40%,transparent)] bg-[color-mix(in_srgb,var(--rv-down)_10%,transparent)] p-2 text-xs text-[var(--rv-down)]">
                  {orderError}
                </div>
              )}
              {orderSuccess && (
                <div className="rounded-md border border-[color-mix(in_srgb,var(--rv-blue)_40%,transparent)] bg-[color-mix(in_srgb,var(--rv-blue)_10%,transparent)] p-2 text-xs text-[var(--rv-blue)]">
                  {orderSuccess}{" "}
                  <Link
                    href="/portfolio"
                    className="inline-flex items-center gap-1 font-bold underline hover:text-[var(--rv-ink)]"
                  >
                    View in Portfolio
                    <ArrowIcon />
                  </Link>
                </div>
              )}

              {/* Submit Button */}
              <Button
                variant="plain"
                size="bare"
                type="submit"
                className={`w-full py-2.5 text-sm font-black tracking-wide uppercase transition-colors ${
                  orderType === "SPOT" || side === "LONG"
                    ? "bg-[var(--rv-up)] text-black hover:brightness-110"
                    : "bg-[var(--rv-down)] text-black hover:brightness-110"
                }`}
              >
                {orderType === "SPOT"
                  ? `Buy Spot ${signal.symbol}`
                  : `Place ${orderType} ${side} (${leverage}x)`}
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

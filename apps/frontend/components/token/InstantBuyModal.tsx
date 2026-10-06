"use client"

import { useState, useEffect, KeyboardEvent } from "react"
import type { UserTradeEntry } from "./SingleLineChart"

interface InstantBuyModalProps {
  mint: string
  symbol: string
  priceUsd?: number | null
  marketCapUsd?: number | null
  onTradeSuccess?: () => void
}

const SLIPPAGE_PRESETS = [0.5, 1, 3]

/**
 * Assumed liquidity as a fraction of market cap, used only to derive a
 * plausible-looking price-impact estimate for this simulated buy flow (there
 * is no real swap quote — see the "Simulated" labeling below). Typical
 * memecoin pool depth sits well under market cap; 8% is a reasonable,
 * deliberately simple stand-in, not a fetched number.
 */
const ASSUMED_LIQUIDITY_RATIO = 0.08

type Step = "amount" | "review" | "processing" | "success"

export function InstantBuyModal({
  mint,
  symbol,
  priceUsd,
  marketCapUsd,
  onTradeSuccess,
}: InstantBuyModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>("amount")
  const [mode, setMode] = useState<"USD" | "SOL">("USD")
  const [amount, setAmount] = useState<string>("50")
  const [slippagePct, setSlippagePct] = useState(1)
  const [ownedTrade, setOwnedTrade] = useState<UserTradeEntry | null>(null)

  const price = priceUsd && priceUsd > 0 ? priceUsd : 0.00168
  const solPrice = 148 // USD per SOL

  // Check if user already owns this token from previous purchases
  useEffect(() => {
    try {
      const raw = localStorage.getItem("clawdex_user_trades")
      if (raw) {
        const trades = JSON.parse(raw) as UserTradeEntry[]
        const match = trades.find((t) => t.mint === mint)
        // localStorage is browser-only — can't be read during SSR render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (match) setOwnedTrade(match)
      }
    } catch {
      // ignore
    }
  }, [mint, step])

  const numAmount = parseFloat(amount) || 0
  const usdValue = mode === "USD" ? numAmount : numAmount * solPrice
  const solValue = mode === "SOL" ? numAmount : numAmount / solPrice
  const estimatedTokens = price > 0 ? usdValue / price : 0

  // Rough constant-product-style approximation: trade size as a fraction of
  // one side of an assumed pool. Simulated — see ASSUMED_LIQUIDITY_RATIO.
  const assumedLiquidityUsd =
    (marketCapUsd ?? usdValue / ASSUMED_LIQUIDITY_RATIO) *
    ASSUMED_LIQUIDITY_RATIO
  const priceImpactPct =
    assumedLiquidityUsd > 0
      ? Math.min((usdValue / assumedLiquidityUsd) * 50, 35)
      : 0
  const minTokensReceived =
    estimatedTokens * (1 - slippagePct / 100 - priceImpactPct / 100)

  const openReview = () => {
    if (numAmount <= 0) return
    setStep("review")
  }

  const handleExecuteBuy = () => {
    setStep("processing")

    setTimeout(() => {
      try {
        const newTrade: UserTradeEntry = {
          mint,
          entryPrice: price,
          solAmount: solValue,
          tokenAmount: estimatedTokens,
          timestamp: Date.now(),
        }

        const existingRaw = localStorage.getItem("clawdex_user_trades")
        let trades: UserTradeEntry[] = []
        if (existingRaw) {
          trades = JSON.parse(existingRaw)
        }
        // Replace or add trade for this mint
        trades = trades.filter((t) => t.mint !== mint)
        trades.push(newTrade)
        localStorage.setItem("clawdex_user_trades", JSON.stringify(trades))

        setOwnedTrade(newTrade)
        setStep("success")
        if (onTradeSuccess) onTradeSuccess()

        setTimeout(() => {
          setStep("amount")
          setIsOpen(false)
        }, 1800)
      } catch {
        setStep("review")
      }
    }, 450)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      openReview()
    }
  }

  const close = () => {
    setIsOpen(false)
    setStep("amount")
  }

  return (
    <>
      {/* Bottom Sticky Action Button matching uploaded screenshot */}
      <div className="sticky bottom-4 z-30 w-full px-2">
        <button
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-none bg-[var(--brand)] px-6 py-4 text-base font-extrabold tracking-wide text-[var(--text-on-brand)] shadow-[0_10px_35px_rgba(22,140,255,0.35)] transition-all hover:bg-[var(--brand-dim)] active:scale-[0.99]"
        >
          {ownedTrade ? (
            <>
              <span>⚡ Buy More ${symbol}</span>
              <span className="font-mono text-xs font-medium opacity-85">
                (Holding {Math.round(ownedTrade.tokenAmount).toLocaleString()})
              </span>
            </>
          ) : (
            <>
              <span>Deposit to buy</span>
            </>
          )}
        </button>
      </div>

      {/* Instant Buy Modal / Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex animate-in items-end justify-center bg-black/80 p-4 backdrop-blur-md duration-200 fade-in sm:items-center">
          <div className="flex w-full max-w-md flex-col gap-5 rounded-none border border-white/15 bg-[#0e1017] p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl font-black text-white">
                  {step === "review" ||
                  step === "processing" ||
                  step === "success"
                    ? "Review order"
                    : `Buy ${symbol}`}
                </span>
                <span className="font-mono text-xs text-[var(--mut)]">
                  ${price < 0.01 ? price.toFixed(6) : price.toFixed(4)}
                </span>
              </div>
              <button
                onClick={close}
                className="flex size-8 items-center justify-center rounded-full bg-white/5 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {step === "amount" && (
              <>
                {/* Denomination Switcher */}
                <div className="flex rounded-none border border-white/10 bg-black/60 p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setMode("USD")}
                    className={`flex-1 rounded-none py-2 transition-all ${
                      mode === "USD"
                        ? "bg-[var(--brand)] font-black text-[var(--text-on-brand)] shadow-md"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    USD ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("SOL")}
                    className={`flex-1 rounded-none py-2 transition-all ${
                      mode === "SOL"
                        ? "bg-[var(--brand)] font-black text-[var(--text-on-brand)] shadow-md"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    SOL (◎)
                  </button>
                </div>

                {/* Amount Input */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-[var(--mut)]">
                    <span>Amount to Buy</span>
                    <span>
                      ≈{" "}
                      {mode === "USD"
                        ? `${solValue.toFixed(3)} SOL`
                        : `$${usdValue.toFixed(2)} USD`}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <span className="absolute left-4 font-mono text-lg font-bold text-white/50">
                      {mode === "USD" ? "$" : "◎"}
                    </span>
                    <input
                      type="number"
                      autoFocus
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="0.00"
                      className="w-full rounded-none border border-white/15 bg-black/50 py-3.5 pr-4 pl-10 font-mono text-xl font-bold text-white transition-all focus:border-[var(--brand)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Quick Chips */}
                <div className="flex items-center gap-2">
                  {mode === "USD"
                    ? ["10", "50", "100", "500"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAmount(v)}
                          className={`flex-1 rounded-none border py-1.5 font-mono text-xs font-bold transition-all ${
                            amount === v
                              ? "border-[var(--brand)] bg-[var(--brand-tint)] text-white"
                              : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                          }`}
                        >
                          ${v}
                        </button>
                      ))
                    : ["0.1", "0.5", "1", "5"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAmount(v)}
                          className={`flex-1 rounded-none border py-1.5 font-mono text-xs font-bold transition-all ${
                            amount === v
                              ? "border-[var(--brand)] bg-[var(--brand-tint)] text-white"
                              : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                          }`}
                        >
                          {v} SOL
                        </button>
                      ))}
                </div>

                {/* Slippage Tolerance */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--mut)]">Slippage tolerance</span>
                  <div className="flex gap-1.5">
                    {SLIPPAGE_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSlippagePct(p)}
                        className={`rounded-none border px-2 py-1 font-mono font-bold transition-all ${
                          slippagePct === p
                            ? "border-[var(--brand)] bg-[var(--brand-tint)] text-white"
                            : "border-white/10 text-white/60 hover:text-white"
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Token Estimation */}
                <div className="flex items-center justify-between rounded-none border border-white/5 bg-white/[0.02] p-3 font-mono text-xs">
                  <span className="text-[var(--mut)]">You Receive:</span>
                  <span className="font-bold text-[var(--score-healthy)]">
                    ≈ {Math.round(estimatedTokens).toLocaleString()} ${symbol}
                  </span>
                </div>

                <button
                  onClick={openReview}
                  disabled={numAmount <= 0}
                  className="w-full rounded-none bg-[var(--brand)] py-4 text-sm font-black tracking-wider text-[var(--text-on-brand)] uppercase shadow-xl transition-all hover:bg-[var(--brand-dim)] disabled:opacity-40"
                >
                  Review order
                </button>
              </>
            )}

            {(step === "review" ||
              step === "processing" ||
              step === "success") && (
              <>
                <div className="rounded-none border border-[var(--score-caution)]/30 bg-[var(--score-caution-tint)] px-3 py-2 text-[11px] font-semibold text-[var(--score-caution)]">
                  Simulated order — no wallet, no real swap, no funds move.
                  Numbers below are estimates for demo purposes only.
                </div>

                <div className="flex flex-col gap-2.5 rounded-none border border-white/10 bg-black/40 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--mut)]">You pay</span>
                    <span className="font-mono font-bold text-white">
                      {mode === "USD"
                        ? `$${usdValue.toFixed(2)}`
                        : `${solValue.toFixed(3)} SOL`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--mut)]">
                      You receive (est.)
                    </span>
                    <span className="font-mono font-bold text-white">
                      ≈ {Math.round(estimatedTokens).toLocaleString()} ${symbol}
                    </span>
                  </div>
                  <div className="h-px bg-white/10" />
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--mut)]">Price impact</span>
                    <span
                      className={`font-mono font-bold ${
                        priceImpactPct >= 10
                          ? "text-[var(--score-risk)]"
                          : priceImpactPct >= 3
                            ? "text-[var(--score-caution)]"
                            : "text-[var(--score-healthy)]"
                      }`}
                    >
                      {priceImpactPct < 0.1
                        ? "<0.1"
                        : priceImpactPct.toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--mut)]">
                      Slippage tolerance
                    </span>
                    <span className="font-mono font-bold text-white">
                      {slippagePct}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--mut)]">Minimum received</span>
                    <span className="font-mono font-bold text-white">
                      {Math.max(
                        0,
                        Math.round(minTokensReceived),
                      ).toLocaleString()}{" "}
                      ${symbol}
                    </span>
                  </div>
                </div>

                {step === "review" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep("amount")}
                      className="flex-1 rounded-none border border-white/15 py-3.5 text-xs font-bold tracking-wider text-white/70 uppercase transition-all hover:text-white"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleExecuteBuy}
                      className="flex-[2] rounded-none bg-[var(--brand)] py-3.5 text-sm font-black tracking-wider text-[var(--text-on-brand)] uppercase shadow-xl transition-all hover:bg-[var(--brand-dim)]"
                    >
                      Confirm & Buy
                    </button>
                  </div>
                )}

                {step === "processing" && (
                  <button
                    disabled
                    className="flex w-full items-center justify-center gap-2 rounded-none bg-[var(--brand)] py-4 text-sm font-black tracking-wider text-[var(--text-on-brand)] uppercase opacity-80"
                  >
                    <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Simulating transaction…
                  </button>
                )}

                {step === "success" && (
                  <button
                    disabled
                    className="w-full rounded-none bg-[var(--score-healthy)] py-4 text-sm font-black tracking-wider text-[var(--text-on-score)] uppercase"
                  >
                    ✓ Simulated buy recorded
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

"use client"

import { useState, useId } from "react"
import { shortAddr, usd } from "@/lib/format"

interface TradeWidgetProps {
  mint: string
  symbol: string
  name: string
  priceUsd?: number | null
  launchpad?: string | null
}

export function TradeWidget({ mint, symbol, priceUsd }: TradeWidgetProps) {
  const [tab, setTab] = useState<"buy" | "sell">("buy")
  // Simulated or connected wallet state
  const [walletConnected, setWalletConnected] = useState<boolean>(true)
  const [walletAddress, setWalletAddress] = useState<string>(
    "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  )
  const [solBalance, setSolBalance] = useState<number>(2.45) // Starting SOL balance
  const [tokenBalance, setTokenBalance] = useState<number>(150000) // Tokens owned

  // Buy State
  const [buyAmountSol, setBuyAmountSol] = useState<string>("0.5")
  // Sell State
  const [sellMode, setSellMode] = useState<"sol" | "tokens">("tokens")
  const [sellPercent, setSellPercent] = useState<number>(50)
  const [sellAmountInput, setSellAmountInput] = useState<string>("75000")

  const [txStatus, setTxStatus] = useState<string | null>(null)
  const [isTransacting, setIsTransacting] = useState<boolean>(false)

  const solPriceUsd = 145 // Benchmark SOL reference price
  const activeTokenPrice = priceUsd && priceUsd > 0 ? priceUsd : 0.00042
  const gasReserveSol = 0.005

  const buySolNum = parseFloat(buyAmountSol) || 0
  const estimatedTokensToBuy =
    buySolNum > 0 ? Math.round((buySolNum * solPriceUsd) / activeTokenPrice) : 0
  const insufficientSol = buySolNum + gasReserveSol > solBalance

  // Handle Percentage Sell click
  const handlePercentClick = (pct: number) => {
    setSellPercent(pct)
    const tokens = Math.round(tokenBalance * (pct / 100))
    if (sellMode === "tokens") {
      setSellAmountInput(tokens.toString())
    } else {
      const solVal = ((tokens * activeTokenPrice) / solPriceUsd).toFixed(3)
      setSellAmountInput(solVal)
    }
  }

  // Switch Sell mode (SOL vs Tokens)
  const handleToggleSellMode = (mode: "sol" | "tokens") => {
    setSellMode(mode)
    if (mode === "tokens") {
      const tokens = Math.round(tokenBalance * (sellPercent / 100))
      setSellAmountInput(tokens.toString())
    } else {
      const tokens = tokenBalance * (sellPercent / 100)
      const solVal = ((tokens * activeTokenPrice) / solPriceUsd).toFixed(3)
      setSellAmountInput(solVal)
    }
  }

  const handleBuy = async () => {
    if (!walletConnected) {
      setWalletConnected(true)
      return
    }
    if (insufficientSol) return

    setIsTransacting(true)
    setTxStatus("Sending transaction to Solana network…")

    setTimeout(() => {
      setSolBalance((prev) => Math.max(0, prev - buySolNum - gasReserveSol))
      setTokenBalance((prev) => prev + estimatedTokensToBuy)
      setIsTransacting(false)
      setTxStatus(
        `✓ Swapped ${buySolNum} SOL for ${estimatedTokensToBuy.toLocaleString()} ${symbol}!`,
      )
      setTimeout(() => setTxStatus(null), 5000)
    }, 1200)
  }

  const handleSell = async () => {
    if (!walletConnected) {
      setWalletConnected(true)
      return
    }

    const tokensToSell =
      sellMode === "tokens"
        ? parseFloat(sellAmountInput) || 0
        : Math.round(
            ((parseFloat(sellAmountInput) || 0) * solPriceUsd) /
              activeTokenPrice,
          )

    if (tokensToSell <= 0 || tokensToSell > tokenBalance) return

    setIsTransacting(true)
    setTxStatus("Executing swap…")

    const solGain = (tokensToSell * activeTokenPrice) / solPriceUsd

    setTimeout(() => {
      setTokenBalance((prev) => Math.max(0, prev - tokensToSell))
      setSolBalance((prev) => prev + solGain - gasReserveSol)
      setIsTransacting(false)
      setTxStatus(
        `✓ Sold ${tokensToSell.toLocaleString()} ${symbol} for ~${solGain.toFixed(3)} SOL!`,
      )
      setTimeout(() => setTxStatus(null), 5000)
    }, 1200)
  }

  const buyInputId = useId()
  const sellInputId = useId()

  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
      {/* Wallet Bar */}
      <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
          {walletConnected ? (
            <span className="font-mono text-[var(--txt)]">
              {shortAddr(walletAddress)}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">
              No wallet connected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {walletConnected ? (
            <div className="flex items-center gap-2">
              <span className="cdx-num font-bold text-emerald-400">
                {solBalance.toFixed(3)} SOL
              </span>
              <button
                type="button"
                onClick={() =>
                  setSolBalance((b) => Number((b + 1.0).toFixed(3)))
                }
                className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-white/10"
                title="Top-up demo balance"
              >
                +1 SOL
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setWalletConnected(true)}
              className="rounded bg-[var(--brand)] px-2.5 py-1 text-xs font-bold text-black"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Buy / Sell Tabs */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-none bg-[var(--surface-sunken)] p-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setTab("buy")}
          className={`rounded-none py-2 transition-all ${
            tab === "buy"
              ? "bg-emerald-500 font-extrabold text-black shadow-md"
              : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          Buy {symbol}
        </button>
        <button
          type="button"
          onClick={() => setTab("sell")}
          className={`rounded-none py-2 transition-all ${
            tab === "sell"
              ? "bg-rose-500 font-extrabold text-white shadow-md"
              : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          Sell {symbol}
        </button>
      </div>

      {/* BUY INTERFACE */}
      {tab === "buy" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
            <div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
              <label htmlFor={buyInputId}>Amount (SOL)</label>
              <span>Balance: {solBalance.toFixed(3)} SOL</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id={buyInputId}
                type="number"
                step="0.05"
                min="0"
                value={buyAmountSol}
                onChange={(e) => setBuyAmountSol(e.target.value)}
                className="w-full bg-transparent font-mono text-xl font-bold text-[var(--txt)] outline-none"
                placeholder="0.0"
              />
              <span className="text-sm font-bold text-[var(--brand)]">SOL</span>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="grid grid-cols-4 gap-1.5">
            {["0.1", "0.5", "1", "5"].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setBuyAmountSol(amt)}
                className={`rounded py-1 text-xs font-semibold transition-colors ${
                  buyAmountSol === amt
                    ? "border border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10"
                }`}
              >
                {amt} SOL
              </button>
            ))}
          </div>

          {/* Estimated Output */}
          <div className="flex items-center justify-between rounded bg-white/[0.02] px-2 py-1 text-xs">
            <span className="text-[var(--text-muted)]">You receive</span>
            <span className="font-mono font-bold text-white">
              ≈ {estimatedTokensToBuy.toLocaleString()} {symbol}
            </span>
          </div>

          {/* Balance Warning */}
          {insufficientSol && (
            <div className="rounded border border-rose-500/20 bg-rose-500/10 p-2 text-[11px] text-rose-400">
              ⚠️ Insufficient SOL: {solBalance.toFixed(3)} available. Need{" "}
              {(buySolNum + gasReserveSol).toFixed(3)} SOL (including 0.005 gas
              reserve).
            </div>
          )}

          {/* Action Button */}
          {!walletConnected ? (
            <button
              type="button"
              onClick={() => setWalletConnected(true)}
              className="w-full rounded-none bg-[var(--brand)] py-2.5 text-sm font-extrabold text-black shadow transition-all hover:brightness-110"
            >
              Connect or Create Solana Wallet
            </button>
          ) : (
            <button
              type="button"
              disabled={isTransacting || insufficientSol || buySolNum <= 0}
              onClick={handleBuy}
              className={`w-full rounded-none py-2.5 text-sm font-extrabold text-black shadow transition-all ${
                insufficientSol || buySolNum <= 0
                  ? "cursor-not-allowed bg-emerald-500/40 text-white/50"
                  : "cursor-pointer bg-emerald-400 hover:bg-emerald-300"
              }`}
            >
              {isTransacting ? "Swapping on Solana…" : `Buy ${symbol}`}
            </button>
          )}
        </div>
      )}

      {/* SELL INTERFACE (Phantom-Style) */}
      {tab === "sell" && (
        <div className="flex flex-col gap-3">
          {/* Phantom Mode Switcher: Sell X SOL vs Sell X Tokens */}
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="text-[var(--text-muted)]">Sell denomination:</span>
            <div className="inline-flex rounded-none border border-[var(--border)] bg-black/40 p-0.5">
              <button
                type="button"
                onClick={() => handleToggleSellMode("tokens")}
                className={`rounded px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  sellMode === "tokens"
                    ? "bg-[var(--brand)] text-black"
                    : "text-[var(--text-muted)]"
                }`}
              >
                Tokens
              </button>
              <button
                type="button"
                onClick={() => handleToggleSellMode("sol")}
                className={`rounded px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  sellMode === "sol"
                    ? "bg-[var(--brand)] text-black"
                    : "text-[var(--text-muted)]"
                }`}
              >
                SOL
              </button>
            </div>
          </div>

          <div className="rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
            <div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
              <label htmlFor={sellInputId}>
                Amount ({sellMode === "tokens" ? symbol : "SOL"})
              </label>
              <span>
                Owned: {tokenBalance.toLocaleString()} {symbol}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id={sellInputId}
                type="number"
                value={sellAmountInput}
                onChange={(e) => setSellAmountInput(e.target.value)}
                className="w-full bg-transparent font-mono text-xl font-bold text-[var(--txt)] outline-none"
                placeholder="0"
              />
              <span className="text-sm font-bold text-rose-400">
                {sellMode === "tokens" ? symbol : "SOL"}
              </span>
            </div>
          </div>

          {/* Phantom Percentage Buttons: 25%, 50%, 75%, 100% */}
          <div className="grid grid-cols-4 gap-1.5">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handlePercentClick(pct)}
                className={`rounded py-1 text-xs font-semibold transition-colors ${
                  sellPercent === pct
                    ? "border border-rose-500 bg-rose-500/20 font-bold text-rose-300"
                    : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* Estimated Return */}
          <div className="flex items-center justify-between rounded bg-white/[0.02] px-2 py-1 text-xs">
            <span className="text-[var(--text-muted)]">Estimated received</span>
            <span className="font-mono font-bold text-emerald-400">
              ≈{" "}
              {(
                ((parseFloat(sellAmountInput) || 0) *
                  (sellMode === "tokens" ? activeTokenPrice : 1)) /
                solPriceUsd
              ).toFixed(3)}{" "}
              SOL (
              {usd(
                (parseFloat(sellAmountInput) || 0) *
                  (sellMode === "tokens" ? activeTokenPrice : solPriceUsd),
              )}
              )
            </span>
          </div>

          {tokenBalance <= 0 ? (
            <div className="py-2 text-center text-[11px] text-[var(--text-muted)]">
              You do not currently hold any {symbol} in this wallet.
            </div>
          ) : (
            <button
              type="button"
              disabled={isTransacting || parseFloat(sellAmountInput) <= 0}
              onClick={handleSell}
              className="w-full cursor-pointer rounded-none bg-rose-500 py-2.5 text-sm font-extrabold text-white shadow transition-all hover:bg-rose-400"
            >
              {isTransacting ? "Swapping on Solana…" : `Sell ${symbol}`}
            </button>
          )}
        </div>
      )}

      {/* Transaction Status Toast */}
      {txStatus && (
        <div className="mt-3 flex items-center justify-between rounded-none border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs font-semibold text-emerald-300">
          <span>{txStatus}</span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            gas: 0.005 SOL
          </span>
        </div>
      )}
    </div>
  )
}

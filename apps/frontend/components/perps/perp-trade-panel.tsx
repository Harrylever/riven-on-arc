"use client"

import { useEffect, useRef, useState } from "react"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { usePortfolio, type Collateral } from "@/hooks/use-portfolio"
import type { PerpMarket } from "@/lib/hyperliquid"
import { priceUsd } from "@/lib/format"
import {
  buildTradeSetup,
  validateSetup,
  type PerpSide,
} from "@/lib/perp-trade-setup"

const sideColor = (s: PerpSide) => (s === "LONG" ? "var(--up)" : "var(--down)")

/** Order form with one-click "Trade setup" (entry, SL, TP1-3) and a confirm step. */
export function PerpTradePanel({
  market,
  signal,
}: {
  market: PerpMarket
  signal: PerpSignal | null
}) {
  const { placeOrder, cashBalance, usdtBalance, accountLabel } = usePortfolio()
  const [collateral, setCollateral] = useState<Collateral>("USDC")
  const balance = collateral === "USDT" ? usdtBalance : cashBalance

  const [side, setSide] = useState<PerpSide>(signal?.bias ?? "LONG")
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("MARKET")
  const [usdSize, setUsdSize] = useState("500")
  const [leverage, setLeverage] = useState(
    Math.min(10, Math.max(1, market.maxLeverage)),
  )
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // User edits to the suggested levels; a blank TP drops that target
  const [edits, setEdits] = useState<Record<string, string>>({})
  const resetEdits = () => setEdits({})

  const suggested = buildTradeSetup(side, market.markPrice, orderType, signal)
  const num = (key: string, fallback: number) =>
    edits[key] === undefined ? fallback : Number(edits[key])
  const setup = {
    side,
    entry:
      orderType === "LIMIT" ? num("entry", suggested.entry) : suggested.entry,
    stopLoss: num("sl", suggested.stopLoss),
    tps: [0, 1, 2]
      .filter((i) => edits[`tp${i}`] !== "")
      .map((i) => num(`tp${i}`, suggested.tps[i])),
  }
  const notional = Number(usdSize) || 0
  const margin = notional / leverage
  const fee = notional * 0.00045
  const setupError = validateSetup(setup)

  const submit = () => {
    setConfirming(false)
    setError(null)
    if (setupError) return setError(setupError)
    if (notional <= 0) return setError("Enter an order size.")
    if (margin + fee > balance) {
      return setError(
        `Insufficient ${collateral} balance ($${balance.toFixed(2)}). Lower the size, raise leverage or switch to the other balance.`,
      )
    }

    try {
      placeOrder({
        market: `${market.symbol}-PERP`,
        type: orderType,
        side,
        size: Number((notional / setup.entry).toFixed(market.szDecimals)),
        price: setup.entry,
        tp: setup.tps[0],
        tps: setup.tps,
        sl: setup.stopLoss,
        leverage,
        exchange: "HYPERLIQUID",
        collateral,
      })
      setSuccess(
        `${orderType === "LIMIT" ? "Limit order set" : "Position opened"}: ${side} ${market.symbol} with SL and TP1–3.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order.")
    }
  }

  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="border border-[var(--border)] bg-[var(--surface-sunken)] p-2">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-[var(--text-muted)] uppercase">
          <span>Trade from · {accountLabel}</span>
          <span>Paper account</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Collateral">
          {(["USDC", "USDT"] as const).map((c) => {
            const on = collateral === c
            const amt = c === "USDT" ? usdtBalance : cashBalance
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCollateral(c)}
                className="flex items-center justify-between border px-2 py-1.5"
                style={{
                  borderColor: on ? "var(--brand)" : "var(--border)",
                  background: on ? "rgba(30,123,255,0.12)" : "transparent",
                }}
              >
                <span className="font-bold" style={{ color: on ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {c}
                </span>
                <span className="font-mono">${amt.toFixed(2)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {(["LONG", "SHORT"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s)
              resetEdits()
            }}
            className="border py-2 font-extrabold"
            style={{
              borderColor: side === s ? sideColor(s) : "var(--border)",
              color: side === s ? sideColor(s) : "var(--text-muted)",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-4 border-b border-[var(--border)]">
        {(["MARKET", "LIMIT"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setOrderType(t)
              resetEdits()
            }}
            className={`pb-1.5 font-bold ${
              orderType === t
                ? "border-b-2 border-[var(--brand)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {t === "MARKET" ? "Market" : "Limit"}
          </button>
        ))}
      </div>

      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase">
        Size (USD)
        <input
          type="number"
          min={0}
          value={usdSize}
          onChange={(e) => setUsdSize(e.target.value)}
          className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 py-1.5 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
        />
      </label>
      <div className="flex gap-1">
        {[0.25, 0.5, 0.75, 1].map((pct) => (
          <button
            key={pct}
            onClick={() =>
              setUsdSize(
                // Margin (notional/lev) plus the 0.045% fee must fit in pct of the balance.
                String(Math.floor((balance * pct) / (1 / leverage + 0.00045))),
              )
            }
            className="flex-1 border border-[var(--border)] py-1 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {pct * 100}%
          </button>
        ))}
      </div>

      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase">
        Leverage {leverage}x (max {market.maxLeverage}x)
        <input
          type="range"
          min={1}
          max={market.maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </label>

      <div className="space-y-1.5 border border-[var(--border)] bg-[var(--surface-sunken)] p-2.5">
        {orderType === "LIMIT" ? (
          <LevelInput
            label="Limit entry"
            value={edits.entry ?? String(suggested.entry)}
            onChange={(v) => setEdits((e) => ({ ...e, entry: v }))}
            entry={setup.entry}
          />
        ) : (
          <div className="flex items-center justify-between font-mono">
            <span className="font-sans text-[var(--text-muted)]">
              Entry (mark)
            </span>
            <span className="font-bold">{priceUsd(setup.entry)}</span>
          </div>
        )}
        <LevelInput
          label="Stop loss"
          color="var(--down)"
          value={edits.sl ?? String(suggested.stopLoss)}
          onChange={(v) => setEdits((e) => ({ ...e, sl: v }))}
          entry={setup.entry}
        />
        {[0, 1, 2].map((i) => (
          <LevelInput
            key={i}
            label={`TP${i + 1}`}
            color="var(--up)"
            value={edits[`tp${i}`] ?? String(suggested.tps[i])}
            onChange={(v) => setEdits((e) => ({ ...e, [`tp${i}`]: v }))}
            entry={setup.entry}
            optional={i > 0}
          />
        ))}
        <div className="flex items-start justify-between gap-2 border-t border-[var(--border)] pt-1.5 text-[10px] text-[var(--text-muted)]">
          <span>
            {signal && signal.bias === side
              ? `Suggested from the ${signal.exchange} signal (conviction ${signal.confidence}/10).`
              : "Suggested: SL at 1.5% risk, TPs at 1R / 2R / 3R."}{" "}
            Margin ${margin.toFixed(2)} · fee ${fee.toFixed(2)}
          </span>
          {Object.keys(edits).length > 0 && (
            <button
              onClick={resetEdits}
              className="shrink-0 font-bold text-[var(--brand)] hover:underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="border border-red-500/30 bg-red-500/10 p-2 text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="border border-[var(--up)]/30 bg-[var(--up)]/10 p-2 text-[var(--up)]">
          {success}
        </div>
      )}

      <button
        onClick={() => {
          setError(null)
          setSuccess(null)
          if (setupError) return setError(setupError)
          if (notional <= 0) return setError("Enter an order size.")
          setConfirming(true)
        }}
        className="w-full py-2.5 font-extrabold tracking-wider text-black uppercase"
        style={{ background: sideColor(side) }}
      >
        Trade setup · {orderType === "LIMIT" ? "Limit" : "Market"} {side} {market.symbol}
      </button>
      <p className="text-center text-[10px] text-[var(--text-muted)]">
        One click sets entry, stop loss and TP1–3 together. You confirm before anything is placed.
      </p>

      {confirming && (
        <ConfirmSetup
          side={side}
          orderType={orderType}
          symbol={market.symbol}
          notional={notional}
          leverage={leverage}
          margin={margin}
          fee={fee}
          collateral={collateral}
          setup={setup}
          onCancel={() => setConfirming(false)}
          onConfirm={submit}
        />
      )}
    </div>
  )
}

/**
 * Second confirmation layer for the one-click setup: every level with its % move
 * and the $ result if it's hit, plus liquidation and risk:reward.
 */
function ConfirmSetup({
  side,
  orderType,
  symbol,
  notional,
  leverage,
  margin,
  fee,
  collateral,
  setup,
  onCancel,
  onConfirm,
}: {
  side: PerpSide
  orderType: "LIMIT" | "MARKET"
  symbol: string
  notional: number
  leverage: number
  margin: number
  fee: number
  collateral: Collateral
  setup: { entry: number; stopLoss: number; tps: number[] }
  onCancel: () => void
  onConfirm: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  const dir = side === "LONG" ? 1 : -1
  const pnlAt = (price: number) => notional * dir * ((price - setup.entry) / setup.entry)
  const move = (price: number) => ((price - setup.entry) / setup.entry) * 100
  const liq = side === "LONG" ? setup.entry * (1 - (1 / leverage) * 0.9) : setup.entry * (1 + (1 / leverage) * 0.9)
  const risk = Math.abs(pnlAt(setup.stopLoss))
  const rr = setup.tps.length ? Math.abs(pnlAt(setup.tps[setup.tps.length - 1]!)) / Math.max(risk, 1e-9) : 0
  const rows: Array<[string, number, string]> = [
    ["Entry", setup.entry, "var(--text-primary)"],
    ["Stop loss", setup.stopLoss, "var(--down)"],
    ...setup.tps.map((tp, i) => [`TP${i + 1}`, tp, "var(--up)"] as [string, number, string]),
  ]
  const stopBeyondLiq = side === "LONG" ? setup.stopLoss <= liq : setup.stopLoss >= liq
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      aria-labelledby="confirm-setup-title"
      className="m-auto w-[min(440px,calc(100vw-24px))] border border-[var(--brand)] bg-[#05080e] p-0 text-[var(--text-primary)] backdrop:bg-black/75"
    >
      <div className="space-y-3 p-4 text-xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.14em] text-[var(--brand-bright)] uppercase">Confirm trade setup</div>
          <h2 id="confirm-setup-title" className="mt-1 text-lg font-extrabold">
            Are you sure you want to set up this trade?
          </h2>
          <p className="mt-1 text-[var(--text-muted)]">
            <b style={{ color: sideColor(side) }}>
              {orderType} {side} {symbol}
            </b>{" "}
            · ${notional.toFixed(2)} at {leverage}x · margin ${margin.toFixed(2)} {collateral} · fee ${fee.toFixed(2)}
          </p>
        </div>
        <table className="w-full font-mono">
          <thead>
            <tr className="text-left text-[10px] text-[var(--text-muted)] uppercase">
              <th className="py-1 font-normal">Level</th>
              <th className="py-1 text-right font-normal">Price</th>
              <th className="py-1 text-right font-normal">Move</th>
              <th className="py-1 text-right font-normal">If hit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, price, color]) => {
              const pnl = label === "Entry" ? 0 : pnlAt(price)
              return (
                <tr key={label} className="border-t border-[var(--border)]">
                  <td className="py-1.5 font-sans font-bold" style={{ color }}>
                    {label}
                  </td>
                  <td className="py-1.5 text-right">{priceUsd(price)}</td>
                  <td className="py-1.5 text-right text-[var(--text-muted)]">
                    {label === "Entry" ? "—" : `${move(price) >= 0 ? "+" : ""}${move(price).toFixed(2)}%`}
                  </td>
                  <td className="py-1.5 text-right" style={{ color: pnl > 0 ? "var(--up)" : pnl < 0 ? "var(--down)" : undefined }}>
                    {label === "Entry" ? "—" : `${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-2 font-mono">
          <div>
            <div className="font-sans text-[10px] text-[var(--text-muted)] uppercase">Est. liquidation</div>
            <div className="font-bold text-[var(--down)]">{priceUsd(liq)}</div>
          </div>
          <div>
            <div className="font-sans text-[10px] text-[var(--text-muted)] uppercase">Risk : reward</div>
            <div className="font-bold">1 : {rr.toFixed(2)}</div>
          </div>
        </div>
        {stopBeyondLiq && (
          <div className="border border-red-500/40 bg-red-500/10 p-2 text-red-300">
            Your stop loss is past the liquidation price — you&apos;d be liquidated before it triggers. Lower the leverage.
          </div>
        )}
        <p className="text-[10px] text-[var(--text-muted)]">
          Paper trade on Riven&apos;s practice account — nothing is sent to an exchange. Not financial advice.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-[var(--border)] py-2.5 font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            No, go back
          </button>
          <button type="button" onClick={onConfirm} className="py-2.5 font-extrabold text-black" style={{ background: sideColor(side) }}>
            Yes, set it up
          </button>
        </div>
      </div>
    </dialog>
  )
}

function LevelInput({
  label,
  value,
  onChange,
  entry,
  color,
  optional,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  entry: number
  color?: string
  optional?: boolean
}) {
  const n = Number(value)
  const pct =
    value !== "" && Number.isFinite(n) && entry > 0
      ? ((n - entry) / entry) * 100
      : null
  return (
    <label className="flex items-center gap-2">
      <span
        className="w-20 shrink-0 font-bold"
        style={{ color: color ?? "var(--text-muted)" }}
      >
        {label}
      </span>
      <input
        type="number"
        min={0}
        step="any"
        value={value}
        placeholder={optional ? "off" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
      />
      <span className="w-14 shrink-0 text-right font-mono text-[10px] text-[var(--text-muted)]">
        {pct === null ? "" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
      </span>
    </label>
  )
}

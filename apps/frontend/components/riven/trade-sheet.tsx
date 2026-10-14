"use client"

import { useEffect, useState } from "react"
import type { ArcBand } from "@riven/shared"
import type { TxRequest, useArcWallet } from "@/hooks/use-arc-wallet"
import { BAND_META, compact } from "@/lib/riven-format"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { DIALOG, DIALOG_TITLE } from "./card-style"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { RV_CHECK } from "@/components/riven/card-style"
import { RV_INPUT } from "@/components/riven/card-style"
import { Card } from "@/components/ui/card"

type Wallet = ReturnType<typeof useArcWallet>

export interface TradeToken {
  address: string
  symbol: string
  score: number | null
  band: ArcBand
  fake: boolean
  fakeReasons: string[]
  copies: number
}

interface Quote {
  amountIn: string
  amountOut: string
  minOut: string
  warnings?: string[]
  priceImpactPct?: number | null
  roundTripLossPct?: number | null
  insufficient: boolean
  approvals: TxRequest[]
  swap: TxRequest
  error?: string
}

type Step = {
  label: string
  state: "waiting" | "signing" | "done" | "failed"
  hash?: string
}

const EXPLORER = "https://explorer.arc.io/tx/"

/**
 * Buy or sell an Arc token through Uniswap v4 from the user's own wallet.
 * The server only quotes and prepares unsigned transactions; the wallet signs.
 */
export function TradeSheet({
  token,
  wallet,
  initialSide = "buy",
  initialAmount = "",
  onClose,
  onDone,
}: {
  token: TradeToken
  wallet: Wallet
  initialSide?: "buy" | "sell"
  /** Prefill, e.g. "10" for a 10 USDC flash buy. The user still reviews and signs. */
  initialAmount?: string
  onClose: () => void
  onDone?: () => void
}) {
  const [side, setSide] = useState<"buy" | "sell">(initialSide)
  const [amount, setAmount] = useState(initialAmount)
  const [slippage, setSlippage] = useState(3)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [riskAck, setRiskAck] = useState(false)
  const [warnAck, setWarnAck] = useState(false)
  const risky = token.fake || token.band === "risk" || token.copies > 0
  const running = steps?.some((s) => s.state === "signing") ?? false

  // Live quote, debounced, whenever the inputs change.
  useEffect(() => {
    setQuote(null)
    setWarnAck(false)
    const n = Number(amount)
    if (!wallet.address || !Number.isFinite(n) || n <= 0) return
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/arc/trade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: token.address,
            side,
            amount,
            wallet: wallet.address,
            slippageBps: slippage * 100,
          }),
          signal: ctrl.signal,
        })
        setQuote((await res.json()) as Quote)
      } catch {
        // aborted or offline: keep the form usable
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [amount, side, slippage, token.address, wallet.address])

  const execute = async () => {
    if (!quote || quote.error) return
    const all = [...quote.approvals, quote.swap]
    setSteps(all.map((t) => ({ label: t.label, state: "waiting" })))
    for (let i = 0; i < all.length; i++) {
      setSteps((s) =>
        s!.map((x, j) => (j === i ? { ...x, state: "signing" } : x)),
      )
      try {
        const hash = await wallet.send(all[i]!)
        setSteps((s) =>
          s!.map((x, j) => (j === i ? { ...x, state: "done", hash } : x)),
        )
      } catch (e) {
        setSteps((s) =>
          s!.map((x, j) =>
            j === i
              ? {
                  ...x,
                  state: "failed",
                  label: `${x.label} — ${(e as Error).message.split("\n")[0]}`,
                }
              : x,
          ),
        )
        return
      }
    }
    onDone?.()
  }

  const unit = side === "buy" ? "USDC" : token.symbol
  const outUnit = side === "buy" ? token.symbol : "USDC"
  const m = BAND_META[token.band]
  const needsWarnAck = (quote?.warnings?.length ?? 0) > 0
  const blocked =
    (side === "buy" && risky && !riskAck) || (needsWarnAck && !warnAck)

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !running && onClose()}
      disablePointerDismissal={running}
    >
      <DialogContent
        showCloseButton={false}
        className={`${DIALOG} w-[min(440px,calc(100vw-24px))]`}
      >
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <DialogTitle className={DIALOG_TITLE}>
              {side === "buy" ? "Buy" : "Sell"} ${token.symbol}
            </DialogTitle>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={running}
                  aria-label="Close"
                  className="text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                />
              }
            >
              ✕
            </DialogClose>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-1">
            {(["buy", "sell"] as const).map((s) => (
              <Button
                variant="plain"
                size="bare"
                key={s}
                type="button"
                onClick={() => setSide(s)}
                disabled={running}
                className="rounded-md py-2 text-[14px] font-bold capitalize"
                style={{
                  background:
                    side === s
                      ? s === "buy"
                        ? "var(--rv-up)"
                        : "var(--rv-down)"
                      : "transparent",
                  color: side === s ? "#000" : "var(--rv-ink-2)",
                }}
              >
                {s}
              </Button>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-wide text-[var(--rv-ink-3)] uppercase">
              You pay ({unit})
            </span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder="0.00"
              disabled={running}
              className={`${RV_INPUT} h-12 px-3 text-[18px]`}
            />
          </label>

          <div className="flex items-center gap-2 text-[12px] text-[var(--rv-ink-2)]">
            Max slippage
            {[1, 3, 5, 10].map((v) => (
              <Button
                variant="plain"
                size="bare"
                key={v}
                type="button"
                onClick={() => setSlippage(v)}
                className="rv-num rounded px-2 py-0.5"
                style={{
                  background:
                    slippage === v
                      ? "var(--rv-blue)"
                      : "rgba(255,255,255,0.05)",
                  color: slippage === v ? "#fff" : "var(--rv-ink-2)",
                }}
              >
                {v}%
              </Button>
            ))}
          </div>

          <Card variant="riven" className="rv-num px-3 py-2.5 text-[13px]">
            {!wallet.address ? (
              <span className="text-[var(--rv-ink-2)]">
                Connect your wallet to get a quote.
              </span>
            ) : loading ? (
              <span className="text-[var(--rv-ink-3)]">
                Getting a quote from Uniswap…
              </span>
            ) : quote?.error ? (
              <span className="text-[var(--rv-risk)]">{quote.error}</span>
            ) : quote ? (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-[var(--rv-ink-3)]">You get about</span>
                  <span className="font-semibold">
                    {compact(Number(quote.amountOut))} {outUnit}
                  </span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--rv-ink-3)]">
                    Minimum after {slippage}% slippage
                  </span>
                  <span>
                    {compact(Number(quote.minOut))} {outUnit}
                  </span>
                </div>
                {typeof quote.priceImpactPct === "number" && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[var(--rv-ink-3)]">
                      Estimated price impact
                    </span>
                    <span>
                      {quote.priceImpactPct < 0.1
                        ? "<0.1"
                        : quote.priceImpactPct.toFixed(1)}
                      %
                    </span>
                  </div>
                )}
                {quote.approvals.length > 0 && (
                  <div className="text-[11px] text-[var(--rv-ink-3)]">
                    First trade of this token: {quote.approvals.length} one-time
                    approval{quote.approvals.length > 1 ? "s" : ""} first.
                  </div>
                )}
                {quote.insufficient && (
                  <div className="text-[12px] text-[var(--rv-risk)]">
                    Not enough {unit} in your wallet.
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[var(--rv-ink-3)]">Enter an amount</span>
            )}
          </Card>

          {needsWarnAck && (
            <label className="flex gap-2.5 rounded-lg border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.06)] p-3 text-[12px] leading-snug">
              <Checkbox
                checked={warnAck}
                onCheckedChange={(v) => setWarnAck(v === true)}
                className={`${RV_CHECK} mt-0.5 data-checked:border-[color:var(--rv-caution)] data-checked:bg-[var(--rv-caution)] data-checked:text-black`}
              />
              <span>
                {quote!.warnings!.map((w) => (
                  <span key={w} className="block">
                    {w}
                  </span>
                ))}
                <b>I understand and want to continue.</b>
              </span>
            </label>
          )}

          {side === "buy" && risky && (
            <label className="flex gap-2.5 rounded-lg border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.06)] p-3 text-[12px] leading-snug">
              <Checkbox
                checked={riskAck}
                onCheckedChange={(v) => setRiskAck(v === true)}
                className={`${RV_CHECK} mt-0.5 data-checked:border-[color:var(--rv-risk)] data-checked:bg-[var(--rv-risk)] data-checked:text-black`}
              />
              <span>
                <b style={{ color: m.color }}>Anti-rug warning.</b>{" "}
                {token.fake
                  ? `Riven flagged this token: ${token.fakeReasons[0]}.`
                  : token.band === "risk"
                    ? `Riven scores it ${token.score?.toFixed(1)}/10 — risky.`
                    : ""}{" "}
                {token.copies > 0
                  ? `${token.copies + 1} tokens use this ticker — make sure it's the right contract. `
                  : ""}
                I understand I could lose this money.
              </span>
            </label>
          )}

          {steps ? (
            <ol className="flex flex-col gap-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="rv-num w-5 text-center font-bold"
                    style={{
                      color:
                        s.state === "done"
                          ? "var(--rv-up)"
                          : s.state === "failed"
                            ? "var(--rv-down)"
                            : s.state === "signing"
                              ? "var(--rv-ice)"
                              : "var(--rv-ink-3)",
                    }}
                  >
                    {s.state === "done"
                      ? "✓"
                      : s.state === "failed"
                        ? "✕"
                        : s.state === "signing"
                          ? "…"
                          : i + 1}
                  </span>
                  <span className="flex-1">
                    {s.state === "signing"
                      ? `${s.label} — confirm in your wallet`
                      : s.label}
                  </span>
                  {s.hash && (
                    <a
                      href={EXPLORER + s.hash}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-[var(--rv-ice)] hover:underline"
                    >
                      tx ↗
                    </a>
                  )}
                </li>
              ))}
            </ol>
          ) : null}

          {!wallet.address ? (
            <Button
              variant="plain"
              size="bare"
              type="button"
              onClick={() => void wallet.connect()}
              className="h-12 rounded-lg bg-[var(--rv-blue)] text-[15px] font-bold text-[var(--rv-on-blue)]"
            >
              Connect wallet
            </Button>
          ) : (
            <Button
              variant="plain"
              size="bare"
              type="button"
              onClick={() => void execute()}
              disabled={
                !quote ||
                !!quote.error ||
                quote.insufficient ||
                blocked ||
                running ||
                steps?.every((s) => s.state === "done")
              }
              className="h-12 rounded-lg text-[15px] font-bold text-black disabled:opacity-40"
              style={{
                background: side === "buy" ? "var(--rv-up)" : "var(--rv-down)",
              }}
            >
              {steps?.every((s) => s.state === "done")
                ? "Done"
                : running
                  ? "Waiting for your wallet…"
                  : `${side === "buy" ? "Buy" : "Sell"} $${token.symbol}`}
            </Button>
          )}
          <p className="text-center text-[11px] text-[var(--rv-ink-3)]">
            Routed through Uniswap v4 on Arc. You sign every transaction in your
            own wallet — Riven never holds your funds.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

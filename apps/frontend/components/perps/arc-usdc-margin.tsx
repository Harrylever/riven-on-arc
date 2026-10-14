"use client"

import { useEffect, useState } from "react"
import { useArcWallet } from "@/hooks/use-arc-wallet"
import { usePortfolio } from "@/hooks/use-portfolio"
import { Button } from "@/components/ui/button"

const ARC_RPC = "https://rpc.mainnet.arc.io"
const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
const START = 10_000

/** Native USDC on Arc (it's the gas token; 18 decimals natively). Read-only. */
async function arcUsdc(address: string): Promise<number | null> {
  try {
    const res = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    })
    const j = (await res.json()) as { result?: string }
    if (!j.result) return null
    return Number(BigInt(j.result) / BigInt(1e12)) / 1e6 // 18 → 6 decimals, then to dollars
  } catch {
    return null
  }
}

function Balance({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 py-1">
      <span className="text-[10.5px] font-bold tracking-wide text-[var(--rv-ink-3)] uppercase">
        {label}
      </span>
      <span className="rv-num text-[13px] font-semibold text-[var(--rv-ink)]">
        {usd(value)}
      </span>
    </span>
  )
}

/**
 * The paper account's margin. Everyone starts with a practice balance and needs no wallet.
 * Connecting an Arc wallet is optional: it only offers to set the practice USDC to what the
 * wallet really holds (never when that is zero, which would empty the account). Reset puts
 * the account back to the starting balances. Nothing here moves real funds.
 */
export function ArcUsdcMargin() {
  const wallet = useArcWallet()
  const { cashBalance, usdtBalance, deposit, withdraw, resetPortfolio } =
    usePortfolio()
  // The balance is stored with the address it was read for, so switching or disconnecting
  // wallets never shows a stale number (and no state is set synchronously in the effect).
  const [read, setRead] = useState<{
    address: string
    value: number | null
  } | null>(null)
  const bal =
    wallet.address && read?.address === wallet.address ? read.value : null
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  // On phones the card starts as a one-line summary so the markets and calls stay near the top.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const address = wallet.address
    if (!address) return
    let cancelled = false
    void arcUsdc(address).then((value) => {
      if (!cancelled) setRead({ address, value })
    })
    return () => {
      cancelled = true
    }
  }, [wallet.address])

  const matchWallet = () => {
    // A wallet with no USDC must never zero the practice balance.
    if (bal === null || bal <= 0) return
    const delta = Math.round((bal - cashBalance) * 100) / 100
    if (delta > 0) deposit(delta, "USDC")
    else if (delta < 0) withdraw(-delta, "USDC")
    setNotice(`Practice USDC set to ${usd(bal)}.`)
  }

  const reset = () => {
    resetPortfolio()
    setConfirmingReset(false)
    setNotice(
      `Practice account reset to ${usd(START)} USDC and ${usd(START)} USDT.`,
    )
  }

  const blurb = !wallet.address
    ? `You start with ${usd(START)} of practice USDC and ${usd(START)} of practice USDT. No wallet needed. Optionally, connect an Arc wallet to practise with the amount you really hold.`
    : bal === null
      ? "Reading your Arc USDC…"
      : bal > 0
        ? `Your wallet holds ${usd(bal)} USDC on Arc. You can set your practice USDC to match it. Nothing leaves your wallet.`
        : "Your wallet holds no USDC on Arc, so you keep your practice balance."

  return (
    <section
      className="rv-card p-4 sm:p-5"
      aria-labelledby="practice-margin-title"
    >
      <div className="flex items-start gap-3">
        <div
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[#2775ca] text-[13px] font-extrabold text-white"
          aria-hidden
        >
          $
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="practice-margin-title"
            className="text-[15px] font-semibold text-[var(--rv-ink)]"
          >
            Your practice margin
          </h2>
          <p
            className={`mt-0.5 text-[12.5px] leading-snug text-[var(--rv-ink-2)] ${expanded ? "" : "hidden sm:block"}`}
          >
            {blurb}
          </p>
          <p className="rv-num mt-0.5 text-[12.5px] text-[var(--rv-ink-2)] sm:hidden">
            {usd(cashBalance)} USDC · {usd(usdtBalance)} USDT
          </p>
        </div>
        <Button
          variant="rivenGhost"
          size="rv"
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="practice-margin-body"
          className="h-11 shrink-0 px-3 text-[12px] sm:hidden"
        >
          {expanded ? "Hide" : "Manage"}
        </Button>
      </div>

      <div
        id="practice-margin-body"
        className={expanded ? "" : "hidden sm:block"}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Balance label="USDC" value={cashBalance} />
          <Balance label="USDT" value={usdtBalance} />
        </div>

        {confirmingReset ? (
          <div
            role="alertdialog"
            aria-label="Confirm reset"
            className="mt-3 rounded-[var(--rv-radius)] border border-[var(--rv-caution)]/40 bg-[var(--rv-caution)]/10 p-3"
          >
            <p className="text-[13px] leading-snug text-[var(--rv-ink)]">
              Reset to {usd(START)} USDC and {usd(START)} USDT? This also closes
              any open positions, cancels open orders and clears your trade
              history. It can&apos;t be undone.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="riven"
                size="rv"
                type="button"
                onClick={reset}
                className="h-11 px-4 text-[13px] sm:h-9"
              >
                Reset practice account
              </Button>
              <Button
                variant="rivenGhost"
                size="rv"
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="h-11 px-4 text-[13px] sm:h-9"
              >
                Keep my account
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {!wallet.address ? (
              <Button
                variant="riven"
                size="rv"
                type="button"
                onClick={() => void wallet.connect()}
                disabled={!wallet.hasWallet}
                className="h-11 px-4 text-[13px] sm:h-9"
              >
                {wallet.hasWallet
                  ? "Connect Arc wallet (optional)"
                  : "Install a wallet (optional)"}
              </Button>
            ) : bal !== null && bal > 0 ? (
              <Button
                variant="riven"
                size="rv"
                type="button"
                onClick={matchWallet}
                className="h-11 px-4 text-[13px] sm:h-9"
              >
                Match my Arc USDC (optional)
              </Button>
            ) : null}
            <Button
              variant="rivenGhost"
              size="rv"
              type="button"
              onClick={() => {
                setNotice(null)
                setConfirmingReset(true)
              }}
              className="h-11 px-4 text-[13px] sm:h-9"
            >
              Reset practice account
            </Button>
          </div>
        )}
      </div>

      <p
        className="mt-2 text-[12px] text-[var(--rv-ink-3)] empty:hidden"
        aria-live="polite"
      >
        {notice}
      </p>
    </section>
  )
}

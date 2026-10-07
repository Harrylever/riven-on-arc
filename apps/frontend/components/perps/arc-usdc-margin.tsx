"use client"

import { useCallback, useEffect, useState } from "react"
import { useArcWallet } from "@/hooks/use-arc-wallet"
import { usePortfolio } from "@/hooks/use-portfolio"

const ARC_RPC = "https://rpc.mainnet.arc.io"
const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

/** Native USDC on Arc (it's the gas token; 18 decimals natively). Read-only. */
async function arcUsdc(address: string): Promise<number | null> {
  try {
    const res = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    })
    const j = (await res.json()) as { result?: string }
    if (!j.result) return null
    return Number(BigInt(j.result) / BigInt(1e12)) / 1e6 // 18 → 6 decimals, then to dollars
  } catch {
    return null
  }
}

/**
 * Perps margined in Arc USDC. Connect an Arc wallet and Riven reads its USDC
 * balance; one tap makes that your paper-trading margin, so you practise with
 * the dollars you actually hold on Arc. Nothing leaves the wallet — Riven
 * never holds keys or funds.
 */
export function ArcUsdcMargin() {
  const wallet = useArcWallet()
  const { cashBalance, deposit, withdraw } = usePortfolio()
  const [bal, setBal] = useState<number | null>(null)
  const [done, setDone] = useState(false)

  const load = useCallback(async () => {
    if (!wallet.address) return setBal(null)
    setBal(await arcUsdc(wallet.address))
  }, [wallet.address])
  useEffect(() => {
    void load()
  }, [load])

  const useAsMargin = () => {
    if (bal === null) return
    const delta = Math.round((bal - cashBalance) * 100) / 100
    if (delta > 0) deposit(delta, "USDC")
    else if (delta < 0) withdraw(-delta, "USDC")
    setDone(true)
  }

  return (
    <section className="rv-card flex flex-wrap items-center gap-3 p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#2775ca] text-[13px] font-extrabold text-white" aria-hidden>
        $
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[var(--rv-ink)]">Margin in USDC on Arc</p>
        <p className="text-[12px] leading-snug text-[var(--rv-ink-2)]">
          {wallet.address
            ? bal === null
              ? "Reading your Arc USDC…"
              : `Your wallet holds ${usd(bal)} USDC on Arc. Practise perps with exactly that as margin — nothing leaves your wallet.`
            : "Connect your Arc wallet and your Arc USDC becomes your perps margin (paper). Arc pays gas in USDC, so it's dollars end to end."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rv-num text-[12px] text-[var(--rv-ink-3)]">Paper margin {usd(cashBalance)}</span>
        {!wallet.address ? (
          <button type="button" onClick={() => void wallet.connect()} className="rv-btn h-9 px-4 text-[13px]" disabled={!wallet.hasWallet}>
            {wallet.hasWallet ? "Connect Arc wallet" : "Install a wallet"}
          </button>
        ) : (
          <button type="button" onClick={useAsMargin} disabled={bal === null} className="rv-btn h-9 px-4 text-[13px] disabled:opacity-50">
            {done ? "Margin set ✓" : "Use my Arc USDC"}
          </button>
        )}
      </div>
    </section>
  )
}

"use client"

import { PageHero } from "./page-hero"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { compact, usd } from "@/lib/riven-format"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { WalletPanel } from "./wallet-panel"

const KEY = "riven_portfolio_wallet"

interface Portfolio {
  wallet: string
  totalUsd: number
  atRisk: number
  holdings: Array<{
    token: TokenSummary
    amount: number
    valueUsd: number | null
  }>
}

/** Portfolio: your own connected wallet, or a read-only check of any address. */
export function PortfolioClient() {
  const [tab, setTab] = useState<"mine" | "any">("mine")
  return (
    <div className="flex flex-col gap-4">
      <PageHero
        eyebrow="Non-custodial · you sign everything"
        title="Portfolio"
        lines={[
          "Connect a wallet and I'll score everything you hold.",
          "I never hold your keys. You sign everything.",
          "Paste any 0x address to check someone else's bags.",
        ]}
        greet="Show me your bags — I'll rug-check every one."
        actions={
        <div className="rv-seg">
          {(
            [
              ["mine", "My wallet"],
              ["any", "Check any wallet"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
            >
              {label}
            </button>
          ))}
        </div>
        }
      >
        Your balance, deposits, withdrawals, conversions and trades on Arc — every token scored for rug risk.
      </PageHero>
      {tab === "mine" ? <WalletPanel /> : <WalletLookup />}
    </div>
  )
}

/** Read-only: a public address in, holdings and their rug risk out. Never asks for keys. */
function WalletLookup() {
  const [wallet, setWallet] = useState("")
  const [data, setData] = useState<Portfolio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (w: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/arc/portfolio?wallet=${encodeURIComponent(w.trim())}`,
      )
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? "Couldn't load this wallet")
      setData(d)
      try {
        localStorage.setItem(KEY, w.trim())
      } catch {}
    } catch (e) {
      setData(null)
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved) {
        setWallet(saved)
        void load(saved)
      }
    } catch {}
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[var(--rv-ink-2)]">
        Paste any Arc wallet address. Riven shows what it holds and flags
        anything that looks like a rug. Read-only — never share a private key or
        seed phrase with anyone.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void load(wallet)
        }}
      >
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="0x… wallet address"
          aria-label="Wallet address"
          spellCheck={false}
          className="rv-input h-12 min-w-0 flex-1 px-4 text-[14px]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--rv-blue)] px-5 text-[14px] font-semibold text-[var(--rv-on-blue)]"
        >
          {loading ? "Checking…" : "Check"}
        </button>
      </form>
      {error && (
        <p className="text-[13px] text-[var(--rv-risk)]">{error}</p>
      )}
      {data && (
        <>
          <section className="grid grid-cols-3 gap-2">
            <Stat label="Value in tracked tokens" value={usd(data.totalUsd)} />
            <Stat label="Tokens held" value={String(data.holdings.length)} />
            <Stat
              label="Look like rugs"
              value={String(data.atRisk)}
              color={data.atRisk ? "var(--rv-risk)" : "var(--rv-healthy)"}
            />
          </section>
          {data.atRisk > 0 && (
            <div className="rv-card px-4 py-3 text-[13px] text-[var(--rv-ink)]">
              <span className="font-semibold text-[var(--rv-risk)]">
                Warning:
              </span>{" "}
              {data.atRisk} of these tokens are risky or caught faking. Check
              them before buying more.
            </div>
          )}
          {data.holdings.length === 0 ? (
            <div className="rv-card px-6 py-10 text-center text-[14px] text-[var(--rv-ink-2)]">
              This wallet holds none of the tokens Riven currently tracks.
            </div>
          ) : (
            <ol className="rv-card divide-y divide-[var(--rv-stroke)]">
              {data.holdings.map((h) => (
                <li key={h.token.address}>
                  <Link
                    href={`/token/${h.token.address}`}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-[var(--rv-row-hover)]"
                  >
                    <TokenAvatar
                      image={h.token.image}
                      symbol={h.token.symbol}
                      address={h.token.address}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[var(--rv-ink)]">
                          {h.token.symbol}
                        </span>
                        {h.token.fake && (
                          <span className="rounded bg-[rgba(248,113,113,0.12)] px-1 text-[9px] font-bold text-[var(--rv-risk)] uppercase">
                            fake
                          </span>
                        )}
                      </div>
                      <p className="rv-num text-[12px] text-[var(--rv-ink-3)]">
                        {compact(h.amount)} tokens
                      </p>
                    </div>
                    <span className="rv-num text-[14px] text-[var(--rv-ink)]">
                      {usd(h.valueUsd)}
                    </span>
                    <ScoreBadge
                      score={h.token.score}
                      band={h.token.band}
                      size="sm"
                    />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  color = "var(--rv-ink)",
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="rv-card px-3 py-2.5">
      <div className="text-[10px] font-semibold tracking-wide text-[var(--rv-ink-3)] uppercase">
        {label}
      </div>
      <div
        className="rv-num mt-0.5 text-[17px] font-semibold"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  )
}

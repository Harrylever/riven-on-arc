"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  encodeFunctionData,
  erc20Abi,
  isAddress,
  parseUnits,
  type Address,
} from "viem"
import { useArcWallet } from "@/hooks/use-arc-wallet"
import { TRADING_ENABLED } from "@/lib/flags"
import type { TokenSummary } from "@/lib/arc-data"
import { compact, shortAddr, usd } from "@/lib/riven-format"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { TradeSheet, type TradeToken } from "./trade-sheet"
import { RvSelect } from "./rv-select"
import { visibleInterval } from "@/lib/visible-interval"
import { Input } from "@/components/ui/input"
import { RV_INPUT } from "@/components/riven/card-style"

interface WalletData {
  address: string
  usdc: number
  eurc: number
  atRisk: number
  holdings: Array<{
    token: TokenSummary
    amount: number
    valueUsd: number | null
  }>
}

type Panel = null | "deposit" | "withdraw" | "convert"

/** "My wallet": balances, holdings and the money actions — all signed by the user's own wallet. */
export function WalletPanel() {
  const wallet = useArcWallet()
  const [data, setData] = useState<WalletData | null>(null)
  const [failed, setFailed] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [trade, setTrade] = useState<{
    token: TradeToken
    side: "buy" | "sell"
  } | null>(null)

  const load = useCallback(async () => {
    if (!wallet.address) return
    try {
      const res = await fetch(`/api/arc/wallet?address=${wallet.address}`)
      if (!res.ok) throw new Error(`wallet ${res.status}`)
      setData(await res.json())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [wallet.address])

  useEffect(() => {
    setData(null)
    void load()
    return visibleInterval(load, 60_000)
  }, [load])

  if (!wallet.address) {
    return (
      <section className="rv-card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-[20px] font-bold text-[var(--rv-ink)]">
          Connect your wallet
        </p>
        <p className="max-w-md text-[13px] text-[var(--rv-ink-2)]">
          See your balance, deposit, withdraw, convert, and buy or sell Arc
          tokens through Uniswap — with Riven&apos;s rug check before every buy.
          Your keys stay in your wallet; Riven never holds funds.
        </p>
        <button
          type="button"
          onClick={() => void wallet.connect()}
          className="rounded-lg bg-[var(--rv-blue)] px-6 py-3 text-[15px] font-bold text-[var(--rv-on-blue)]"
        >
          {wallet.hasWallet
            ? "Connect wallet"
            : "Connect wallet (MetaMask / Rabby)"}
        </button>
        {wallet.error && (
          <p className="text-[12px] text-[var(--rv-risk)]">
            {wallet.error}
          </p>
        )}
      </section>
    )
  }

  const tokensValue =
    data?.holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0) ?? 0
  return (
    <div className="flex flex-col gap-3">
      <section className="rv-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--rv-ink-3)] uppercase">
              Wallet balance
            </p>
            <p className="mt-1 text-[36px] leading-none font-extrabold text-[var(--rv-ink)]">
              {/* EURC isn't a dollar: it's shown on its own line, not added at 1:1. */}
              {data ? usd(data.usdc + tokensValue) : "…"}
            </p>
            <p className="rv-num mt-2 text-[12px] text-[var(--rv-ink-2)]">
              {data
                ? `${data.usdc.toFixed(2)} USDC · ${usd(tokensValue)} in tokens${data.eurc > 0 ? ` · plus ${data.eurc.toFixed(2)} EURC` : ""}`
                : failed
                  ? "Couldn't load balances — retrying…"
                  : "Loading balances…"}
            </p>
          </div>
          <div className="text-right">
            <p className="rv-num text-[12px] text-[var(--rv-ink-2)]">
              {shortAddr(wallet.address)}
            </p>
            {!wallet.onArc && (
              <button
                type="button"
                onClick={() => void wallet.ensureArc()}
                className="mt-1 text-[12px] font-semibold text-[var(--rv-caution)]"
              >
                Switch to Arc
              </button>
            )}
            <button
              type="button"
              onClick={wallet.disconnect}
              className="mt-1 block text-[12px] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
            >
              Disconnect
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[var(--rv-ink-3)]">
          EURC counted at 1:1 for the total; token values use live prices.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(TRADING_ENABLED
            ? (["deposit", "withdraw", "convert"] as const)
            : (["deposit", "withdraw"] as const)
          ).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPanel(panel === p ? null : p)}
              aria-expanded={panel === p}
              className="h-11 rounded-lg text-[14px] font-semibold capitalize"
              style={{
                background:
                  panel === p ? "var(--rv-blue)" : "rgba(255,255,255,0.04)",
                color: panel === p ? "#fff" : "var(--rv-ink)",
                boxShadow:
                  panel === p ? "none" : "inset 0 0 0 1px var(--rv-stroke)",
              }}
            >
              {p}
            </button>
          ))}
        </div>
        {panel === "deposit" && <Deposit address={wallet.address} />}
        {panel === "withdraw" && data && (
          <Withdraw wallet={wallet} data={data} onDone={load} />
        )}
        {panel === "convert" && (
          <Convert onPick={(token) => setTrade({ token, side: "buy" })} />
        )}
      </section>

      {data && data.atRisk > 0 && (
        <div className="rv-card px-4 py-3 text-[13px] text-[var(--rv-ink)]">
          <span className="font-semibold text-[var(--rv-risk)]">Anti-rug:</span>{" "}
          {data.atRisk} of your tokens are risky or caught faking. Consider
          selling before liquidity disappears.
        </div>
      )}

      <section className="rv-card">
        <h2 className="px-4 pt-4 text-[16px] font-bold text-[var(--rv-ink)]">
          Your tokens
        </h2>
        {!data ? (
          <p className="px-4 py-4 text-[13px] text-[var(--rv-ink-3)]">
            Loading…
          </p>
        ) : data.holdings.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-[var(--rv-ink-2)]">
            No tokens Riven tracks yet. Find one in the{" "}
            <Link href="/" className="text-[var(--rv-ice)] underline">
              screener
            </Link>{" "}
            and buy it here.
          </p>
        ) : (
          <ol className="mt-2 divide-y divide-[var(--rv-stroke)]">
            {data.holdings.map((h) => (
              <li
                key={h.token.address}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Link
                  href={`/token/${h.token.address}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <TokenAvatar
                    image={h.token.image}
                    symbol={h.token.symbol}
                    address={h.token.address}
                    size={34}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--rv-ink)]">
                      {h.token.symbol}
                    </p>
                    <p className="rv-num text-[12px] text-[var(--rv-ink-3)]">
                      {compact(h.amount)} · {usd(h.valueUsd)}
                    </p>
                  </div>
                </Link>
                <ScoreBadge
                  score={h.token.score}
                  band={h.token.band}
                  size="sm"
                />
                {TRADING_ENABLED && (
                  <>
                    <button
                      type="button"
                      onClick={() => setTrade({ token: h.token, side: "buy" })}
                      className="rounded-md px-2.5 py-1.5 text-[12px] font-bold text-[var(--rv-up)] ring-1 ring-[rgba(74,222,128,0.4)]"
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrade({ token: h.token, side: "sell" })}
                      className="rounded-md px-2.5 py-1.5 text-[12px] font-bold text-[var(--rv-down)] ring-1 ring-[rgba(248,113,113,0.4)]"
                    >
                      Sell
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {trade && (
        <TradeSheet
          token={trade.token}
          wallet={wallet}
          initialSide={trade.side}
          onClose={() => setTrade(null)}
          onDone={() => void load()}
        />
      )}
    </div>
  )
}

function Deposit({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--rv-stroke)] p-3 text-[13px] text-[var(--rv-ink-2)]">
      <p>
        Send <b className="text-[var(--rv-ink)]">USDC on the Arc network</b>{" "}
        (chain 5042) to your address. Sending from another network means
        bridging first, for example with Circle&apos;s CCTP.
      </p>
      <div className="flex items-center gap-2">
        <code className="rv-num min-w-0 flex-1 truncate rounded bg-black px-2 py-2 text-[12px] text-[var(--rv-ink)]">
          {address}
        </code>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(address).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }
          className="rounded-md bg-[var(--rv-blue)] px-3 py-2 text-[12px] font-semibold text-[var(--rv-on-blue)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  )
}

function Withdraw({
  wallet,
  data,
  onDone,
}: {
  wallet: ReturnType<typeof useArcWallet>
  data: WalletData
  onDone: () => void
}) {
  const [asset, setAsset] = useState("USDC")
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const holding = data.holdings.find((h) => h.token.address === asset)
  const max =
    asset === "USDC" ? Math.max(0, data.usdc - 0.05) : (holding?.amount ?? 0)
  const valid = isAddress(to) && Number(amount) > 0 && Number(amount) <= max

  const submit = async () => {
    setStatus("Confirm in your wallet…")
    try {
      if (asset === "USDC") {
        // Native USDC is Arc's gas token: 18 decimals as a native value.
        await wallet.send({
          to: to as Address,
          value: parseUnits(amount, 18).toString(),
          label: "Withdraw USDC",
        })
      } else {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [
            to as Address,
            parseUnits(amount, holding?.token.decimals ?? 18),
          ],
        })
        await wallet.send({
          to: asset as Address,
          data,
          value: "0",
          label: `Withdraw ${holding?.token.symbol}`,
        })
      }
      setStatus("Sent ✓")
      setAmount("")
      onDone()
    } catch (e) {
      setStatus((e as Error).message.split("\n")[0] ?? "Failed")
    }
  }

  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-[var(--rv-stroke)] p-3 text-[13px]">
      <RvSelect
        label="Asset"
        value={asset}
        onChange={setAsset}
        highlightActive={false}
        className="h-10 w-full justify-between rounded-lg border-[color:var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 text-[13px] font-medium text-[var(--rv-ink)]"
        options={[
          ["USDC", `USDC (${data.usdc.toFixed(2)})`],
          ...data.holdings.map((h) => [h.token.address, `${h.token.symbol} (${compact(h.amount)})`] as [string, string]),
        ]}
      />
      <Input
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
        placeholder="Send to 0x…"
        aria-label="Recipient"
        className={`${RV_INPUT} h-10 px-3 text-[13px]`}
      />
      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Amount"
          aria-label="Amount"
          className={`${RV_INPUT} h-10 min-w-0 flex-1 px-3 text-[13px]`}
        />
        <button
          type="button"
          onClick={() => setAmount(String(Math.floor(max * 1e6) / 1e6))}
          className="rounded-md px-3 text-[12px] font-semibold text-[var(--rv-ice)] ring-1 ring-[var(--rv-stroke)]"
        >
          Max
        </button>
      </div>
      {to && !isAddress(to) && (
        <p className="text-[12px] text-[var(--rv-risk)]">
          That isn&apos;t a valid 0x address.
        </p>
      )}
      <button
        type="button"
        disabled={!valid}
        onClick={() => void submit()}
        className="h-10 rounded-lg bg-[var(--rv-blue)] font-semibold text-[var(--rv-on-blue)] disabled:opacity-40"
      >
        Withdraw
      </button>
      {status && <p className="text-[12px] text-[var(--rv-ink-2)]">{status}</p>}
      <p className="text-[11px] text-[var(--rv-ink-3)]">
        Double-check the address — transfers on a blockchain can&apos;t be
        reversed.
      </p>
    </div>
  )
}

/** Convert USDC into any Arc token (or EURC) by contract address or ticker. */
function Convert({ onPick }: { onPick: (t: TradeToken) => void }) {
  const [q, setQ] = useState("EURC")
  const [results, setResults] = useState<TokenSummary[] | null>(null)
  const ref = useRef(0)
  useEffect(() => {
    const id = ++ref.current
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setResults(null)
      try {
        const res = await fetch(
          `/api/arc/search?q=${encodeURIComponent(q.trim())}`,
        )
        const d = (await res.json()) as { tokens: TokenSummary[] }
        if (id === ref.current) setResults(d.tokens.slice(0, 6))
      } catch {}
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-[var(--rv-stroke)] p-3 text-[13px]">
      <p className="text-[var(--rv-ink-2)]">
        Convert USDC into another Arc token — search a ticker or paste its
        contract.
      </p>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="EURC, ticker or 0x…"
        aria-label="Token to convert to"
        className={`${RV_INPUT} h-10 px-3 text-[13px]`}
      />
      {results && results.length === 0 && (
        <p className="text-[12px] text-[var(--rv-ink-3)]">
          No tradable Arc token with a USDC pool matches that yet.
        </p>
      )}
      {results?.map((t) => (
        <button
          key={t.address}
          type="button"
          onClick={() => onPick(t)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.04]"
        >
          <TokenAvatar
            image={t.image}
            symbol={t.symbol}
            address={t.address}
            size={24}
          />
          <span className="flex-1 font-semibold text-[var(--rv-ink)]">
            {t.symbol}
          </span>
          <span className="rv-num text-[11px] text-[var(--rv-ink-3)]">
            {shortAddr(t.address)}
          </span>
          <ScoreBadge score={t.score} band={t.band} size="sm" />
        </button>
      ))}
    </div>
  )
}

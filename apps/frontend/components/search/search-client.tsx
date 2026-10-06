"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { usd, pct, ago, shortAddr } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ARC_PORT_MODE } from "@/lib/flags"
import type {
  SearchResponse,
  SearchTokenResult,
  SearchPerpResult,
  SearchPersonResult,
  SearchNewsResult,
} from "@/app/api/search/route"

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

type SearchTab = "all" | "tokens" | "perps" | "people" | "news"

export function SearchClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const q = searchParams.get("q")?.trim() ?? ""

  const [activeTab, setActiveTab] = useState<SearchTab>("all")
  const [data, setData] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [addressNotice, setAddressNotice] = useState<string | null>(null)

  const [inputVal, setInputVal] = useState(q)

  useEffect(() => {
    // Syncs the editable input with the URL's ?q= whenever it changes from
    // outside this component (back/forward nav, an external link) — the
    // input still edits freely between syncs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputVal(q)
    if (!q) {
      setData(null)
      return
    }

    const isExactAddress = ARC_PORT_MODE
      ? EVM_ADDRESS_REGEX.test(q)
      : BASE58_REGEX.test(q)
    if (isExactAddress && !ARC_PORT_MODE) {
      router.push(`/token/${q}`)
      return
    }

    let cancelled = false
    setLoading(true)
    setSearchError(false)

    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((res: SearchResponse) => {
        if (!cancelled) {
          setData(res)
        }
      })
      .catch(() => {
        if (!cancelled) setSearchError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [q, router])

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    const clean = inputVal.trim()
    if (!clean) return
    setAddressNotice(null)
    if (
      ARC_PORT_MODE ? EVM_ADDRESS_REGEX.test(clean) : BASE58_REGEX.test(clean)
    ) {
      if (ARC_PORT_MODE) {
        setAddressNotice(
          "Arc score pages are not connected yet. No score has been generated for this address.",
        )
        return
      }
      router.push(`/token/${clean}`)
    } else {
      router.push(`/search?q=${encodeURIComponent(clean)}`)
    }
  }

  const tokens = data?.tokens ?? []
  const perps = data?.perps ?? []
  const people = data?.people ?? []
  const news = data?.news ?? []

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <SearchBar
        value={inputVal}
        onChange={(value) => {
          setInputVal(value)
          setAddressNotice(null)
        }}
        onSubmit={handleSearchSubmit}
      />
      {addressNotice && (
        <p className="-mt-5 mb-8 text-xs text-[var(--text-muted)]">
          {addressNotice}
        </p>
      )}

      {q && (
        <div className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div>
              <h1 className="text-lg font-bold text-[var(--text-primary)]">
                Search results for &ldquo;{q}&rdquo;
              </h1>
              <p className="text-xs text-[var(--text-muted)]">
                {ARC_PORT_MODE
                  ? "Searching indexed Arc launches and EVM contract addresses."
                  : "Search tokens, markets, people, and news."}
              </p>
            </div>

            {!ARC_PORT_MODE && (
              <ResultsTabs
                activeTab={activeTab}
                onChange={setActiveTab}
                tokenCount={tokens.length}
                perpCount={perps.length}
                peopleCount={people.length}
                newsCount={news.length}
              />
            )}
          </div>

          {loading ? (
            <ResultsSkeleton />
          ) : searchError ? (
            <div className="rounded-none border border-[var(--score-risk)]/20 bg-[var(--score-risk-tint)] p-4 text-xs text-[var(--score-risk)]">
              Search encountered a network issue. Please try again.
            </div>
          ) : tokens.length === 0 &&
            perps.length === 0 &&
            people.length === 0 &&
            news.length === 0 ? (
            <div className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
              {ARC_PORT_MODE
                ? `No indexed Arc launches match "${q}". Results will appear after factory events are verified and indexed.`
                : `No matching tokens, perps, people, or news found for "${q}".`}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {(activeTab === "all" || activeTab === "perps") &&
                perps.length > 0 && <PerpResults perps={perps} />}

              {(activeTab === "all" || activeTab === "tokens") &&
                tokens.length > 0 && <TokenResults tokens={tokens} />}

              {(activeTab === "all" || activeTab === "people") &&
                people.length > 0 && <PeopleResults people={people} />}

              {(activeTab === "all" || activeTab === "news") &&
                news.length > 0 && <NewsResults news={news} />}
            </div>
          )}
        </div>
      )}

      <ContractInspector />
    </div>
  )
}

function SearchBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
}) {
  return (
    <div className="mb-8">
      <form onSubmit={onSubmit} className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-[var(--text-muted)]">
            🔍
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              ARC_PORT_MODE
                ? "Search Arc launches or an EVM contract address…"
                : "Search words (e.g. friend), tickers (e.g. $SOL, BTC), perps, or CA…"
            }
            className="w-full rounded-none border border-[var(--border)] bg-[var(--surface)] py-3.5 pr-4 pl-11 text-sm text-[var(--text-primary)] transition-colors outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
          />
        </div>
        <Button
          type="submit"
          className="rounded-none bg-[var(--brand)] px-5 py-3.5 text-xs font-bold text-[var(--text-on-brand)] hover:opacity-90"
        >
          Search
        </Button>
      </form>
    </div>
  )
}

function ResultsTabs({
  activeTab,
  onChange,
  tokenCount,
  perpCount,
  peopleCount,
  newsCount,
}: {
  activeTab: SearchTab
  onChange: (tab: SearchTab) => void
  tokenCount: number
  perpCount: number
  peopleCount: number
  newsCount: number
}) {
  const tabs: { id: SearchTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "tokens", label: `Tokens (${tokenCount})` },
    { id: "perps", label: `Perps (${perpCount})` },
    { id: "people", label: `People (${peopleCount})` },
    { id: "news", label: `News & Signals (${newsCount})` },
  ]
  return (
    <div className="flex gap-1 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-1 text-xs font-semibold">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="rounded-none px-3 py-1.5 transition-colors"
          style={
            activeTab === tab.id
              ? { background: "var(--brand)", color: "var(--text-on-brand)" }
              : { color: "var(--text-muted)" }
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-none border border-[var(--border)] bg-[var(--surface)] p-3.5"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1.5 h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

function PerpResults({ perps }: { perps: SearchPerpResult[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wider text-[var(--brand)] uppercase">
          Perpetual Futures Signals ({perps.length})
        </h2>
        <Link
          href="/terminal?tab=perps"
          className="text-xs font-bold text-[var(--brand)] hover:underline"
        >
          Open Terminal Perps →
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {perps.map((p) => (
          <Link
            key={p.id}
            href="/terminal?tab=perps"
            className="flex items-center justify-between rounded-none border border-[var(--border)] bg-[var(--surface)] p-3.5 transition-all hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]"
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-bold uppercase",
                    p.bias === "LONG"
                      ? "bg-[var(--up)]/15 text-[var(--up)]"
                      : "bg-[var(--down)]/15 text-[var(--down)]",
                  )}
                >
                  {p.bias}
                </span>
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {p.symbol}
                </span>
                <span className="font-mono text-xs text-[var(--text-muted)]">
                  {p.exchange}
                </span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                Entry: ${p.entryPrice.toLocaleString()} · SL: $
                {p.stopLoss.toLocaleString()} · T1: ${p.t1.toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-none border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--brand)]">
                Trade Perp →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function TokenResults({ tokens }: { tokens: SearchTokenResult[] }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-bold tracking-wider text-[var(--brand)] uppercase">
        Memecoins & Tokens ({tokens.length})
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {tokens.map((t) => (
          <div
            key={t.mint}
            className="group flex items-center justify-between rounded-none border border-[var(--border)] bg-[var(--surface)] p-3.5 transition-all hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]"
          >
            <Link
              href={`/terminal?mint=${t.mint}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-xs font-bold">
                {t.imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.imageUri}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  t.symbol.slice(0, 3)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-[var(--text-primary)]">
                    {t.name}
                  </span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    ${t.symbol}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                  {t.marketCapUsd
                    ? `MCap ${usd(t.marketCapUsd)}`
                    : shortAddr(t.mint)}
                  {t.priceChange24h != null && (
                    <span
                      className="ml-2 font-bold"
                      style={{
                        color:
                          t.priceChange24h >= 0 ? "var(--up)" : "var(--down)",
                      }}
                    >
                      {pct(t.priceChange24h)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5">
              <Link
                href={`/token/${t.mint}`}
                className="rounded-none border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--text-primary)]"
              >
                Inspect
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PeopleResults({ people }: { people: SearchPersonResult[] }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-bold tracking-wider text-[var(--brand)] uppercase">
        People & KOLs ({people.length})
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {people.map((p, idx) => (
          <div
            key={p.wallet || p.name + idx}
            className="flex items-center justify-between rounded-none border border-[var(--border)] bg-[var(--surface)] p-3.5 transition-all hover:border-[var(--brand)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand)]/20 to-blue-500/20 text-sm font-bold text-[var(--brand)]">
                👤
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  {p.name}
                </div>
                <div className="font-mono text-xs text-[var(--text-muted)]">
                  {p.handle || (p.wallet ? shortAddr(p.wallet) : "Solana KOL")}
                </div>
              </div>
            </div>
            <div className="text-right text-xs">
              {p.winrate != null && (
                <div className="font-bold text-[var(--brand)]">
                  {p.winrate.toFixed(1)}% win rate
                </div>
              )}
              {p.tradesCount != null && (
                <div className="text-[10px] text-[var(--text-muted)]">
                  {p.tradesCount} calls tracked
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NewsResults({ news }: { news: SearchNewsResult[] }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-bold tracking-wider text-[var(--brand)] uppercase">
        News & On-chain Signals ({news.length})
      </h2>
      <div className="flex flex-col gap-2">
        {news.map((n) => (
          <div
            key={n.id}
            className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--brand)]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                {n.title}
              </span>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                {ago(n.time)}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              {n.snippet}
            </p>
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[var(--text-muted)]">
              <span>Source: {n.source}</span>
              {n.mint && (
                <Link
                  href={`/terminal?mint=${n.mint}`}
                  className="text-[var(--brand)] hover:underline"
                >
                  Open in Terminal →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ContractInspector() {
  const router = useRouter()
  const [caInput, setCaInput] = useState("")
  const [caError, setCaError] = useState<string | null>(null)

  const handleCaSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = caInput.trim()
    if (!trimmed) {
      setCaError(
        ARC_PORT_MODE
          ? "Please enter an EVM address (0x followed by 40 hexadecimal characters)."
          : "Please enter a Solana contract address.",
      )
      return
    }
    if (ARC_PORT_MODE) {
      if (!EVM_ADDRESS_REGEX.test(trimmed)) {
        setCaError("Address must be 0x followed by 40 hexadecimal characters.")
        return
      }
      setCaError(
        "Arc score pages are not connected yet. No score has been generated for this address.",
      )
      return
    } else {
      if (trimmed.length < 32 || trimmed.length > 44) {
        setCaError(
          `Address must be between 32 and 44 characters (current: ${trimmed.length}).`,
        )
        return
      }
      if (!BASE58_REGEX.test(trimmed)) {
        setCaError("Address must be valid base58 format (case-sensitive).")
        return
      }
    }
    setCaError(null)
    router.push(`/token/${trimmed}`)
  }

  return (
    <div className="mt-12 rounded-none border border-[var(--border)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-sunken)] p-6 shadow-xl">
      <div className="mb-4">
        <div className="inline-flex items-center gap-1.5 rounded-none border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-3 py-1 text-[11px] font-bold text-[var(--brand)]">
          <span>⚡</span>{" "}
          {ARC_PORT_MODE
            ? "Arc EVM Contract Inspector"
            : "Solana Mint Inspector"}
        </div>
        <h2 className="mt-2 text-xl font-extrabold text-[var(--text-primary)]">
          Inspect Any Contract Address (CA)
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {ARC_PORT_MODE
            ? "Enter an EVM token address (0x + 40 hex characters). Score pages stay disabled until launch signals are verified."
            : "Paste a 32-44 character Base58 address to inspect mint authority, LP locks, and holder concentration."}
        </p>
      </div>

      <form onSubmit={handleCaSubmit} className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-none border border-[var(--border)] bg-black/40 px-4 py-3 font-mono text-xs text-[var(--text-primary)] focus-within:border-[var(--brand)]">
          <span className="font-bold text-[var(--text-muted)]">CA:</span>
          <input
            type="text"
            placeholder={
              ARC_PORT_MODE
                ? "0x followed by 40 hexadecimal characters"
                : "Paste exact Solana token mint"
            }
            value={caInput}
            onChange={(e) => {
              setCaInput(e.target.value)
              if (caError) setCaError(null)
            }}
            className="w-full border-none bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        {caError && <p className="text-xs font-bold text-red-400">{caError}</p>}
        <Button
          type="submit"
          size="lg"
          className="h-auto min-h-11 w-full bg-gradient-to-r from-[var(--brand)] to-cyan-400 px-4 py-3 text-xs font-bold tracking-normal text-[var(--text-on-brand)] hover:opacity-90 sm:tracking-wider"
        >
          <span className="sm:hidden">Inspect Contract</span>
          <span className="hidden sm:inline">
            {ARC_PORT_MODE
              ? "Check Arc Address Status"
              : "Inspect On-Chain Contract Safety & Score"}
          </span>
        </Button>
      </form>
    </div>
  )
}

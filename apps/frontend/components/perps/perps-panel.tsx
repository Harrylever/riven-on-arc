"use client"

import { TelegramConnect } from "@/components/riven/telegram-connect"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Freshness } from "@/components/perps/freshness"
import { MiniBar } from "@/components/perps/mini-bar"
import { StatRow } from "@/components/perps/stat-row"
import { Skeleton } from "@/components/ui/skeleton"
import { DISCLAIMER } from "@/lib/site"
import { ago, priceUsd } from "@/lib/format"
import { PERPS_ENABLED } from "@/lib/flags"
import { SignalOrderModal } from "@/components/perps/signal-order-modal"
import { usePortfolio } from "@/hooks/use-portfolio"
import { SignalCarousel } from "@/components/perps/signal-carousel"
import { CallCard } from "@/components/perps/call-card"
import { CoinIcon } from "@/components/perps/coin-icon"
import { NewsFeed } from "@/components/perps/news-feed"
import Link from "next/link"
import { isMajorPerp, isMemePerp, signalCoinKey } from "@/lib/perp-symbols"
import type { PerpMarket } from "@/lib/hyperliquid"
import { ArrowIcon } from "@/components/riven/arrow"

export interface PerpSignal {
  id: string
  exchange: "BYBIT" | "MEXC" | "BINANCE"
  symbol: string
  bias: "LONG" | "SHORT"
  /** Conviction after self-training calibration (0–10). */
  confidence: number
  /** The scanner's raw score before calibration, when calibrated. */
  rawConfidence?: number | null
  /** Self-trained model's win probability (0–1), when available. */
  winProb?: number | null
  entryPrice: number
  entryLow: number
  entryHigh: number
  stopLoss: number
  t1: number
  t2: number
  t3: number
  scanTime: string
  outcome: string
  resolvedAt: string | null
  entryConfirmed: number
  bestTargetHit: string | null
  slAfterTarget: number
  createdAt: string
}

export interface PerpStats {
  totalResolved: number
  confirmedTrades: number
  missedEntries: number
  wins: number
  slHits: number
  expired: number
  winRate: number
  stopLossRate: number
  perTargetHit: {
    t1: number
    t2: number
    t3: number
    t1Rate: number
    t2Rate: number
    t3Rate: number
  }
  confidenceBands: {
    high: { total: number; wins: number; winRate: number }
    medium: { total: number; wins: number; winRate: number }
    low: { total: number; wins: number; winRate: number }
  }
  criteria: string
}

const OUTCOME_META: Record<
  string,
  { label: string; color: string; tint: string }
> = {
  pending: {
    label: "Active / Pending",
    color: "var(--rv-unscored)",
    tint: "rgba(255,255,255,0.06)",
  },
  t1_hit: {
    label: "Target 1 Hit",
    color: "var(--rv-healthy)",
    tint: "rgba(74,222,128,0.12)",
  },
  t2_hit: {
    label: "Target 2 Hit",
    color: "var(--rv-healthy)",
    tint: "rgba(74,222,128,0.12)",
  },
  t3_hit: {
    label: "Target 3 Hit",
    color: "var(--rv-healthy)",
    tint: "rgba(74,222,128,0.12)",
  },
  sl_hit: {
    label: "Stop Loss Hit",
    color: "var(--rv-risk)",
    tint: "rgba(248,113,113,0.12)",
  },
  expired: {
    label: "Expired (48h)",
    color: "var(--rv-caution)",
    tint: "rgba(251,191,36,0.12)",
  },
}

export function PerpsPanel() {
  const [signals, setSignals] = useState<PerpSignal[] | null>(null)
  const [stats, setStats] = useState<PerpStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  // Custom refresh interval (defaults to 10 minutes = 600,000ms, persisted in localStorage)
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("riven_perps_refresh_interval")
      if (saved !== null) {
        const parsed = Number(saved)
        if (!isNaN(parsed)) return parsed
      }
    }
    return 600_000 // 10 mins by default
  })

  // Filters - default to "all" so users see all available signals immediately
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">(
    "all",
  )
  const [exchangeFilter, setExchangeFilter] = useState<
    "ALL" | "BYBIT" | "MEXC" | "BINANCE"
  >("ALL")
  const [biasFilter, setBiasFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL")
  const [search, setSearch] = useState("")
  const [selectedSignal, setSelectedSignal] = useState<PerpSignal | null>(null)
  const [markets, setMarkets] = useState<PerpMarket[] | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [showAllMarkets, setShowAllMarkets] = useState(false)
  const [marketGroup, setMarketGroup] = useState<
    "all" | "signal" | "meme" | "major"
  >("all")

  const { openOrders, fillOrder, updateMarks } = usePortfolio()

  // Mark open paper positions to market and run their stops / TPs / liquidation.
  useEffect(() => {
    if (!markets || markets.length === 0) return
    updateMarks(Object.fromEntries(markets.map((m) => [m.symbol, m.markPrice])))
  }, [markets, updateMarks])

  // Fill resting limit orders when the mark price crosses them
  useEffect(() => {
    if (!markets || openOrders.length === 0) return
    const price = new Map(markets.map((m) => [m.symbol, m.markPrice]))
    for (const o of openOrders) {
      const mark = price.get(o.market.replace(/-PERP$/, ""))
      if (!mark) continue
      const isLong = o.side === "LONG" || o.side === "BUY"
      if (isLong ? mark <= o.orderPrice : mark >= o.orderPrice) {
        fillOrder(o.id)
      }
    }
  }, [markets, openOrders, fillOrder])

  // Every listed perp (not just the ones the scanner has a signal for)
  useEffect(() => {
    if (!PERPS_ENABLED) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/perps/markets", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setMarkets(json.markets ?? [])
      } catch (err) {
        console.warn("Failed to load perp markets:", err)
      }
    }
    void load()
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 10_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const loadData = useCallback(
    async (silent = false) => {
      if (!PERPS_ENABLED) {
        setLoading(false)
        return
      }

      if (!silent) setRefreshing(true)
      try {
        const params = new URLSearchParams()
        if (statusFilter === "all") {
          params.set("status", "all")
        } else if (statusFilter === "resolved") {
          params.set("status", "resolved")
        } else {
          params.set("status", "open")
        }

        if (exchangeFilter !== "ALL") {
          params.set("exchange", exchangeFilter)
        }

        if (biasFilter !== "ALL") {
          params.set("bias", biasFilter)
        }

        params.set("take", "200")

        const res = await fetch(`/api/perp-signals?${params.toString()}`, {
          cache: "no-store",
        })

        if (!res.ok) {
          if (res.status === 404) {
            setSignals([])
            setStats(null)
            return
          }
          throw new Error(`Failed to fetch signals: ${res.status}`)
        }

        const json = await res.json()
        setSignals(json.signals ?? [])
        if (json.stats) {
          setStats(json.stats)
        }
        setUpdatedAt(Date.now())
      } catch (err) {
        console.warn("Failed to load perpetual signals:", err)
        if (!silent) setSignals([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [statusFilter, exchangeFilter, biasFilter],
  )

  // Initial load and whenever filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(false)
  }, [loadData])

  // Periodic poll: custom user timeframe (defaults to 10 mins) while tab is visible
  useEffect(() => {
    if (!PERPS_ENABLED || refreshIntervalMs <= 0) return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadData(true)
      }
    }, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [loadData, refreshIntervalMs])

  // Filter signals locally with or without cashtags (e.g. $SOL or SOL)
  const displayedSignals = useMemo(() => {
    if (!signals) return null
    const q = search
      .trim()
      .toUpperCase()
      .replace(/^\$/, "")
      .replace(/[-/]/g, "")
      .replace(/PERP$/, "")
    if (!q) return signals
    return signals.filter((s) => {
      const sym = s.symbol.toUpperCase()
      const base = signalCoinKey(sym)
      return (
        sym.includes(q) ||
        base.includes(q) ||
        s.exchange.toUpperCase().includes(q)
      )
    })
  }, [signals, search])

  // Best open signal per base coin, so market rows can show the scanner's view
  const signalByCoin = useMemo(() => {
    const map = new Map<string, PerpSignal>()
    for (const sig of signals ?? []) {
      if (sig.outcome !== "pending") continue
      const base = signalCoinKey(sig.symbol)
      const prev = map.get(base)
      if (!prev || sig.confidence > prev.confidence) map.set(base, sig)
    }
    return map
  }, [signals])

  const displayedMarkets = useMemo(() => {
    if (!markets) return null
    const q = search
      .trim()
      .toUpperCase()
      .replace(/^\$/, "")
      .replace(/PERP$/, "")
    const filtered = q
      ? markets.filter((m) => m.symbol.toUpperCase().includes(q))
      : markets
    // Scored coins first (highest conviction), then by 24h volume
    return [...filtered].sort((a, b) => {
      const sa = signalByCoin.get(a.symbol.toUpperCase())?.confidence ?? -1
      const sb = signalByCoin.get(b.symbol.toUpperCase())?.confidence ?? -1
      return sb - sa || b.volume24h - a.volume24h
    })
  }, [markets, search, signalByCoin])

  // Selected market tracks the live list; defaults to the top-ranked coin
  const selectedMarket =
    markets?.find((m) => m.symbol === selectedSymbol) ??
    displayedMarkets?.[0] ??
    markets?.[0] ??
    null

  if (!PERPS_ENABLED) {
    return null
  }

  // Carousel: the live calls most worth a look — highest calibrated
  // conviction (then model win odds), newest first among equals.
  const liveCalls = (signals ?? [])
    .filter((s) => s.outcome === "pending")
    .sort(
      (a, b) =>
        b.confidence - a.confidence || (b.winProb ?? 0) - (a.winProb ?? 0) || b.scanTime.localeCompare(a.scanTime),
    )
    .slice(0, 24)
  const marks = new Map((markets ?? []).map((m) => [m.symbol.toUpperCase(), m.markPrice]))

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight text-[var(--rv-ink)]">Live scanner calls</h2>
          <a href="#perp-signals" className="rv-btn-ghost ml-auto h-8 gap-1 px-3 text-[12px]">
            All calls
            <ArrowIcon />
          </a>
        </div>
        {loading && signals === null ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[300px] w-[232px] shrink-0 rounded-[var(--rv-radius)]" />
            ))}
          </div>
        ) : (
          <SignalCarousel signals={liveCalls} marks={marks} />
        )}
      </section>

      <TelegramConnect />

      {/* Track Record Stats Header */}
      {stats && (
        <div className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rv-stroke)] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className=" text-sm font-extrabold text-[var(--rv-ink)]">
                  Statistical Engine Track Record
                </span>
                <span className="rounded-md border border-[var(--rv-blue)]/30 bg-[var(--rv-blue)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--rv-blue)]">
                  Read-Only Verified
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--rv-ink-3)]">
                {stats.criteria}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-[var(--rv-ink-3)]">
                <span className="text-[10px] font-bold tracking-wider uppercase">
                  Auto-Refresh:
                </span>
                <select
                  value={refreshIntervalMs}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setRefreshIntervalMs(val)
                    if (typeof window !== "undefined") {
                      localStorage.setItem(
                        "riven_perps_refresh_interval",
                        String(val),
                      )
                    }
                  }}
                  className="cursor-pointer rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-2 py-1 text-xs text-[var(--rv-ink)] transition-colors outline-none hover:border-[var(--rv-blue)] focus:border-[var(--rv-blue)]"
                >
                  <option value={600000}>10m (Default)</option>
                  <option value={300000}>5m</option>
                  <option value={120000}>2m</option>
                  <option value={60000}>1m</option>
                  <option value={30000}>30s</option>
                  <option value={0}>Manual (Off)</option>
                </select>
              </div>
              <Freshness
                updatedAt={updatedAt}
                refreshing={refreshing}
                onRefresh={() => void loadData(false)}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <div className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-2.5">
              <div className="text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
                Win Rate
              </div>
              <div
                className="mt-1 text-lg font-extrabold"
                style={{
                  color:
                    stats.winRate >= 60 ? "var(--rv-up)" : "var(--rv-ink)",
                }}
              >
                {stats.winRate > 0 ? `${stats.winRate}%` : "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--rv-ink-3)]">
                {stats.wins} wins / {stats.confirmedTrades} confirmed
              </div>
            </div>

            <div className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-2.5">
              <div className="text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
                Stop-Loss Rate
              </div>
              <div
                className="mt-1 text-lg font-extrabold"
                style={{
                  color:
                    stats.stopLossRate > 35
                      ? "var(--rv-risk)"
                      : "var(--rv-ink)",
                }}
              >
                {stats.stopLossRate > 0 ? `${stats.stopLossRate}%` : "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--rv-ink-3)]">
                {stats.slHits} stops hit
              </div>
            </div>

            <div className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-2.5">
              <div className="text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
                Missed Entries
              </div>
              <div className="mt-1 text-lg font-extrabold text-[var(--rv-caution)]">
                {stats.missedEntries}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--rv-ink-3)]">
                Unfilled (Excluded)
              </div>
            </div>

            <div className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-2.5">
              <div className="text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
                Target Hits
              </div>
              <div className="mt-1 font-mono text-xs font-bold text-[var(--rv-ink)]">
                T1: {stats.perTargetHit.t1} · T2: {stats.perTargetHit.t2} · T3:{" "}
                {stats.perTargetHit.t3}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--rv-ink-3)]">
                T1: {stats.perTargetHit.t1Rate}% hit rate
              </div>
            </div>

            <div className="col-span-2 rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-2.5">
              <div className="text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
                Conviction Bands
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[11px]">
                <div>
                  <span className="text-[var(--rv-ink-3)]">
                    High (8-10):{" "}
                  </span>
                  <span className="font-bold text-[var(--rv-up)]">
                    {stats.confidenceBands.high.total > 0
                      ? `${stats.confidenceBands.high.winRate}%`
                      : "—"}
                  </span>
                  <span className="text-[10px] text-[var(--rv-ink-3)]">
                    {" "}
                    ({stats.confidenceBands.high.wins}/
                    {stats.confidenceBands.high.total})
                  </span>
                </div>
                <div>
                  <span className="text-[var(--rv-ink-3)]">Med (5-7): </span>
                  <span className="font-bold text-[var(--rv-ink)]">
                    {stats.confidenceBands.medium.total > 0
                      ? `${stats.confidenceBands.medium.winRate}%`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--rv-ink-3)]">Low (1-4): </span>
                  <span className="font-bold text-[var(--rv-ink-3)]">
                    {stats.confidenceBands.low.total > 0
                      ? `${stats.confidenceBands.low.winRate}%`
                      : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-1 text-[10px] text-[var(--rv-ink-3)]">
                Total resolved: {stats.totalResolved} calls
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-card)] p-3">
        {/* Left: Status & Exchanges */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Switcher */}
          <div className="flex border border-[var(--rv-stroke)]">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === "all"
                  ? "bg-[var(--rv-blue)] text-black"
                  : "text-[var(--rv-ink-2)] hover:text-white"
              }`}
            >
              All Signals
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("open")}
              className={`border-l border-[var(--rv-stroke)] px-3 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === "open"
                  ? "bg-[var(--rv-blue)] text-black"
                  : "text-[var(--rv-ink-2)] hover:text-white"
              }`}
            >
              Open Calls
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("resolved")}
              className={`border-l border-[var(--rv-stroke)] px-3 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === "resolved"
                  ? "bg-[var(--rv-blue)] text-black"
                  : "text-[var(--rv-ink-2)] hover:text-white"
              }`}
            >
              Resolved
            </button>
          </div>

          {/* Exchange Filter */}
          <div className="flex items-center gap-1">
            <span className="px-1 text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
              Venue:
            </span>
            {(["ALL", "BYBIT", "MEXC", "BINANCE"] as const).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setExchangeFilter(ex)}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                  exchangeFilter === ex
                    ? "border border-[var(--rv-blue)] bg-[var(--rv-blue)]/10 text-[var(--rv-blue)]"
                    : "border border-[var(--rv-stroke)] text-[var(--rv-ink-3)] hover:text-white"
                }`}
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Direction Filter */}
          <div className="flex items-center gap-1">
            <span className="px-1 text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
              Bias:
            </span>
            {(["ALL", "LONG", "SHORT"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBiasFilter(b)}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                  biasFilter === b
                    ? b === "LONG"
                      ? "border border-[var(--rv-up)] bg-[var(--rv-up)]/10 text-[var(--rv-up)]"
                      : b === "SHORT"
                        ? "border border-[var(--rv-down)] bg-[var(--rv-down)]/10 text-[var(--rv-down)]"
                        : "border border-[var(--rv-blue)] bg-[var(--rv-blue)]/10 text-[var(--rv-blue)]"
                    : "border border-[var(--rv-stroke)] text-[var(--rv-ink-3)] hover:text-white"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Search box */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter ticker (e.g. $SOL, BTC, ETH)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-2.5 py-1 text-xs text-[var(--rv-ink)] outline-none focus:border-[var(--rv-blue)]"
          />
        </div>
      </div>

      {/* All perp markets */}
      {displayedMarkets &&
        displayedMarkets.length > 0 &&
        (() => {
          const groups = {
            all: displayedMarkets,
            signal: displayedMarkets.filter((m) =>
              signalByCoin.has(m.symbol.toUpperCase()),
            ),
            meme: displayedMarkets.filter((m) => isMemePerp(m.symbol)),
            major: displayedMarkets.filter((m) => isMajorPerp(m.symbol)),
          }
          const list = groups[marketGroup]
          return (
            <div className="border border-[var(--rv-stroke)] bg-[var(--rv-card)]">
              <div className="flex items-center justify-between border-b border-[var(--rv-stroke)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ["all", "All"],
                      ["signal", "With signal"],
                      ["meme", "Meme coins"],
                      ["major", "Majors"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMarketGroup(id)}
                      aria-pressed={marketGroup === id}
                      className="px-2.5 py-1 text-[11px] font-bold"
                      style={{
                        color:
                          marketGroup === id ? "#fff" : "var(--rv-ink-3)",
                        background:
                          marketGroup === id ? "var(--rv-blue)" : "transparent",
                        boxShadow:
                          marketGroup === id
                            ? "none"
                            : "inset 0 0 0 1px var(--rv-stroke)",
                      }}
                    >
                      {label} ({groups[id].length})
                    </button>
                  ))}
                </div>
                <span className="hidden text-[10px] text-[var(--rv-ink-3)] sm:inline">
                  Signals first, then by volume · click to open
                </span>
              </div>
              <div className="grid gap-px bg-[var(--rv-stroke)] sm:grid-cols-2 lg:grid-cols-4">
                {(showAllMarkets || search || marketGroup !== "all"
                  ? list
                  : list.slice(0, 24)
                ).map((m) => {
                  const sig = signalByCoin.get(m.symbol.toUpperCase())
                  return (
                    <Link
                      key={m.symbol}
                      href={`/perps/${m.symbol}`}
                      className="flex items-center justify-between gap-2 bg-[var(--rv-card)] px-3 py-2 text-left hover:bg-[var(--rv-sunken)]"
                    >
                      <CoinIcon coin={m.symbol.toUpperCase()} size={22} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-extrabold">
                          {m.symbol}
                          {sig && (
                            <span
                              className="border px-1 text-[9px] font-bold"
                              style={{
                                borderColor:
                                  sig.bias === "LONG"
                                    ? "var(--rv-up)"
                                    : "var(--rv-down)",
                                color:
                                  sig.bias === "LONG"
                                    ? "var(--rv-up)"
                                    : "var(--rv-down)",
                              }}
                            >
                              {sig.bias} {sig.confidence}/10
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--rv-ink-3)]">
                          {priceUsd(m.markPrice)}
                        </div>
                      </div>
                      <span
                        className="font-mono text-xs font-bold"
                        style={{
                          color: m.change24h >= 0 ? "var(--rv-up)" : "var(--rv-down)",
                        }}
                      >
                        {m.change24h >= 0 ? "+" : ""}
                        {m.change24h.toFixed(2)}%
                      </span>
                    </Link>
                  )
                })}
              </div>
              {!showAllMarkets &&
                !search &&
                marketGroup === "all" &&
                list.length > 24 && (
                  <button
                    onClick={() => setShowAllMarkets(true)}
                    className="w-full border-t border-[var(--rv-stroke)] py-2 text-[11px] font-bold text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
                  >
                    Show all {list.length} markets
                  </button>
                )}
              {list.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-[var(--rv-ink-3)]">
                  {marketGroup === "signal"
                    ? "No open sakz-bot calls match a Hyperliquid market right now."
                    : "No markets in this group."}
                </div>
              )}
            </div>
          )
        })()}

      {/* Signals Content Grid */}
      <div id="perp-signals" className="flex scroll-mt-28 items-end justify-between gap-2 pt-2">
        <h2 className="text-[17px] font-bold tracking-tight text-[var(--rv-ink)]">
          Scanner calls
          {displayedSignals ? (
            <span className="rv-num ml-2 text-[12px] font-semibold text-[var(--rv-ink-3)]">{displayedSignals.length}</span>
          ) : null}
        </h2>
        <span className="text-[11.5px] text-[var(--rv-ink-3)]">From sakz-bot · tap a call to see the plan</span>
      </div>
      {loading && signals === null ? (
        <PerpsSignalsSkeleton />
      ) : displayedSignals && displayedSignals.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
          {displayedSignals.map((signal) => (
            <CallCard key={signal.id} signal={signal} onTrade={setSelectedSignal} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-card)] p-12 text-center">
          <div className=" text-sm font-bold text-[var(--rv-ink)]">
            No perpetual signals found
          </div>
          <p className="mt-1 max-w-md text-xs text-[var(--rv-ink-3)]">
            {statusFilter === "open"
              ? "There are currently no active open calls matching your filter criteria. Try toggling to 'Full History' or changing venue filters."
              : "No historical perpetual signals found in database. Signals generated by sakz-bot will automatically mirror here after scan cycles."}
          </p>
        </div>
      )}

      <NewsFeed />

      {/* Regulatory / Safe Terminal Disclaimer */}
      <div className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-3 text-[11px] text-[var(--rv-ink-3)]">
        <span className="font-bold text-[var(--rv-ink-2)]">Paper trading only:</span> {DISCLAIMER} Riven mirrors
        sakz-bot&apos;s scanner calls read-only. It never holds funds or places orders for you.
      </div>

      {/* Signal Detail & Order Modal */}
      <SignalOrderModal
        key={selectedSignal?.id ?? "closed"}
        signal={selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </div>
  )
}

function PerpsSignalsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-card)] p-4"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-3 h-10 w-full" />
          <Skeleton className="mt-3 h-3 w-40" />
        </div>
      ))}
    </div>
  )
}

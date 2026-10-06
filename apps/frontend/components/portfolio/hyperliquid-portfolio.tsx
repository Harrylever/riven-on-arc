"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePortfolio, getAccountsRegistry } from "@/hooks/use-portfolio"
import { useAuth } from "@/components/auth/auth-provider"
import { priceUsd, ago } from "@/lib/format"
import type { PortfolioHolding } from "@/app/api/portfolio/route"
import type { PerpSignal } from "@/components/terminal/perps-panel"

type MainTab =
  | "balances"
  | "positions"
  | "outcomes"
  | "openOrders"
  | "twap"
  | "chase"
  | "tradeHistory"
  | "fundingHistory"
  | "orderHistory"
  | "interest"
  | "depositsWithdrawals"

type ChartTab = "accountValue" | "pnl" | "perpsPnl"

export function HyperliquidPortfolio() {
  const {
    accountId,
    accountLabel,
    cashBalance,
    positions,
    openOrders,
    tradeHistory,
    day14Volume,
    totalVolume,
    totalEquity,
    tradingEquity,
    totalUnrealizedPnl,
    positionMargin,
    closePosition,
    cancelOrder,
    deposit,
    withdraw,
    resetPortfolio,
    switchAccount,
    createAccount,
  } = usePortfolio()

  const { authenticated, profile, authFetch } = useAuth()
  const wallet = profile?.walletAddress ?? null

  // Tab & Filter states
  const [activeTab, setActiveTab] = useState<MainTab>("positions")
  const [chartTab, setChartTab] = useState<ChartTab>("pnl")
  const [chartTimeframe] = useState<"30D" | "7D" | "24H">("30D")
  const [sideFilter, setSideFilter] = useState<"ALL" | "BUY" | "SELL">("ALL")
  const [marketFilter, setMarketFilter] = useState<string>("ALL")

  // Modals for header buttons
  const [isDepositOpen, setIsDepositOpen] = useState(false)
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false)
  const [isAccountTypeOpen, setIsAccountTypeOpen] = useState(false)
  const [newAccountInput, setNewAccountInput] = useState("")
  const [depositAmount, setDepositAmount] = useState("5000")
  const [withdrawAmount, setWithdrawAmount] = useState("1000")

  const accountsList = useMemo(() => getAccountsRegistry(), [])

  // On-chain SPL holdings for Balances tab
  const [splHoldings, setSplHoldings] = useState<PortfolioHolding[]>([])
  const [splLoading, setSplLoading] = useState(false)

  // Perp outcomes for Outcomes tab
  const [outcomes, setOutcomes] = useState<PerpSignal[]>([])
  const [outcomesLoading, setOutcomesLoading] = useState(false)

  // Load SPL holdings if wallet authenticated
  useEffect(() => {
    if (!authenticated || !wallet) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSplLoading(true)
    authFetch("/api/portfolio")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((j) => {
        if (!cancelled) setSplHoldings(j.holdings ?? [])
      })
      .catch(() => {
        if (!cancelled) setSplHoldings([])
      })
      .finally(() => {
        if (!cancelled) setSplLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authenticated, wallet, authFetch])

  // Load outcomes for Outcomes tab
  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOutcomesLoading(true)
    fetch("/api/perp-signals?status=all&take=50")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.signals) {
          setOutcomes(j.signals)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOutcomesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Filtered positions
  const filteredPositions = useMemo(() => {
    return positions.filter((p) => {
      if (sideFilter === "BUY" && p.side !== "LONG") return false
      if (sideFilter === "SELL" && p.side !== "SHORT") return false
      if (marketFilter !== "ALL" && !p.market.includes(marketFilter))
        return false
      return true
    })
  }, [positions, sideFilter, marketFilter])

  // Distinct markets for dropdown
  const uniqueMarkets = useMemo(() => {
    const set = new Set<string>()
    positions.forEach((p) => set.add(p.market))
    openOrders.forEach((o) => set.add(o.market))
    return Array.from(set)
  }, [positions, openOrders])

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = Number(depositAmount)
    if (amt > 0) {
      deposit(amt)
      setIsDepositOpen(false)
    }
  }

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = Number(withdrawAmount)
    if (amt > 0) {
      try {
        withdraw(amt)
        setIsWithdrawOpen(false)
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Withdrawal failed")
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#040e0c] text-[#cfdeda]">
      <div className="mx-auto w-full max-w-[1440px] px-3 py-6 sm:px-6">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-3xl font-extrabold tracking-tight text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Portfolio
            </h1>
            <button
              type="button"
              onClick={() => setIsAccountTypeOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-[#2ee6a8]/30 bg-[#2ee6a8]/10 px-3 py-1 text-xs font-bold text-[#2ee6a8] transition-colors hover:border-[#2ee6a8] hover:bg-[#2ee6a8]/20"
              title="Click to view and switch tied account"
            >
              <span className="size-2 animate-pulse rounded-full bg-[#2ee6a8]" />
              <span>Account: {accountLabel}</span>
              <span className="text-[10px] text-[#749b94]">⌵</span>
            </button>
          </div>

          {/* Quick Action Pill Buttons (matching screenshot) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                alert(
                  "Staking integration active. Earn up to 6.2% APR on USDC/SOL reserves.",
                )
              }
              className="rounded-md border border-[#1a3832] bg-[#071a17] px-3 py-1.5 text-xs font-semibold text-[#749b94] transition-colors hover:border-[#2ee6a8] hover:text-white"
            >
              Link Staking
            </button>
            <button
              type="button"
              onClick={() =>
                alert(
                  "Swap stablecoins fee-free with zero slippage between USDC and USDH.",
                )
              }
              className="rounded-md border border-[#1a3832] bg-[#071a17] px-3 py-1.5 text-xs font-semibold text-[#749b94] transition-colors hover:border-[#2ee6a8] hover:text-white"
            >
              Swap Stablecoins
            </button>
            <button
              type="button"
              onClick={() =>
                alert("Bridge between Solana EVM and Core Execution Layer.")
              }
              className="rounded-md border border-[#1a3832] bg-[#071a17] px-3 py-1.5 text-xs font-semibold text-[#749b94] transition-colors hover:border-[#2ee6a8] hover:text-white"
            >
              EVM ⇄ Core
            </button>
            <button
              type="button"
              onClick={() => setIsAccountTypeOpen(true)}
              className="rounded-md border border-[#1a3832] bg-[#071a17] px-3 py-1.5 text-xs font-semibold text-[#749b94] transition-colors hover:border-[#2ee6a8] hover:text-white"
            >
              Account Type
            </button>
            <button
              type="button"
              onClick={() => alert("Internal transfer or external Send.")}
              className="rounded-md border border-[#1a3832] bg-[#071a17] px-3 py-1.5 text-xs font-semibold text-[#749b94] transition-colors hover:border-[#2ee6a8] hover:text-white"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => setIsWithdrawOpen(true)}
              className="rounded-md border border-[#1a3832] bg-[#071a17] px-3 py-1.5 text-xs font-semibold text-[#749b94] transition-colors hover:border-[#2ee6a8] hover:text-white"
            >
              Withdraw
            </button>
            <button
              type="button"
              onClick={() => setIsDepositOpen(true)}
              className="rounded-md border border-[#23c49b] bg-[#1ba684] px-4 py-1.5 text-xs font-bold text-black transition-colors hover:bg-[#23c49b]"
            >
              Deposit
            </button>
          </div>
        </div>

        {/* Overview Metric Cards Grid */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {/* Card 1 & Card 2: Left Stacked Column (3 cols) */}
          <div className="flex flex-col gap-3 md:col-span-3">
            {/* 14 Day Volume */}
            <div className="flex flex-1 flex-col justify-between rounded-md border border-[#152e29] bg-[#081815] p-4">
              <div>
                <span className="text-xs font-semibold text-[#749b94]">
                  14 Day Volume
                </span>
                <div className="mt-2 text-2xl font-extrabold text-white">
                  $
                  {day14Volume.toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("tradeHistory")}
                className="mt-3 text-left text-xs font-semibold text-[#2ee6a8] hover:underline"
              >
                View Volume
              </button>
            </div>

            {/* Fees (Taker / Maker) */}
            <div className="flex flex-1 flex-col justify-between rounded-md border border-[#152e29] bg-[#081815] p-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#749b94]">
                    Fees (Taker / Maker)
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[#749b94]">
                    Perps ⌵
                  </span>
                </div>
                <div className="mt-2 text-xl font-extrabold text-white">
                  0.0450% / 0.0150%
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  alert(
                    "Standard Tier: Taker 0.0450%, Maker 0.0150%. 10% discount applies for $ANSEM holders.",
                  )
                }
                className="mt-3 text-left text-xs font-semibold text-[#2ee6a8] hover:underline"
              >
                View Fee Schedule
              </button>
            </div>
          </div>

          {/* Card 3: Performance Summary List (4 cols) */}
          <div className="rounded-md border border-[#152e29] bg-[#081815] p-4 md:col-span-4">
            <div className="flex items-center justify-between border-b border-[#152e29] pb-2 text-xs font-semibold text-[#749b94]">
              <span className="cursor-pointer hover:text-white">
                Perps + Spot + Vaults ⌵
              </span>
              <span className="cursor-pointer hover:text-white">30D ⌵</span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="border-b border-dashed border-[#2a4d46] text-[#749b94]">
                  PNL
                </span>
                <span
                  className="font-mono font-bold"
                  style={{
                    color:
                      totalUnrealizedPnl > 0
                        ? "#2ee6a8"
                        : totalUnrealizedPnl < 0
                          ? "#ef4444"
                          : "#ffffff",
                  }}
                >
                  ${totalUnrealizedPnl.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="border-b border-dashed border-[#2a4d46] text-[#749b94]">
                  Volume
                </span>
                <span className="font-mono font-bold text-white">
                  $
                  {totalVolume.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#749b94]">Max Drawdown</span>
                <span className="font-mono font-bold text-white">0.00%</span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#749b94]">Total Equity</span>
                <span className="font-mono font-bold text-white">
                  $
                  {totalEquity.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="border-b border-dashed border-[#2a4d46] text-[#749b94]">
                  Trading Equity
                </span>
                <span className="font-mono font-bold text-white">
                  $
                  {tradingEquity.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#749b94]">Earn Balance</span>
                <span className="font-mono font-bold text-white">$0.00</span>
              </div>
            </div>
          </div>

          {/* Card 4: Interactive Chart Card (5 cols) */}
          <div className="flex flex-col justify-between rounded-md border border-[#152e29] bg-[#081815] p-4 md:col-span-5">
            {/* Chart Sub-Tabs */}
            <div className="flex items-center justify-between border-b border-[#152e29] pb-2">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setChartTab("accountValue")}
                  className={`transition-colors ${
                    chartTab === "accountValue"
                      ? "border-b-2 border-[#2ee6a8] pb-1 text-white"
                      : "text-[#749b94] hover:text-white"
                  }`}
                >
                  Account Value
                </button>
                <button
                  type="button"
                  onClick={() => setChartTab("pnl")}
                  className={`transition-colors ${
                    chartTab === "pnl"
                      ? "border-b-2 border-[#2ee6a8] pb-1 text-white"
                      : "text-[#749b94] hover:text-white"
                  }`}
                >
                  PNL
                </button>
                <button
                  type="button"
                  onClick={() => setChartTab("perpsPnl")}
                  className={`transition-colors ${
                    chartTab === "perpsPnl"
                      ? "border-b-2 border-[#2ee6a8] pb-1 text-white"
                      : "text-[#749b94] hover:text-white"
                  }`}
                >
                  Perps PNL
                </button>
              </div>

              <div className="text-xs font-semibold text-[#749b94]">
                <span>{chartTimeframe} ⌵</span>
              </div>
            </div>

            {/* Chart Graphic Area */}
            <div className="relative mt-3 flex h-36 w-full items-end justify-between font-mono text-[10px] text-[#4d706a]">
              {/* Y Axis scale markers matching screenshot */}
              <div className="flex h-full flex-col justify-between pr-2 text-right">
                <span>3</span>
                <span>2</span>
                <span>1</span>
                <span>0</span>
              </div>

              {/* Chart baseline & performance curve */}
              <div className="relative h-full flex-1">
                {/* Horizontal gridlines */}
                <div className="absolute inset-0 flex flex-col justify-between opacity-20">
                  <div className="border-b border-[#2ee6a8]/40" />
                  <div className="border-b border-[#2ee6a8]/40" />
                  <div className="border-b border-[#2ee6a8]/40" />
                  <div className="border-b border-white" />
                </div>

                {/* SVG Performance line */}
                <svg
                  className="absolute inset-0 size-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  {totalUnrealizedPnl === 0 ? (
                    // Flat baseline line at 0 (exact look of screenshot)
                    <line
                      x1="0"
                      y1="98%"
                      x2="100%"
                      y2="98%"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  ) : (
                    // Curve based on current equity
                    <polyline
                      fill="none"
                      stroke={totalUnrealizedPnl >= 0 ? "#2ee6a8" : "#ef4444"}
                      strokeWidth="2"
                      points="0,135 40,135 80,120 140,110 200,90 280,60 360,40"
                    />
                  )}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Multi-Tab Section (Positions, Balances, Outcomes, Orders...) */}
        <div className="mt-5 rounded-md border border-[#152e29] bg-[#081815]">
          {/* Tab Strip + Filter Dropdowns */}
          <div className="flex flex-wrap items-center justify-between border-b border-[#152e29] px-3 pt-2">
            {/* Scrollable Tab Strip */}
            <div className="no-scrollbar flex overflow-x-auto text-xs font-semibold">
              {(
                [
                  { id: "balances", label: "Balances" },
                  { id: "positions", label: "Positions" },
                  { id: "outcomes", label: "Outcomes" },
                  { id: "openOrders", label: "Open Orders" },
                  { id: "twap", label: "TWAP" },
                  { id: "chase", label: "Chase" },
                  { id: "tradeHistory", label: "Trade History" },
                  { id: "fundingHistory", label: "Funding History" },
                  { id: "orderHistory", label: "Order History" },
                  { id: "interest", label: "Interest" },
                  {
                    id: "depositsWithdrawals",
                    label: "Deposits and Withdrawals",
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2.5 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "border-b-2 border-[#2ee6a8] font-bold text-white"
                      : "text-[#749b94] hover:text-white"
                  }`}
                >
                  {tab.label}
                  {tab.id === "positions" && positions.length > 0 && (
                    <span className="py-0.2 ml-1.5 rounded-full bg-[#2ee6a8]/20 px-1.5 text-[10px] text-[#2ee6a8]">
                      {positions.length}
                    </span>
                  )}
                  {tab.id === "openOrders" && openOrders.length > 0 && (
                    <span className="py-0.2 ml-1.5 rounded-full bg-[#1a3832] px-1.5 text-[10px] text-white">
                      {openOrders.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Right Side Filter Controls */}
            <div className="my-2 flex items-center gap-3 text-xs font-semibold text-[#749b94]">
              {/* Side Filter */}
              <div className="flex items-center gap-1">
                <span>Side ⌵</span>
                <select
                  value={sideFilter}
                  onChange={(e) =>
                    setSideFilter(e.target.value as "ALL" | "BUY" | "SELL")
                  }
                  className="bg-transparent text-[#2ee6a8] outline-none"
                >
                  <option value="ALL" className="bg-[#081815] text-white">
                    All
                  </option>
                  <option value="BUY" className="bg-[#081815] text-white">
                    Buy / Long
                  </option>
                  <option value="SELL" className="bg-[#081815] text-white">
                    Sell / Short
                  </option>
                </select>
              </div>

              {/* Market Filter */}
              <div className="flex items-center gap-1">
                <span>Market ⌵</span>
                <select
                  value={marketFilter}
                  onChange={(e) => setMarketFilter(e.target.value)}
                  className="bg-transparent text-[#2ee6a8] outline-none"
                >
                  <option value="ALL" className="bg-[#081815] text-white">
                    All Markets
                  </option>
                  {uniqueMarkets.map((m) => (
                    <option
                      key={m}
                      value={m}
                      className="bg-[#081815] text-white"
                    >
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tab 1: POSITIONS (Default Active) */}
          {activeTab === "positions" && (
            <div className="overflow-x-auto">
              {filteredPositions.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#749b94]">
                  No open positions yet
                  <div className="mt-2">
                    <Link
                      href="/perps"
                      className="font-bold text-[#2ee6a8] hover:underline"
                    >
                      Browse live signals and open a position →
                    </Link>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#152e29] text-[11px] font-bold text-[#749b94]">
                      <th className="px-4 py-2.5">Market</th>
                      <th className="px-4 py-2.5">Size</th>
                      <th className="px-4 py-2.5">Position Value ⌵</th>
                      <th className="px-4 py-2.5">Entry Price</th>
                      <th className="px-4 py-2.5">Mark Price</th>
                      <th className="px-4 py-2.5">
                        <span className="border-b border-dashed border-[#2a4d46]">
                          PNL [ROE %]
                        </span>
                      </th>
                      <th className="px-4 py-2.5">Liq. Price</th>
                      <th className="px-4 py-2.5">Margin</th>
                      <th className="px-4 py-2.5">
                        <span className="border-b border-dashed border-[#2a4d46]">
                          Funding
                        </span>
                      </th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#152e29] font-mono">
                    {filteredPositions.map((pos) => (
                      <tr
                        key={pos.id}
                        className="transition-colors hover:bg-[#0c221e]"
                      >
                        <td className="px-4 py-3 font-sans">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">
                              {pos.market}
                            </span>
                            <span
                              className="rounded px-1 py-0.5 text-[9px] font-black"
                              style={{
                                backgroundColor:
                                  pos.side === "LONG"
                                    ? "rgba(46, 230, 168, 0.15)"
                                    : "rgba(239, 68, 68, 0.15)",
                                color:
                                  pos.side === "LONG" ? "#2ee6a8" : "#ef4444",
                              }}
                            >
                              {pos.side} {pos.leverage}x
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white">{pos.size}</td>
                        <td className="px-4 py-3 text-white">
                          ${pos.positionValue.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          {priceUsd(pos.entryPrice)}
                        </td>
                        <td className="px-4 py-3 text-white">
                          {priceUsd(pos.markPrice)}
                        </td>
                        <td
                          className="px-4 py-3 font-bold"
                          style={{
                            color: pos.pnl >= 0 ? "#2ee6a8" : "#ef4444",
                          }}
                        >
                          ${pos.pnl.toFixed(2)} [{pos.roe.toFixed(2)}%]
                        </td>
                        <td className="px-4 py-3 text-amber-400">
                          {pos.liqPrice > 0 ? priceUsd(pos.liqPrice) : "—"}
                        </td>
                        <td className="px-4 py-3">${pos.margin.toFixed(2)}</td>
                        <td className="px-4 py-3 text-[#749b94]">
                          ${pos.funding.toFixed(3)}
                        </td>
                        <td className="px-4 py-3 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => closePosition(pos.id)}
                            className="rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-400 transition-colors hover:bg-red-500 hover:text-white"
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 2: BALANCES (Cash Margin + On-chain SPL Tokens) */}
          {activeTab === "balances" && (
            <div className="p-4">
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded border border-[#152e29] bg-[#0c221e] p-3">
                  <div className="text-[11px] font-bold text-[#749b94] uppercase">
                    Available Margin Cash
                  </div>
                  <div className="mt-1 text-xl font-extrabold text-white">
                    ${cashBalance.toFixed(2)}
                  </div>
                </div>
                <div className="rounded border border-[#152e29] bg-[#0c221e] p-3">
                  <div className="text-[11px] font-bold text-[#749b94] uppercase">
                    Position Margin Locked
                  </div>
                  <div className="mt-1 text-xl font-extrabold text-white">
                    ${positionMargin.toFixed(2)}
                  </div>
                </div>
                <div className="rounded border border-[#152e29] bg-[#0c221e] p-3">
                  <div className="text-[11px] font-bold text-[#749b94] uppercase">
                    Total Equity
                  </div>
                  <div className="mt-1 text-xl font-extrabold text-[#2ee6a8]">
                    ${totalEquity.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Connected Solana Wallet SPL Tokens */}
              <div className="mt-4 border-t border-[#152e29] pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Connected Wallet On-Chain SPL Holdings
                  </span>
                  <span className="text-[11px] text-[#749b94]">
                    {wallet
                      ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}`
                      : "No wallet linked"}
                  </span>
                </div>

                {splLoading ? (
                  <div className="py-6 text-center text-xs text-[#749b94]">
                    Reading live Solana token balances…
                  </div>
                ) : splHoldings.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#749b94]">
                    No on-chain SPL tokens detected. Link your Phantom/Solflare
                    wallet to view spot balances.
                  </div>
                ) : (
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#152e29] text-[10px] text-[#749b94]">
                        <th className="py-2">Token</th>
                        <th className="py-2">Balance</th>
                        <th className="py-2">Price</th>
                        <th className="py-2 text-right">Value (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#152e29]">
                      {splHoldings.map((h) => (
                        <tr key={h.mint}>
                          <td className="py-2.5 font-sans font-bold text-white">
                            {h.symbol}
                          </td>
                          <td className="py-2.5">{h.uiAmount}</td>
                          <td className="py-2.5">{priceUsd(h.priceUsd)}</td>
                          <td className="py-2.5 text-right font-bold text-[#2ee6a8]">
                            {h.valueUsd ? `$${h.valueUsd.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: OUTCOMES (ClawDex / sakz-bot Signals Track Record) */}
          {activeTab === "outcomes" && (
            <div className="overflow-x-auto p-4">
              <div className="mb-3 text-xs text-[#749b94]">
                Verified outcomes from the statistical perpetual signal engine.
              </div>
              {outcomesLoading ? (
                <div className="py-8 text-center text-xs text-[#749b94]">
                  Loading signal outcomes…
                </div>
              ) : outcomes.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#749b94]">
                  No resolved signals found.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#152e29] text-[10px] font-bold text-[#749b94]">
                      <th className="py-2">Pair</th>
                      <th className="py-2">Exchange</th>
                      <th className="py-2">Bias</th>
                      <th className="py-2">Tracked Entry</th>
                      <th className="py-2">Stop Loss</th>
                      <th className="py-2">Target 1</th>
                      <th className="py-2">Outcome</th>
                      <th className="py-2 text-right">Age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#152e29] font-mono">
                    {outcomes.map((o) => (
                      <tr key={o.id} className="hover:bg-[#0c221e]">
                        <td className="py-2.5 font-sans font-bold text-white">
                          {o.symbol}
                        </td>
                        <td className="py-2.5 text-[#749b94] uppercase">
                          {o.exchange}
                        </td>
                        <td
                          className="py-2.5 font-bold"
                          style={{
                            color: o.bias === "LONG" ? "#2ee6a8" : "#ef4444",
                          }}
                        >
                          {o.bias}
                        </td>
                        <td className="py-2.5">{priceUsd(o.entryPrice)}</td>
                        <td className="py-2.5 text-red-400">
                          {priceUsd(o.stopLoss)}
                        </td>
                        <td className="py-2.5 text-[#2ee6a8]">
                          {priceUsd(o.t1)}
                        </td>
                        <td className="py-2.5 font-sans font-bold">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              o.outcome.includes("hit")
                                ? "bg-[#2ee6a8]/20 text-[#2ee6a8]"
                                : o.outcome === "sl_hit"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-gray-700 text-gray-300"
                            }`}
                          >
                            {o.outcome}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-sans text-[#749b94]">
                          {ago(o.scanTime)} ago
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 4: OPEN ORDERS */}
          {activeTab === "openOrders" && (
            <div className="overflow-x-auto p-4">
              {openOrders.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#749b94]">
                  No open orders
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#152e29] text-[10px] font-bold text-[#749b94]">
                      <th className="py-2">Time</th>
                      <th className="py-2">Market</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Side</th>
                      <th className="py-2">Order Price</th>
                      <th className="py-2">Size</th>
                      <th className="py-2">Value</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#152e29] font-mono">
                    {openOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#0c221e]">
                        <td className="py-2.5 font-sans text-[#749b94]">
                          {new Date(ord.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 font-sans font-bold text-white">
                          {ord.market}
                        </td>
                        <td className="py-2.5 text-[#2ee6a8]">{ord.type}</td>
                        <td
                          className="py-2.5 font-bold"
                          style={{
                            color:
                              ord.side === "LONG" || ord.side === "BUY"
                                ? "#2ee6a8"
                                : "#ef4444",
                          }}
                        >
                          {ord.side}
                        </td>
                        <td className="py-2.5">{priceUsd(ord.orderPrice)}</td>
                        <td className="py-2.5 text-white">{ord.size}</td>
                        <td className="py-2.5 text-white">
                          ${ord.value.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => cancelOrder(ord.id)}
                            className="rounded border border-[#1a3832] px-2 py-0.5 text-[10px] text-red-400 hover:border-red-400"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 5: TRADE HISTORY */}
          {activeTab === "tradeHistory" && (
            <div className="overflow-x-auto p-4">
              {tradeHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#749b94]">
                  No trade history yet
                </div>
              ) : (
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-[#152e29] text-[10px] font-bold text-[#749b94]">
                      <th className="py-2">Time</th>
                      <th className="py-2">Market</th>
                      <th className="py-2">Side</th>
                      <th className="py-2">Price</th>
                      <th className="py-2">Size</th>
                      <th className="py-2">Fee</th>
                      <th className="py-2 text-right">Realized PNL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#152e29]">
                    {tradeHistory.map((trd) => (
                      <tr key={trd.id} className="hover:bg-[#0c221e]">
                        <td className="py-2.5 font-sans text-[#749b94]">
                          {new Date(trd.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 font-sans font-bold text-white">
                          {trd.market}
                        </td>
                        <td
                          className="py-2.5 font-bold"
                          style={{
                            color:
                              trd.side === "LONG" || trd.side === "BUY"
                                ? "#2ee6a8"
                                : "#ef4444",
                          }}
                        >
                          {trd.side}
                        </td>
                        <td className="py-2.5">{priceUsd(trd.price)}</td>
                        <td className="py-2.5">{trd.size}</td>
                        <td className="py-2.5 text-[#749b94]">
                          ${trd.fee.toFixed(3)}
                        </td>
                        <td
                          className="py-2.5 text-right font-bold"
                          style={{
                            color: trd.pnl >= 0 ? "#2ee6a8" : "#ef4444",
                          }}
                        >
                          ${trd.pnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Placeholder for TWAP / Chase / Funding / Order History / Interest / Deposits */}
          {[
            "twap",
            "chase",
            "fundingHistory",
            "orderHistory",
            "interest",
            "depositsWithdrawals",
          ].includes(activeTab) && (
            <div className="py-12 text-center text-xs text-[#749b94]">
              No {activeTab.replace(/([A-Z])/g, " $1").toLowerCase()} records
              found for this period.
            </div>
          )}
        </div>
      </div>

      {/* Deposit Modal */}
      {isDepositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-md border border-[#1a3832] bg-[#081815] p-5 text-white shadow-xl">
            <h3 className="text-base font-extrabold">
              Deposit Test / Demo Funds
            </h3>
            <p className="mt-1 text-xs text-[#749b94]">
              Instantly credit paper margin cash to test orders and portfolio
              positions.
            </p>
            <form onSubmit={handleDepositSubmit} className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-[#749b94]">Amount (USD)</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-[#152e29] bg-[#040e0c] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#2ee6a8]"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositOpen(false)}
                  className="flex-1 rounded border border-[#152e29] py-2 text-xs font-semibold text-[#749b94] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded bg-[#2ee6a8] py-2 text-xs font-bold text-black hover:bg-[#25c48f]"
                >
                  Deposit Funds
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {isWithdrawOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-md border border-[#1a3832] bg-[#081815] p-5 text-white shadow-xl">
            <h3 className="text-base font-extrabold">Withdraw Funds</h3>
            <p className="mt-1 text-xs text-[#749b94]">
              Withdraw available cash balance (${cashBalance.toFixed(2)}{" "}
              available).
            </p>
            <form onSubmit={handleWithdrawSubmit} className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-[#749b94]">Amount (USD)</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-[#152e29] bg-[#040e0c] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#2ee6a8]"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWithdrawOpen(false)}
                  className="flex-1 rounded border border-[#152e29] py-2 text-xs font-semibold text-[#749b94] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded bg-red-500 py-2 text-xs font-bold text-white hover:bg-red-600"
                >
                  Withdraw
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Settings & Switcher Modal */}
      {isAccountTypeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-md border border-[#1a3832] bg-[#081815] p-5 text-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#152e29] pb-3">
              <div>
                <h3 className="text-base font-extrabold">
                  Account Identity & Stats
                </h3>
                <p className="mt-0.5 text-xs text-[#749b94]">
                  Portfolio metrics and positions are strictly tied to this
                  account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountTypeOpen(false)}
                className="text-[#749b94] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-2 text-xs text-[#749b94]">
              <div className="flex justify-between border-b border-[#152e29] pb-2">
                <span>Active Account ID:</span>
                <span className="max-w-[200px] truncate font-mono font-bold text-[#2ee6a8]">
                  {accountId}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#152e29] pb-2">
                <span>Account Display:</span>
                <span className="font-bold text-white">{accountLabel}</span>
              </div>
              <div className="flex justify-between border-b border-[#152e29] pb-2">
                <span>Margin Mode:</span>
                <span className="font-bold text-[#2ee6a8]">
                  Cross Margin (Unified)
                </span>
              </div>
              <div className="flex justify-between border-b border-[#152e29] pb-2">
                <span>Execution Tier:</span>
                <span className="font-bold text-white">
                  Individual Account Isolated
                </span>
              </div>
            </div>

            {/* Switch Account Section */}
            <div className="mt-4 border-t border-[#152e29] pt-3">
              <div className="mb-2 text-xs font-bold text-white">
                Switch or Bind Account:
              </div>
              <div className="max-h-32 space-y-1.5 overflow-y-auto">
                {accountsList.map((acc) => (
                  <div
                    key={acc}
                    className={`flex items-center justify-between rounded border p-2 text-xs ${
                      acc === accountId
                        ? "border-[#2ee6a8] bg-[#2ee6a8]/10 text-white"
                        : "border-[#152e29] bg-[#0c221e] text-[#749b94]"
                    }`}
                  >
                    <span className="max-w-[220px] truncate font-mono">
                      {acc} {acc === accountId ? "(Active)" : ""}
                    </span>
                    {acc !== accountId && (
                      <button
                        type="button"
                        onClick={() => switchAccount(acc)}
                        className="rounded bg-[#2ee6a8] px-2 py-0.5 text-[11px] font-bold text-black hover:bg-[#25c48f]"
                      >
                        Switch
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add / Create Account */}
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="New account name or wallet…"
                  value={newAccountInput}
                  onChange={(e) => setNewAccountInput(e.target.value)}
                  className="flex-1 rounded border border-[#152e29] bg-[#040e0c] px-2.5 py-1 text-xs text-white outline-none focus:border-[#2ee6a8]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newAccountInput.trim()
                    if (trimmed) {
                      createAccount(trimmed)
                      setNewAccountInput("")
                    }
                  }}
                  className="rounded border border-[#1a3832] bg-[#0c221e] px-3 py-1 text-xs font-bold text-[#2ee6a8] hover:border-[#2ee6a8]"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={resetPortfolio}
                className="flex-1 rounded border border-red-500/40 bg-red-500/10 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500 hover:text-white"
              >
                Reset This Account Stats
              </button>
              <button
                type="button"
                onClick={() => setIsAccountTypeOpen(false)}
                className="flex-1 rounded bg-[#2ee6a8] py-1.5 text-xs font-bold text-black hover:bg-[#25c48f]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

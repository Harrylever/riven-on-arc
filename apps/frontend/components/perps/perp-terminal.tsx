"use client"

import { useEffect, useState } from "react"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { PerpMarketPicker } from "@/components/perps/perp-market-picker"
import { PerpTradePanel } from "@/components/perps/perp-trade-panel"
import { TradingViewChart } from "@/components/perps/tradingview-chart"
import { usePortfolio } from "@/hooks/use-portfolio"
import type { PerpMarket, PerpOrderbook } from "@/lib/hyperliquid"
import { priceUsd } from "@/lib/format"
import { tradingViewSymbol } from "@/lib/perp-trade-setup"

type BottomTab = "positions" | "orders" | "history"

const compact = (n: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n)

/**
 * Single-screen perps terminal: stats strip on top, chart | order book | trade
 * form in the middle, positions / orders / history along the bottom.
 */
export function PerpTerminal({
  market,
  markets,
  signal,
  signalByCoin,
  onSelect,
}: {
  market: PerpMarket
  markets: PerpMarket[]
  signal: PerpSignal | null
  signalByCoin: Map<string, PerpSignal>
  onSelect: (symbol: string) => void
}) {
  const up = market.change24h >= 0
  const [view, setView] = useState<"chart" | "trade">("chart")

  return (
    <div className="border border-[var(--border)] bg-[var(--surface)]">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--border)] px-3 py-2.5">
        <PerpMarketPicker
          market={market}
          markets={markets}
          signalByCoin={signalByCoin}
          onSelect={onSelect}
        />
        <div>
          <span className="font-mono text-xl font-extrabold">
            {priceUsd(market.markPrice)}
          </span>{" "}
          <span
            className="font-mono text-xs font-bold"
            style={{ color: up ? "var(--up)" : "var(--down)" }}
          >
            {up ? "+" : ""}
            {market.change24h.toFixed(2)}%
          </span>
        </div>
        <Stat label="24H Volume" value={`$${compact(market.volume24h)}`} />
        <Stat
          label="Open Interest"
          value={`$${compact(market.openInterestUsd)}`}
        />
        <Stat
          label="Funding (APR)"
          value={`${market.fundingApr.toFixed(1)}%`}
          color={market.fundingApr >= 0 ? "var(--up)" : "var(--down)"}
        />
        <Stat label="Max Leverage" value={`${market.maxLeverage}x`} />
        {signal && (
          <span
            className="border px-2 py-0.5 text-[10px] font-extrabold"
            style={{
              borderColor: signal.bias === "LONG" ? "var(--up)" : "var(--down)",
              color: signal.bias === "LONG" ? "var(--up)" : "var(--down)",
            }}
          >
            SIGNAL {signal.bias} {signal.confidence}/10
          </span>
        )}
      </div>

      {/* Two sections per market: Chart (TradingView, with drawing tools) and Trade */}
      <div
        className="flex border-b border-[var(--border)]"
        role="tablist"
        aria-label={`${market.symbol} sections`}
      >
        {(["chart", "trade"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className="rv-body flex-1 py-2.5 text-[13px] font-bold tracking-wide uppercase transition-colors sm:flex-none sm:px-8"
            style={{
              color: view === v ? "#fff" : "var(--text-muted)",
              background: view === v ? "rgba(124, 196, 232, 0.16)" : "transparent",
              boxShadow: view === v ? "inset 0 -2px 0 var(--brand)" : "none",
            }}
          >
            {v === "chart" ? "Chart" : "Trade"}
          </button>
        ))}
        <span className="rv-body ml-auto hidden self-center px-3 text-[11px] text-[var(--text-muted)] sm:block">
          {view === "chart"
            ? "Draw trendlines, fibs and more with the toolbar on the left"
            : "Paper account · USDC or USDT"}
        </span>
      </div>

      {view === "chart" ? (
        <div className="h-[460px] sm:h-[640px]">
          <TradingViewChart
            key={market.symbol}
            symbol={tradingViewSymbol(market.symbol)}
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="h-[420px] overflow-hidden border-b border-[var(--border)] lg:h-[640px] lg:border-r lg:border-b-0">
            <OrderBook coin={market.symbol} markPrice={market.markPrice} />
          </div>
          <div className="mx-auto w-full max-w-[560px] lg:max-h-[640px] lg:overflow-y-auto">
            <PerpTradePanel
              key={market.symbol}
              market={market}
              signal={signal}
            />
          </div>
        </div>
      )}

      <BottomTabs coin={market.symbol} />
    </div>
  )
}

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-xs font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function OrderBook({ coin, markPrice }: { coin: string; markPrice: number }) {
  const [book, setBook] = useState<PerpOrderbook | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/perps/${coin}`, { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setBook(json.orderbook ?? null)
      } catch {
        // keep the last good book
      }
    }
    void load()
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 4_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [coin])

  if (!book) {
    return (
      <div className="p-3 text-xs text-[var(--text-muted)]">
        Loading order book…
      </div>
    )
  }

  const max = Math.max(
    book.asks[book.asks.length - 1]?.total ?? 1,
    book.bids[book.bids.length - 1]?.total ?? 1,
  )
  const asks = [...book.asks].reverse()

  const rows = (levels: typeof asks, color: string) =>
    levels.map((l) => (
      <div
        key={l.price}
        className="relative flex justify-between px-3 py-[3px] font-mono text-[11px]"
      >
        <div
          className="absolute inset-y-0 right-0 opacity-15"
          style={{ width: `${(l.total / max) * 100}%`, background: color }}
        />
        <span className="relative" style={{ color }}>
          {priceUsd(l.price)}
        </span>
        <span className="relative">{l.size.toLocaleString("en")}</span>
      </div>
    ))

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] px-3 py-2 text-xs font-bold">
        Order Book
      </div>
      <div className="flex justify-between px-3 py-1 text-[10px] text-[var(--text-muted)]">
        <span>Price</span>
        <span>Size ({coin})</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows(asks, "var(--down)")}
        <div className="border-y border-[var(--border)] px-3 py-1.5 font-mono text-sm font-extrabold">
          {priceUsd(markPrice)}
          <span className="ml-2 text-[10px] font-normal text-[var(--text-muted)]">
            spread {book.spreadPct.toFixed(3)}%
          </span>
        </div>
        {rows(book.bids, "var(--up)")}
      </div>
    </div>
  )
}

function BottomTabs({ coin }: { coin: string }) {
  const { positions, openOrders, tradeHistory, closePosition, cancelOrder } =
    usePortfolio()
  const [tab, setTab] = useState<BottomTab>("positions")
  const [onlyThisPair, setOnlyThisPair] = useState(false)

  const match = (market: string) => !onlyThisPair || market === `${coin}-PERP`
  const pos = positions.filter((p) => match(p.market))
  const ord = openOrders.filter((o) => match(o.market))
  const hist = tradeHistory.filter((t) => match(t.market)).slice(0, 50)

  const tabs: { id: BottomTab; label: string; count: number }[] = [
    { id: "positions", label: "Positions", count: pos.length },
    { id: "orders", label: "Open Orders", count: ord.length },
    { id: "history", label: "Trade History", count: hist.length },
  ]

  const th = "px-3 py-1.5 text-left font-normal text-[var(--text-muted)]"
  const td = "px-3 py-1.5 font-mono"
  const sideCol = (s: string) => (s === "SHORT" ? "var(--down)" : "var(--up)")

  return (
    <div className="border-t border-[var(--border)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] pr-3">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs font-bold ${
                tab === t.id
                  ? "border-b-2 border-[var(--brand)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={onlyThisPair}
            onChange={(e) => setOnlyThisPair(e.target.checked)}
          />
          Only {coin}
        </label>
      </div>

      <div className="max-h-56 overflow-auto text-[11px]">
        {tab === "positions" &&
          (pos.length === 0 ? (
            <Empty text="No open positions" />
          ) : (
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  {[
                    "Market",
                    "Side",
                    "Size",
                    "Entry",
                    "Mark",
                    "PnL",
                    "Liq.",
                    "SL",
                    "TP1 / TP2 / TP3",
                    "",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => {
                  const tps = p.tps ?? (p.tp ? [p.tp] : [])
                  return (
                    <tr key={p.id} className="border-t border-[var(--border)]">
                      <td className={td}>{p.market}</td>
                      <td className={td} style={{ color: sideCol(p.side) }}>
                        {p.side} {p.leverage}x
                      </td>
                      <td className={td}>{p.size}</td>
                      <td className={td}>{priceUsd(p.entryPrice)}</td>
                      <td className={td}>{priceUsd(p.markPrice)}</td>
                      <td
                        className={td}
                        style={{
                          color: p.pnl >= 0 ? "var(--up)" : "var(--down)",
                        }}
                      >
                        {p.pnl >= 0 ? "+" : ""}
                        {p.pnl.toFixed(2)} ({p.roe.toFixed(1)}%)
                      </td>
                      <td className={td}>{priceUsd(p.liqPrice)}</td>
                      <td className={td}>{p.sl ? priceUsd(p.sl) : "—"}</td>
                      <td className={td}>
                        {tps.length
                          ? tps.map((t) => priceUsd(t)).join(" / ")
                          : "—"}
                      </td>
                      <td className={td}>
                        <button
                          onClick={() => closePosition(p.id)}
                          className="border border-[var(--border)] px-2 py-0.5 font-sans font-bold hover:border-[var(--down)] hover:text-[var(--down)]"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ))}

        {tab === "orders" &&
          (ord.length === 0 ? (
            <Empty text="No open orders" />
          ) : (
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  {[
                    "Market",
                    "Type",
                    "Side",
                    "Price",
                    "Size",
                    "SL",
                    "TP1 / TP2 / TP3",
                    "",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ord.map((o) => {
                  const tps = o.tps ?? (o.tp ? [o.tp] : [])
                  return (
                    <tr key={o.id} className="border-t border-[var(--border)]">
                      <td className={td}>{o.market}</td>
                      <td className={td}>{o.type}</td>
                      <td className={td} style={{ color: sideCol(o.side) }}>
                        {o.side}
                      </td>
                      <td className={td}>{priceUsd(o.orderPrice)}</td>
                      <td className={td}>{o.size}</td>
                      <td className={td}>{o.sl ? priceUsd(o.sl) : "—"}</td>
                      <td className={td}>
                        {tps.length
                          ? tps.map((t) => priceUsd(t)).join(" / ")
                          : "—"}
                      </td>
                      <td className={td}>
                        <button
                          onClick={() => cancelOrder(o.id)}
                          className="border border-[var(--border)] px-2 py-0.5 font-sans font-bold hover:border-[var(--down)] hover:text-[var(--down)]"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ))}

        {tab === "history" &&
          (hist.length === 0 ? (
            <Empty text="No trades yet" />
          ) : (
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  {[
                    "Time",
                    "Market",
                    "Side",
                    "Price",
                    "Size",
                    "Fee",
                    "PnL",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hist.map((t) => (
                  <tr key={t.id} className="border-t border-[var(--border)]">
                    <td className={td}>
                      {new Date(t.timestamp).toLocaleString()}
                    </td>
                    <td className={td}>{t.market}</td>
                    <td className={td} style={{ color: sideCol(t.side) }}>
                      {t.side}
                    </td>
                    <td className={td}>{priceUsd(t.price)}</td>
                    <td className={td}>{t.size}</td>
                    <td className={td}>{t.fee.toFixed(2)}</td>
                    <td
                      className={td}
                      style={{
                        color: t.pnl >= 0 ? "var(--up)" : "var(--down)",
                      }}
                    >
                      {t.pnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
      {text}
    </div>
  )
}

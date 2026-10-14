"use client"

import { useEffect, useState } from "react"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { PerpMarketPicker } from "@/components/perps/perp-market-picker"
import { PerpTradePanel } from "@/components/perps/perp-trade-panel"
import { TradingViewChart } from "@/components/perps/tradingview-chart"
import { usePortfolio, type OpenOrder, type PerpPosition, type TradeRecord } from "@/hooks/use-portfolio"
import type { PerpMarket, PerpOrderbook } from "@/lib/hyperliquid"
import { priceUsd } from "@/lib/format"
import { tradingViewSymbol } from "@/lib/perp-trade-setup"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TAB_BLOCK } from "@/components/riven/card-style"

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
    <div className="border border-[var(--rv-stroke)] bg-[var(--rv-card)]">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--rv-stroke)] px-3 py-2.5">
        <PerpMarketPicker
          market={market}
          markets={markets}
          signalByCoin={signalByCoin}
          onSelect={onSelect}
        />
        <div className="hidden sm:block">
          <span className="font-mono text-xl font-extrabold">
            {priceUsd(market.markPrice)}
          </span>{" "}
          <span
            className="font-mono text-xs font-bold"
            style={{ color: up ? "var(--rv-up)" : "var(--rv-down)" }}
          >
            {up ? "+" : ""}
            {market.change24h.toFixed(2)}%
          </span>
        </div>
        {/* four equal columns on a phone; on wider screens the stats join the row above */}
        <div className="grid w-full grid-cols-4 gap-2 sm:contents">
          <Stat label="24H Volume" value={`$${compact(market.volume24h)}`} />
          <Stat
            label="Open Interest"
            value={`$${compact(market.openInterestUsd)}`}
          />
          <Stat
            label="Funding (APR)"
            value={`${market.fundingApr.toFixed(1)}%`}
            color={market.fundingApr >= 0 ? "var(--rv-up)" : "var(--rv-down)"}
          />
          <Stat label="Max Leverage" value={`${market.maxLeverage}x`} />
        </div>
        {signal && (
          <span
            className="border px-2 py-0.5 text-[10px] font-extrabold"
            style={{
              borderColor: signal.bias === "LONG" ? "var(--rv-up)" : "var(--rv-down)",
              color: signal.bias === "LONG" ? "var(--rv-up)" : "var(--rv-down)",
            }}
          >
            SIGNAL {signal.bias} {signal.confidence}/10
          </span>
        )}
      </div>

      {/* Two sections per market: Chart (TradingView, with drawing tools) and Trade */}
      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="gap-0">
      <div className="flex border-b border-[var(--rv-stroke)]">
        <TabsList variant="line" className="h-auto w-full gap-0 p-0 sm:w-auto" aria-label={`${market.symbol} sections`}>
          {(["chart", "trade"] as const).map((v) => (
            <TabsTrigger key={v} value={v} className={`h-10 flex-1 text-[13px] font-bold sm:flex-none sm:px-8 ${TAB_BLOCK}`}>
              {v === "chart" ? "Chart" : "Trade"}
            </TabsTrigger>
          ))}
        </TabsList>
        <span className="ml-auto hidden self-center px-3 text-[11px] text-[var(--rv-ink-3)] sm:block">
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
          <div className="order-2 h-[340px] overflow-hidden border-t border-[var(--rv-stroke)] lg:order-1 lg:h-[640px] lg:border-t-0 lg:border-r">
            <p className="px-3 pt-2 text-[10px] font-bold tracking-wider text-[var(--rv-ink-3)] uppercase lg:hidden">
              Order book
            </p>
            <OrderBook coin={market.symbol} markPrice={market.markPrice} />
          </div>
          <div className="order-1 mx-auto w-full max-w-[560px] lg:order-2 lg:max-h-[640px] lg:overflow-y-auto">
            <PerpTradePanel
              key={market.symbol}
              market={market}
              signal={signal}
            />
          </div>
        </div>
      )}
      </Tabs>

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
      <div className="text-[10px] text-[var(--rv-ink-3)]">{label}</div>
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
      <div className="p-3 text-xs text-[var(--rv-ink-3)]">
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
      <div className="border-b border-[var(--rv-stroke)] px-3 py-2 text-xs font-bold">
        Order Book
      </div>
      <div className="flex justify-between px-3 py-1 text-[10px] text-[var(--rv-ink-3)]">
        <span>Price</span>
        <span>Size ({coin})</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows(asks, "var(--rv-down)")}
        <div className="border-y border-[var(--rv-stroke)] px-3 py-1.5 font-mono text-sm font-extrabold">
          {priceUsd(markPrice)}
          <span className="ml-2 text-[10px] font-normal text-[var(--rv-ink-3)]">
            spread {book.spreadPct.toFixed(3)}%
          </span>
        </div>
        {rows(book.bids, "var(--rv-up)")}
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

  const tabs: { id: BottomTab; label: string; short: string; count: number }[] = [
    { id: "positions", label: "Positions", short: "Positions", count: pos.length },
    { id: "orders", label: "Open Orders", short: "Orders", count: ord.length },
    { id: "history", label: "Trade History", short: "History", count: hist.length },
  ]

  const th = "h-auto px-3 py-1.5 text-left text-[11px] font-normal tracking-normal normal-case text-[var(--rv-ink-3)]"
  const td = "px-3 py-1.5 font-mono text-[11px]"
  const sideCol = (s: string) => (s === "SHORT" ? "var(--rv-down)" : "var(--rv-up)")

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as BottomTab)} className="gap-0 border-t border-[var(--rv-stroke)]">
      <div className="flex flex-col border-b border-[var(--rv-stroke)] sm:flex-row sm:items-center sm:justify-between sm:pr-3">
        <TabsList variant="line" className="h-auto w-full justify-start gap-0 p-0 sm:w-auto" aria-label="Your paper account">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-10 flex-1 px-3 text-xs font-bold tracking-normal normal-case whitespace-nowrap text-[var(--rv-ink-3)] after:bg-[var(--rv-blue)] data-active:text-[var(--rv-ink)] group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-0 hover:text-[var(--rv-ink)] sm:h-9 sm:flex-none sm:px-4"
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span> ({t.count})
            </TabsTrigger>
          ))}
        </TabsList>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 border-t border-[var(--rv-stroke)] px-3 text-[12px] text-[var(--rv-ink-3)] sm:min-h-0 sm:gap-1.5 sm:border-t-0 sm:px-0 sm:text-[11px]">
          <Checkbox checked={onlyThisPair} onCheckedChange={(v) => setOnlyThisPair(v === true)} className="size-4 rounded-[3px]" />
          Only {coin}
        </label>
      </div>

      <div className="max-h-[70vh] overflow-auto text-[11px] sm:max-h-56">
        {tab === "positions" &&
          (pos.length === 0 ? (
            <Empty text="No open positions" />
          ) : (
            <>
            <div className="space-y-2 p-3 sm:hidden">
              {pos.map((p) => (
                <PositionCard key={p.id} p={p} onClose={() => closePosition(p.id)} />
              ))}
            </div>
            <Table className="hidden min-w-[760px] text-[11px] sm:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
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
                    <TableHead key={h} className={th}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pos.map((p) => {
                  const tps = p.tps ?? (p.tp ? [p.tp] : [])
                  return (
                    <TableRow key={p.id} className="border-0 border-t border-[var(--rv-stroke)]">
                      <TableCell className={td}>{p.market}</TableCell>
                      <TableCell className={td} style={{ color: sideCol(p.side) }}>
                        {p.side} {p.leverage}x
                      </TableCell>
                      <TableCell className={td}>{p.size}</TableCell>
                      <TableCell className={td}>{priceUsd(p.entryPrice)}</TableCell>
                      <TableCell className={td}>{priceUsd(p.markPrice)}</TableCell>
                      <TableCell
                        className={td}
                        style={{
                          color: p.pnl >= 0 ? "var(--rv-up)" : "var(--rv-down)",
                        }}
                      >
                        {p.pnl >= 0 ? "+" : ""}
                        {p.pnl.toFixed(2)} ({p.roe.toFixed(1)}%)
                      </TableCell>
                      <TableCell className={td}>{priceUsd(p.liqPrice)}</TableCell>
                      <TableCell className={td}>{p.sl ? priceUsd(p.sl) : "—"}</TableCell>
                      <TableCell className={td}>
                        {tps.length
                          ? tps.map((t) => priceUsd(t)).join(" / ")
                          : "—"}
                      </TableCell>
                      <TableCell className={td}>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => closePosition(p.id)}
                          className="h-6 rounded-none border-[var(--rv-stroke)] px-2 font-sans text-[11px] font-bold tracking-normal normal-case hover:border-[var(--rv-down)] hover:text-[var(--rv-down)]"
                        >
                          Close
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </>
          ))}

        {tab === "orders" &&
          (ord.length === 0 ? (
            <Empty text="No open orders" />
          ) : (
            <>
            <div className="space-y-2 p-3 sm:hidden">
              {ord.map((o) => (
                <OrderCard key={o.id} o={o} onCancel={() => cancelOrder(o.id)} />
              ))}
            </div>
            <Table className="hidden min-w-[640px] text-[11px] sm:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
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
                    <TableHead key={h} className={th}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ord.map((o) => {
                  const tps = o.tps ?? (o.tp ? [o.tp] : [])
                  return (
                    <TableRow key={o.id} className="border-0 border-t border-[var(--rv-stroke)]">
                      <TableCell className={td}>{o.market}</TableCell>
                      <TableCell className={td}>{o.type}</TableCell>
                      <TableCell className={td} style={{ color: sideCol(o.side) }}>
                        {o.side}
                      </TableCell>
                      <TableCell className={td}>{priceUsd(o.orderPrice)}</TableCell>
                      <TableCell className={td}>{o.size}</TableCell>
                      <TableCell className={td}>{o.sl ? priceUsd(o.sl) : "—"}</TableCell>
                      <TableCell className={td}>
                        {tps.length
                          ? tps.map((t) => priceUsd(t)).join(" / ")
                          : "—"}
                      </TableCell>
                      <TableCell className={td}>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => cancelOrder(o.id)}
                          className="h-6 rounded-none border-[var(--rv-stroke)] px-2 font-sans text-[11px] font-bold tracking-normal normal-case hover:border-[var(--rv-down)] hover:text-[var(--rv-down)]"
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </>
          ))}

        {tab === "history" &&
          (hist.length === 0 ? (
            <Empty text="No trades yet" />
          ) : (
            <>
            <div className="divide-y divide-[var(--rv-stroke)] sm:hidden">
              {hist.map((t) => (
                <TradeRow key={t.id} t={t} />
              ))}
            </div>
            <Table className="hidden min-w-[560px] text-[11px] sm:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {[
                    "Time",
                    "Market",
                    "Side",
                    "Price",
                    "Size",
                    "Fee",
                    "PnL",
                  ].map((h) => (
                    <TableHead key={h} className={th}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {hist.map((t) => (
                  <TableRow key={t.id} className="border-0 border-t border-[var(--rv-stroke)]">
                    <TableCell className={td}>
                      {new Date(t.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className={td}>{t.market}</TableCell>
                    <TableCell className={td} style={{ color: sideCol(t.side) }}>
                      {t.side}
                    </TableCell>
                    <TableCell className={td}>{priceUsd(t.price)}</TableCell>
                    <TableCell className={td}>{t.size}</TableCell>
                    <TableCell className={td}>{t.fee.toFixed(2)}</TableCell>
                    <TableCell
                      className={td}
                      style={{
                        color: t.pnl >= 0 ? "var(--rv-up)" : "var(--rv-down)",
                      }}
                    >
                      {t.pnl.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          ))}
      </div>
    </Tabs>
  )
}

const tpList = (tps: number[]) => (tps.length ? tps.map((t) => priceUsd(t)).join(" / ") : "—")

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-[var(--rv-ink-3)]">{label}</dt>
      <dd className="font-mono text-[12px] font-bold break-words" style={{ color }}>
        {value}
      </dd>
    </div>
  )
}

/** One open position as a card (phones). The tables below sm: are too wide to read. */
function PositionCard({ p, onClose }: { p: PerpPosition; onClose: () => void }) {
  const tps = p.tps ?? (p.tp ? [p.tp] : [])
  const side = p.side === "SHORT" ? "var(--rv-down)" : "var(--rv-up)"
  const pnl = p.pnl >= 0 ? "var(--rv-up)" : "var(--rv-down)"
  return (
    <article className="rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-bold text-[var(--rv-ink)]">{p.market}</span>
          <span className="shrink-0 text-[11px] font-extrabold" style={{ color: side }}>
            {p.side} {p.leverage}x
          </span>
        </div>
        <span className="shrink-0 font-mono text-[13px] font-bold" style={{ color: pnl }}>
          {p.pnl >= 0 ? "+" : ""}
          {p.pnl.toFixed(2)} ({p.roe.toFixed(1)}%)
        </span>
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
        <Field label="Size" value={String(p.size)} />
        <Field label="Entry" value={priceUsd(p.entryPrice)} />
        <Field label="Mark" value={priceUsd(p.markPrice)} />
        <Field label="Liq." value={priceUsd(p.liqPrice)} />
        <Field label="Stop" value={p.sl ? priceUsd(p.sl) : "—"} color={p.sl ? "var(--rv-down)" : undefined} />
        <div className="col-span-3">
          <Field label="Targets" value={tpList(tps)} color={tps.length ? "var(--rv-up)" : undefined} />
        </div>
      </dl>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 h-11 w-full rounded-md border border-[var(--rv-stroke)] font-sans text-[13px] font-bold text-[var(--rv-ink)] hover:border-[var(--rv-down)] hover:text-[var(--rv-down)]"
      >
        Close position
      </button>
    </article>
  )
}

function OrderCard({ o, onCancel }: { o: OpenOrder; onCancel: () => void }) {
  const tps = o.tps ?? (o.tp ? [o.tp] : [])
  const side = o.side === "SHORT" ? "var(--rv-down)" : "var(--rv-up)"
  return (
    <article className="rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] p-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-[var(--rv-ink)]">{o.market}</span>
        <span className="text-[11px] font-extrabold" style={{ color: side }}>
          {o.side}
        </span>
        <span className="ml-auto text-[11px] text-[var(--rv-ink-3)]">{o.type}</span>
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
        <Field label="Price" value={priceUsd(o.orderPrice)} />
        <Field label="Size" value={String(o.size)} />
        <Field label="Stop" value={o.sl ? priceUsd(o.sl) : "—"} color={o.sl ? "var(--rv-down)" : undefined} />
        <div className="col-span-3">
          <Field label="Targets" value={tpList(tps)} color={tps.length ? "var(--rv-up)" : undefined} />
        </div>
      </dl>
      <button
        type="button"
        onClick={onCancel}
        className="mt-3 h-11 w-full rounded-md border border-[var(--rv-stroke)] font-sans text-[13px] font-bold text-[var(--rv-ink)] hover:border-[var(--rv-down)] hover:text-[var(--rv-down)]"
      >
        Cancel order
      </button>
    </article>
  )
}

function TradeRow({ t }: { t: TradeRecord }) {
  const side = t.side === "SHORT" ? "var(--rv-down)" : "var(--rv-up)"
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-bold text-[var(--rv-ink)]">{t.market}</span>
        <span className="text-[11px] font-extrabold" style={{ color: side }}>
          {t.side}
        </span>
        <span className="ml-auto font-mono text-[12.5px] font-bold" style={{ color: t.pnl >= 0 ? "var(--rv-up)" : "var(--rv-down)" }}>
          {t.pnl >= 0 ? "+" : ""}
          {t.pnl.toFixed(2)}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-[11px] text-[var(--rv-ink-3)]">
        {priceUsd(t.price)} · size {t.size} · fee {t.fee.toFixed(2)} · {new Date(t.timestamp).toLocaleString()}
      </p>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-3 py-6 text-center text-xs text-[var(--rv-ink-3)]">
      {text}
    </div>
  )
}

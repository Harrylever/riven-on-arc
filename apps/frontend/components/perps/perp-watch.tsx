"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "@/components/ui/toast"
import { usePerpWatch } from "@/hooks/use-perp-watch"
import type { PerpMarket } from "@/lib/hyperliquid"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { RvSelect } from "@/components/riven/rv-select"
import { priceUsd } from "@/lib/format"
import { signalCoinKey } from "@/lib/perp-symbols"
import { Input } from "@/components/ui/input"
import { RV_INPUT } from "@/components/riven/card-style"

function notify(title: string, body: string, tag: string) {
  toast.add({ title, description: body, type: "info" })
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    new Notification(title, { body, tag })
  }
}

/**
 * Pair tracking + alerts for the perps terminal. Price alerts are checked
 * against the live Hyperliquid mark price every time markets refresh; new
 * Riven Scanner calls on a tracked pair notify once.
 */
export function PerpWatch({
  market,
  markets,
  signals,
  onSelect,
}: {
  market: PerpMarket
  markets: PerpMarket[]
  signals: PerpSignal[] | null
  onSelect: (symbol: string) => void
}) {
  const {
    pairs,
    alerts,
    seenSignals,
    toggleTrack,
    addAlert,
    removeAlert,
    markSignalsSeen,
  } = usePerpWatch()
  const [price, setPrice] = useState("")
  const [direction, setDirection] = useState<"above" | "below">("above")
  const firstSignals = useRef(true)
  const tracked = pairs.includes(market.symbol)
  const byCoin = new Map(markets.map((m) => [m.symbol, m]))

  // Price alerts: fire once when the mark crosses the level, then remove.
  useEffect(() => {
    for (const a of alerts) {
      const m = byCoin.get(a.coin)
      if (!m) continue
      const hit =
        a.direction === "above"
          ? m.markPrice >= a.price
          : m.markPrice <= a.price
      if (hit) {
        notify(
          `${a.coin} ${a.direction === "above" ? "broke above" : "fell below"} ${priceUsd(a.price)}`,
          `Mark price ${priceUsd(m.markPrice)}`,
          a.id,
        )
        removeAlert(a.id)
      }
    }
    // byCoin is derived from markets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, alerts, removeAlert])

  // New Riven Scanner calls on tracked pairs. The first load only records what exists.
  useEffect(() => {
    if (!signals) return
    // The first batch only records what exists — even if nothing is unseen,
    // so the next genuinely new call does notify.
    const isFirst = firstSignals.current
    firstSignals.current = false
    const fresh = signals.filter(
      (s) =>
        s.outcome === "pending" &&
        !seenSignals.includes(s.id) &&
        pairs.some((p) => p.toUpperCase() === signalCoinKey(s.symbol)),
    )
    if (fresh.length === 0) return
    if (!isFirst) {
      for (const s of fresh) {
        notify(
          `New ${s.bias} call: ${s.symbol}`,
          `Entry ${priceUsd(s.entryLow)}–${priceUsd(s.entryHigh)} · SL ${priceUsd(s.stopLoss)} · confidence ${s.confidence}/10`,
          s.id,
        )
      }
    }
    markSignalsSeen(fresh.map((s) => s.id))
  }, [signals, pairs, seenSignals, markSignalsSeen])

  return (
    <section className="rv-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold tracking-wide text-[var(--rv-ink-3)] uppercase">
          Tracked pairs
        </span>
        {pairs.length === 0 && (
          <span className="text-[12px] text-[var(--rv-ink-3)]">
            Track a pair to see it here and get its signals.
          </span>
        )}
        {pairs.map((coin) => {
          const m = byCoin.get(coin)
          const up = (m?.change24h ?? 0) >= 0
          return (
            <button
              key={coin}
              type="button"
              onClick={() => onSelect(coin)}
              className="rv-num flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] ring-1 ring-[var(--rv-stroke)] hover:ring-[var(--rv-stroke-strong)]"
              style={{
                background:
                  coin === market.symbol
                    ? "rgba(124, 196, 232, 0.16)"
                    : "transparent",
              }}
            >
              <span className="font-semibold text-[var(--rv-ink)]">{coin}</span>
              {m && (
                <span className="text-[var(--rv-ink-2)]">
                  {priceUsd(m.markPrice)}
                </span>
              )}
              {m && (
                <span style={{ color: up ? "var(--rv-up)" : "var(--rv-down)" }}>
                  {up ? "+" : ""}
                  {m.change24h.toFixed(2)}%
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => toggleTrack(market.symbol)}
          className="ml-auto rounded-md px-3 py-1 text-[12px] font-semibold"
          style={{
            color: tracked ? "#000" : "var(--rv-ice)",
            background: tracked ? "var(--rv-ice)" : "transparent",
            boxShadow: tracked
              ? "none"
              : "inset 0 0 0 1px var(--rv-stroke-strong)",
          }}
        >
          {tracked ? `Tracking ${market.symbol}` : `Track ${market.symbol}`}
        </button>
      </div>

      <form
        className="mt-3 grid grid-cols-[auto_1fr] items-center gap-2 border-t border-[var(--rv-stroke)] pt-3 sm:flex sm:flex-wrap"
        onSubmit={(e) => {
          e.preventDefault()
          addAlert(market.symbol, direction, Number(price))
          setPrice("")
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "default"
          )
            void Notification.requestPermission()
        }}
      >
        <span className="col-span-2 text-[12px] text-[var(--rv-ink-2)]">
          Alert me when {market.symbol} goes
        </span>
        <RvSelect
          label="Direction"
          value={direction}
          onChange={setDirection}
          highlightActive={false}
          className="h-11 w-full justify-between rounded-md border-[color:var(--rv-stroke)] bg-[var(--rv-sunken)] px-2 text-[13px] font-medium text-[var(--rv-ink)] sm:h-8 sm:text-[12px]"
          options={[
            ["above", "above"],
            ["below", "below"],
          ]}
        />
        <Input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={priceUsd(market.markPrice).replace("$", "")}
          aria-label="Alert price"
          className={`${RV_INPUT} h-11 w-full px-2 text-[13px] sm:h-8 sm:w-28 sm:text-[12px]`}
        />
        <button
          type="submit"
          className="col-span-2 h-11 rounded-md bg-[var(--rv-blue)] px-3 text-[13px] font-semibold text-[var(--rv-on-blue)] sm:h-8 sm:text-[12px]"
        >
          Set alert
        </button>
        {alerts.length > 0 && (
          <ul className="flex w-full flex-wrap gap-1.5 pt-1">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="rv-num flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-[var(--rv-ink-2)]"
              >
                {a.coin} {a.direction === "above" ? "≥" : "≤"}{" "}
                {priceUsd(a.price)}
                <button
                  type="button"
                  onClick={() => removeAlert(a.id)}
                  aria-label={`Remove ${a.coin} alert`}
                  className="text-[var(--rv-ink-3)] hover:text-[var(--rv-risk)]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
    </section>
  )
}

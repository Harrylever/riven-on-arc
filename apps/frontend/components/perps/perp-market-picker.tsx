"use client"

import { useMemo, useState } from "react"
import type { PerpSignal } from "@/components/perps/perps-panel"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { PerpMarket } from "@/lib/hyperliquid"
import { priceUsd } from "@/lib/format"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { RV_CHECK } from "@/components/riven/card-style"

const compact = (n: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)

type Sort = "volume" | "change" | "signal"

/** Searchable dialog for picking a perp market. */
export function PerpMarketPicker({
  market,
  markets,
  signalByCoin,
  onSelect,
}: {
  market: PerpMarket
  markets: PerpMarket[]
  signalByCoin: Map<string, PerpSignal>
  onSelect: (symbol: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<Sort>("volume")
  const [signalsOnly, setSignalsOnly] = useState(false)

  const results = useMemo(() => {
    const q = query
      .trim()
      .toUpperCase()
      .replace(/^\$/, "")
      .replace(/[-/]/g, "")
      .replace(/(USDT|PERP)$/, "")
    const conf = (m: PerpMarket) =>
      signalByCoin.get(m.symbol.toUpperCase())?.confidence ?? -1

    return markets
      .filter((m) => !q || m.symbol.toUpperCase().includes(q))
      .filter((m) => !signalsOnly || conf(m) >= 0)
      .sort((a, b) => {
        if (sort === "change") return b.change24h - a.change24h
        if (sort === "signal")
          return conf(b) - conf(a) || b.volume24h - a.volume24h
        return b.volume24h - a.volume24h
      })
  }, [markets, query, sort, signalsOnly, signalByCoin])

  const pick = (symbol: string) => {
    onSelect(symbol)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setQuery("")
      }}
    >
      <DialogTrigger
        className="flex cursor-pointer items-center gap-2 border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-2.5 py-1 text-sm font-black text-[var(--rv-ink)] hover:border-[var(--rv-blue)]"
        aria-label="Select market"
      >
        {market.symbol}-PERP
        <span className="text-[10px] text-[var(--rv-ink-3)]">▼</span>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="max-w-xl gap-0 border border-[var(--rv-stroke)] bg-[var(--rv-card)] p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Select market</DialogTitle>

        <div className="border-b border-[var(--rv-stroke)] p-3">
          <Input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) pick(results[0].symbol)
            }}
            placeholder="Search pairs (e.g. SOL, $BTC, PEPE)…"
            className="w-full border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 py-2 text-sm text-[var(--rv-ink)] outline-none focus:border-[var(--rv-blue)]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            {(
              [
                ["volume", "Volume"],
                ["change", "24h %"],
                ["signal", "Signal"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSort(id)}
                className={`border px-2 py-0.5 font-bold ${
                  sort === id
                    ? "border-[var(--rv-blue)] text-[var(--rv-ink)]"
                    : "border-[var(--rv-stroke)] text-[var(--rv-ink-3)]"
                }`}
              >
                {label}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[var(--rv-ink-3)]">
              <Checkbox checked={signalsOnly} onCheckedChange={(v) => setSignalsOnly(v === true)} className={RV_CHECK} />
              With signals only
            </label>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 py-1.5 text-[10px] text-[var(--rv-ink-3)]">
          <span>Pair</span>
          <span className="text-right">Price</span>
          <span className="w-16 text-right">24h</span>
          <span className="w-14 text-right">Volume</span>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-[var(--rv-ink-3)]">
              No pairs match “{query}”
            </div>
          ) : (
            results.map((m) => {
              const sig = signalByCoin.get(m.symbol.toUpperCase())
              const active = m.symbol === market.symbol
              return (
                <button
                  key={m.symbol}
                  onClick={() => pick(m.symbol)}
                  className={`grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-t border-[var(--rv-stroke)] px-3 py-2 text-left text-xs hover:bg-[var(--rv-sunken)] ${
                    active ? "bg-[var(--rv-sunken)]" : ""
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-extrabold">
                    {m.symbol}
                    <span className="font-normal text-[var(--rv-ink-3)]">
                      {m.maxLeverage}x
                    </span>
                    {sig && (
                      <span
                        className="border px-1 text-[9px] font-bold"
                        style={{
                          borderColor:
                            sig.bias === "LONG" ? "var(--rv-up)" : "var(--rv-down)",
                          color:
                            sig.bias === "LONG" ? "var(--rv-up)" : "var(--rv-down)",
                        }}
                      >
                        {sig.bias} {sig.confidence}/10
                      </span>
                    )}
                  </span>
                  <span className="font-mono">{priceUsd(m.markPrice)}</span>
                  <span
                    className="w-16 text-right font-mono font-bold"
                    style={{
                      color: m.change24h >= 0 ? "var(--rv-up)" : "var(--rv-down)",
                    }}
                  >
                    {m.change24h >= 0 ? "+" : ""}
                    {m.change24h.toFixed(2)}%
                  </span>
                  <span className="w-14 text-right font-mono text-[var(--rv-ink-3)]">
                    ${compact(m.volume24h)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

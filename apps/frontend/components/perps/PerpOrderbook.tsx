"use client"

import type { PerpOrderbook } from "@/lib/hyperliquid"
import { priceUsd } from "@/lib/format"

interface PerpOrderbookProps {
  orderbook: PerpOrderbook | null
  loading?: boolean
}

export function PerpOrderbookView({
  orderbook,
  loading = false,
}: PerpOrderbookProps) {
  if (loading && !orderbook) {
    return (
      <div className="flex h-64 animate-pulse items-center justify-center rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-xs text-[var(--text-muted)]">
        Loading orderbook depth…
      </div>
    )
  }

  if (
    !orderbook ||
    (orderbook.bids.length === 0 && orderbook.asks.length === 0)
  ) {
    return (
      <div className="flex h-64 items-center justify-center rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--text-muted)]">
        No active orderbook data available
      </div>
    )
  }

  const maxTotal = Math.max(
    orderbook.bids[orderbook.bids.length - 1]?.total || 1,
    orderbook.asks[orderbook.asks.length - 1]?.total || 1,
  )

  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-2 text-xs font-bold text-[var(--text-secondary)]">
        <span>Orderbook Depth</span>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          Spread: {priceUsd(orderbook.spread)} ({orderbook.spreadPct.toFixed(3)}
          %)
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 font-mono text-xs">
        {/* Bids (Buys) */}
        <div>
          <div className="mb-1.5 flex justify-between text-[10px] font-bold text-[var(--text-muted)] uppercase">
            <span>Bid Price</span>
            <span>Size</span>
          </div>
          <div className="flex flex-col gap-1">
            {orderbook.bids.slice(0, 10).map((bid, i) => {
              const depthPct = Math.min(
                100,
                Math.round((bid.total / maxTotal) * 100),
              )
              return (
                <div
                  key={`bid-${i}`}
                  className="relative flex items-center justify-between px-1.5 py-0.5"
                >
                  {/* Depth Bar */}
                  <div
                    className="pointer-events-none absolute top-0 right-0 bottom-0 bg-[var(--up)]/15 transition-all duration-300"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="relative z-10 font-medium text-[var(--up)]">
                    {priceUsd(bid.price)}
                  </span>
                  <span className="relative z-10 text-[var(--text-secondary)]">
                    {bid.size >= 1000
                      ? `${(bid.size / 1000).toFixed(1)}K`
                      : bid.size.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Asks (Sells) */}
        <div>
          <div className="mb-1.5 flex justify-between text-[10px] font-bold text-[var(--text-muted)] uppercase">
            <span>Ask Price</span>
            <span>Size</span>
          </div>
          <div className="flex flex-col gap-1">
            {orderbook.asks.slice(0, 10).map((ask, i) => {
              const depthPct = Math.min(
                100,
                Math.round((ask.total / maxTotal) * 100),
              )
              return (
                <div
                  key={`ask-${i}`}
                  className="relative flex items-center justify-between px-1.5 py-0.5"
                >
                  {/* Depth Bar */}
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 left-0 bg-[var(--down)]/15 transition-all duration-300"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="relative z-10 font-medium text-[var(--down)]">
                    {priceUsd(ask.price)}
                  </span>
                  <span className="relative z-10 text-[var(--text-secondary)]">
                    {ask.size >= 1000
                      ? `${(ask.size / 1000).toFixed(1)}K`
                      : ask.size.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import type { MadeOnSolTrade } from "@/lib/kols"
import { ago, shortAddr, usd } from "@/lib/format"

interface KolFloatingBubbleProps {
  trades: MadeOnSolTrade[]
  symbol: string
}

export function KolFloatingBubble({ trades, symbol }: KolFloatingBubbleProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!trades || trades.length === 0) return null

  const buyTrades = trades.filter((t) => t.action === "buy")
  const sellTrades = trades.filter((t) => t.action === "sell")
  const latestTrade = trades[0]

  return (
    <div className="fixed right-6 bottom-6 z-50">
      {/* Floating Pill / Trigger Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2.5 rounded-none border border-[var(--brand)]/40 bg-gradient-to-r from-[var(--deep-blue)] via-[#0c3155] to-[#0755a5] px-4 py-2.5 text-white shadow-2xl backdrop-blur-xl transition-all hover:scale-105"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-bright)] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
          </span>
          <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide">
            <span>🎯 KOL Intel:</span>
            <span className="text-[var(--brand-bright)]">
              {trades.length} trade{trades.length > 1 ? "s" : ""} on ${symbol}
            </span>
          </span>
          <span className="rounded-none bg-[var(--brand-tint)] px-2 py-0.5 font-mono text-[11px] text-[var(--brand-bright)]">
            {latestTrade?.action === "buy" ? "🟢" : "🔴"}{" "}
            {latestTrade?.sol_amount?.toFixed(1)} SOL
          </span>
        </button>
      )}

      {/* Expanded Modal / Drawer */}
      {isOpen && (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] animate-in rounded-none border border-[var(--brand)]/30 bg-[var(--deep-blue)]/95 p-4 text-[var(--txt)] shadow-2xl backdrop-blur-2xl duration-200 zoom-in-95 fade-in">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  KOL Live Activity
                </h3>
                <p className="text-[10px] text-[var(--brand-bright)]">
                  {buyTrades.length} Buys · {sellTrades.length} Sells on $
                  {symbol}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex size-7 items-center justify-center rounded-full bg-white/5 text-xs text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Trade Rows */}
          <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1">
            {trades.map((t, idx) => {
              const isBuy = t.action === "buy"
              return (
                <div
                  key={t.tx_signature ?? idx}
                  className="flex items-center justify-between rounded-none border border-white/5 bg-white/[0.02] p-2.5 transition-colors hover:bg-white/[0.05]"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`size-2 rounded-full ${
                        isBuy ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        <span>{t.kol_name || shortAddr(t.wallet_address)}</span>
                        <span
                          className={`py-0.2 rounded px-1.5 text-[9px] font-extrabold uppercase ${
                            isBuy
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {t.action}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)]">
                        {ago(t.traded_at)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-white">
                      {t.sol_amount.toFixed(2)} SOL
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">
                      {usd(t.sol_amount * 145)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 border-t border-white/5 pt-2 text-center text-[10px] text-[var(--text-muted)]">
            Verified on-chain via MadeOnSol & Solana RPC
          </div>
        </div>
      )}
    </div>
  )
}

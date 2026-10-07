"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useArcWallet } from "@/hooks/use-arc-wallet"
import { TRADING_ENABLED } from "@/lib/flags"
import type { TokenSummary } from "@/lib/arc-data"
import { TradeSheet } from "./trade-sheet"

/** Default flash-buy size, in USDC (Arc's gas token, so no swap into gas first). */
export const FLASH_USDC = "10"

/**
 * One-tap "⚡ 10 USDC" buy. Opens the trade sheet prefilled with a live quote:
 * the user still sees the score, acknowledges any red flags and signs in their
 * own wallet — nothing is bought without that.
 */
export function FlashBuy({ token, className = "" }: { token: TokenSummary; className?: string }) {
  const wallet = useArcWallet()
  const [open, setOpen] = useState(false)
  if (!TRADING_ENABLED || !token.pairAddress) return null
  const risky = token.fake || token.band === "risk"
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        title={risky ? "Riven flagged this token — you'll see why before anything is signed" : "Buy 10 USDC of this token"}
        className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-bold transition-[filter] hover:brightness-110 ${
          risky
            ? "text-[var(--rv-caution)] ring-1 ring-[rgba(251,191,36,0.4)]"
            : "bg-[var(--rv-blue)] text-[var(--rv-on-blue)]"
        } ${className}`}
      >
        <svg viewBox="0 0 24 24" width={12} height={12} fill="currentColor" aria-hidden>
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
        {FLASH_USDC} USDC
      </button>
      {/* Portal + stopPropagation: cards are links, and clicks inside the
          sheet must never bubble up and navigate away mid-trade. */}
      {open &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <TradeSheet token={token} wallet={wallet} initialSide="buy" initialAmount={FLASH_USDC} onClose={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </>
  )
}

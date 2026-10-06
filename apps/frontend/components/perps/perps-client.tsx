"use client"

import { PerpsPanel } from "@/components/terminal/perps-panel"
import { PERPS_ENABLED } from "@/lib/flags"

export function PerpsClient() {
  if (!PERPS_ENABLED) return null
  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="rv-num text-[12px] text-[var(--rv-cyan)]">riven@perps:~$ scan --sakz-engine</p>
          <h1 className="rv-display text-[28px] font-extrabold text-[var(--rv-ink)]">Perps terminal</h1>
          <p className="rv-body max-w-2xl text-[13px] text-[var(--rv-ink-2)]">
            Live Hyperliquid markets with a TradingView chart, order book and funding — plus sakz-bot&apos;s scanner calls
            with entry, stop, three targets and a verified track record. Practice orders use a paper account at
            Hyperliquid&apos;s 0.045% taker fee; real orders open on Hyperliquid.
          </p>
        </div>
        <a
          href="https://app.hyperliquid.xyz/trade"
          target="_blank"
          rel="noreferrer"
          className="rv-body rounded-md bg-[var(--rv-blue)] px-4 py-2 text-[13px] font-semibold text-white"
        >
          Trade live on Hyperliquid ↗
        </a>
      </header>
      <PerpsPanel />
    </div>
  )
}

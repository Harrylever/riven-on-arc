"use client"

import { useEffect, useState } from "react"
import { PerpsPanel, type PerpSignal, type PerpStats } from "@/components/perps/perps-panel"
import { MascotStage } from "@/components/mascot/mascot-stage"
import type { Holo } from "@/components/mascot/mascot"
import { PERPS_ENABLED } from "@/lib/flags"

const LINES = [
  "Paper trading only — practise before risking real money.",
  "Every call shows entry, stop and three targets. Check the track record first.",
  "Set TP1–3 and a stop in one click, then confirm.",
  "I never place real orders for you.",
]

/** Riven reads the scanner's numbers off his wrist: track record + the strongest open call. */
function useSignalHolos() {
  const [holos, setHolos] = useState<Holo[]>([])
  useEffect(() => {
    let cancelled = false
    fetch("/api/perp-signals?status=open&take=40", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { signals?: PerpSignal[]; stats?: PerpStats } | null) => {
        if (cancelled || !json) return
        const out: Holo[] = []
        const s = json.stats
        if (s && s.confirmedTrades > 0) {
          out.push({
            title: "Scanner win rate",
            value: `${s.winRate}%`,
            note: `${s.wins} wins of ${s.confirmedTrades} confirmed calls`,
            bars: [s.perTargetHit.t1Rate / 100, s.perTargetHit.t2Rate / 100, s.perTargetHit.t3Rate / 100],
            tone: s.winRate >= 55 ? "green" : "amber",
          })
        }
        const top = [...(json.signals ?? [])].sort((a, b) => b.confidence - a.confidence)[0]
        if (top) {
          out.push({
            title: `Top call · ${top.symbol.replace(/USDT?$/, "")}`,
            value: `${top.bias} ${top.confidence}%`,
            note: `Entry ${top.entryPrice} · stop ${top.stopLoss}`,
            tone: top.bias === "LONG" ? "green" : "red",
          })
        }
        if (s) {
          out.push({
            title: "Stop-loss rate",
            value: `${s.stopLossRate}%`,
            note: "How often calls hit the stop",
            tone: s.stopLossRate > 35 ? "red" : "blue",
          })
        }
        setHolos(out)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return holos
}

export function PerpsClient() {
  const holos = useSignalHolos()
  if (!PERPS_ENABLED) return null
  return (
    <div className="flex flex-col gap-4">
      <header className="rv-card relative grid items-center gap-2 overflow-hidden p-4 sm:p-5 lg:grid-cols-[1fr_380px]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_40%,rgba(124,196,232,0.14),transparent_60%)]"
          aria-hidden
        />
        <div className="relative">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 py-1 text-[12px] text-[var(--rv-ink-2)]">
            <span className="rv-live-dot" /> Paper trading · Hyperliquid prices
          </p>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight text-[var(--rv-ink)] sm:text-[34px]">
            Perps terminal
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-[var(--rv-ink-2)]">
            Live Hyperliquid markets with a TradingView chart, order book and funding — plus sakz-bot&apos;s scanner calls
            with entry, stop, three targets and a verified track record. Practice orders use a paper account at
            Hyperliquid&apos;s 0.045% taker fee. Nothing is sent to an exchange.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="#perp-signals" className="rv-btn h-10 px-5">
              See open calls
            </a>
            <a
              href="https://app.hyperliquid.xyz/trade"
              target="_blank"
              rel="noreferrer"
              className="rv-btn-ghost h-10 px-5"
            >
              Trade live on Hyperliquid ↗
            </a>
          </div>
        </div>
        <MascotStage
          className="relative -my-2 h-[260px] lg:h-[300px]"
          framing="full"
          holos={holos}
          holoSize={0.5}
          lines={LINES}
          greet="Riven here — I read the scanner so you don't trade blind."
          bubbleSide="left"
        />
      </header>
      <PerpsPanel />
    </div>
  )
}

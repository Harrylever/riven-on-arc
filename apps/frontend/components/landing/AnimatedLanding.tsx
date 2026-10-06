"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ARC_PORT_MODE } from "@/lib/flags"

export interface LandingStats {
  indexed: number | null
  scored: number | null
  kolsActive: number | null
  signals: number | null
}

const INTRO = [
  "CONNECTING TO ARC MAINNET",
  "CHECKING MEMESPAD FACTORY",
  "FACTORY EVENT ABI VERIFICATION PENDING",
  "RAW LOG INDEXING · NO SCORES YET",
]

function useCountUp(target: number | null, run: boolean): number | null {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (target === null || !run) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1200)
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run])
  return target === null ? null : v
}

function Stat({
  label,
  value,
  run,
}: {
  label: string
  value: number | null
  run: boolean
}) {
  const shown = useCountUp(value, run)
  return (
    <div>
      <div
        className="text-3xl font-extrabold tabular-nums"
        style={{ fontFamily: "var(--font-display)", color: "var(--brand)" }}
      >
        {shown === null ? "—" : shown.toLocaleString()}
      </div>
      <div className="mt-1 text-[11px] tracking-wider text-[var(--text-muted)] uppercase">
        {label}
      </div>
    </div>
  )
}

export function AnimatedLanding({ stats }: { stats: LandingStats }) {
  const [phase, setPhase] = useState<"intro" | "ready">("intro")
  const [line, setLine] = useState(0)

  useEffect(() => {
    let seen = false
    try {
      seen = sessionStorage.getItem("clawdex_intro_seen") === "1"
    } catch {}
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    if (seen || reduced) {
      // sessionStorage/matchMedia are browser-only — this can't run during SSR
      // render, so the initial "seen it already" decision has to happen here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("ready")
      return
    }
    const timers = INTRO.map((_, i) => setTimeout(() => setLine(i), i * 450))
    const done = setTimeout(
      () => {
        setPhase("ready")
        try {
          sessionStorage.setItem("clawdex_intro_seen", "1")
        } catch {}
      },
      INTRO.length * 450 + 300,
    )
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(done)
    }
  }, [])

  const ready = phase === "ready"
  const features = ARC_PORT_MODE
    ? [
        [
          "Raw event indexing",
          "Memepad factory logs are being collected. Launch records remain unavailable until the factory event format is verified.",
        ],
        [
          "On-chain inspection",
          "Arc contract metadata and bytecode can be inspected, but bytecode heuristics are not safety guarantees and no score is available yet.",
        ],
        [
          "Agent analysis",
          "Token analysis is paused until verified launch signals are connected. ClawDex will not infer scores from incomplete data.",
        ],
      ]
    : [
        [
          "Rug gate",
          "Mint authority, freeze authority and LP lock are read from chain. Fail two and the score is capped at 2 out of 10.",
        ],
        [
          "Open score",
          "Concentration, burns and liquidity, each shown with its number. Nothing here is paid for.",
        ],
        [
          "Agent, not advice",
          "Ask why a token scored what it did. The agent cites its data and never tells you to buy or sell.",
        ],
      ]

  return (
    <div className="relative">
      <style>{`
        @keyframes cdx-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        @keyframes cdx-scan { from { transform: translateY(-100%); } to { transform: translateY(100%); } }
        @keyframes cdx-blink { 50% { opacity: 0.2; } }
        .cdx-rise { opacity: 0; animation: cdx-rise .7s ease forwards; }
        @media (prefers-reduced-motion: reduce) { .cdx-rise { animation: none; opacity: 1; } }
      `}</style>

      {!ready && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[var(--ground)]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[var(--brand-tint-strong)] to-transparent"
            style={{ animation: "cdx-scan 1.4s linear infinite" }}
          />
          <div className="font-mono text-sm tracking-[0.2em] text-[var(--brand)]">
            {INTRO[line]}
            <span style={{ animation: "cdx-blink 0.8s infinite" }}> ▊</span>
          </div>
        </div>
      )}

      <section className="mx-auto max-w-[1120px] px-6 py-20 text-center">
        <div
          className={ready ? "cdx-rise" : "opacity-0"}
          style={{ animationDelay: "0ms" }}
        >
          <div className="font-mono text-[11px] font-semibold tracking-[0.14em] text-[var(--brand)] uppercase">
            Arc launch intelligence
          </div>
          <h1
            className="mx-auto mt-3 max-w-3xl text-5xl leading-[1.02] font-extrabold tracking-tight sm:text-7xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {ARC_PORT_MODE
              ? "Arc launches, indexed with transparency."
              : "Know what you are buying before you buy it."}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--text-secondary)]">
            {ARC_PORT_MODE
              ? "Launches and scores will appear after factory events are verified and decoded. No launch risk score is being published yet."
              : "Every launch scored on on-chain signals that cannot be bought, with an agent that explains the score in plain English."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={ARC_PORT_MODE ? "/ecosystem" : "/terminal"}
              className="rounded-none px-6 py-3 text-base font-semibold"
              style={{
                background: "var(--brand)",
                color: "var(--text-on-brand)",
              }}
            >
              {ARC_PORT_MODE ? "View indexing status" : "Open the terminal"}
            </Link>
            <Link
              href={ARC_PORT_MODE ? "/search" : "/agent"}
              className="rounded-none border border-[var(--border-strong)] px-6 py-3 text-base font-semibold"
            >
              {ARC_PORT_MODE ? "Inspect an address" : "Ask the agent"}
            </Link>
          </div>
        </div>

        <div
          className={`mt-16 grid grid-cols-2 gap-8 sm:grid-cols-4 ${ready ? "cdx-rise" : "opacity-0"}`}
          style={{ animationDelay: "250ms" }}
        >
          <Stat
            label={ARC_PORT_MODE ? "Arc launches indexed" : "Tokens indexed"}
            value={stats.indexed}
            run={ready}
          />
          <Stat
            label={ARC_PORT_MODE ? "Arc scores available" : "Tokens scored"}
            value={stats.scored}
            run={ready}
          />
          <Stat
            label={
              ARC_PORT_MODE ? "Arc contracts checked" : "KOLs active recently"
            }
            value={stats.kolsActive}
            run={ready}
          />
          <Stat
            label={ARC_PORT_MODE ? "Arc alerts issued" : "Monitoring signals"}
            value={stats.signals}
            run={ready}
          />
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          {ARC_PORT_MODE
            ? "Arc launch and score counts are withheld until verified data is available."
            : "Counted live from ClawDex&apos;s database and the MadeOnSol feed."}
        </p>
      </section>

      <section className="mx-auto grid max-w-[1120px] gap-4 px-6 pb-20 sm:grid-cols-3">
        {features.map(([title, body], i) => (
          <div
            key={title}
            className={`rounded-none border border-[var(--border)] bg-[var(--surface)] p-5 text-left ${ready ? "cdx-rise" : "opacity-0"}`}
            style={{ animationDelay: `${450 + i * 120}ms` }}
          >
            <div
              className="text-lg font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {title}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              {body}
            </p>
          </div>
        ))}
      </section>
    </div>
  )
}

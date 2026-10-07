"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { PerpMarket } from "@/lib/hyperliquid"
import type { PerpInsight } from "@/lib/perp-insight"
import type { Holo, Mood } from "@/components/mascot/mascot"
import { useRiven, useRivenPage } from "@/components/mascot/riven-context"
import { PerpTerminal } from "@/components/perps/perp-terminal"
import { PerpWatch } from "@/components/perps/perp-watch"
import { SignalOrderModal } from "@/components/perps/signal-order-modal"
import { NewsFeed } from "@/components/perps/news-feed"
import { CoinIcon } from "@/components/perps/coin-icon"
import { TelegramConnect } from "@/components/riven/telegram-connect"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { signalCoinKey } from "@/lib/perp-symbols"
import { ago, priceUsd } from "@/lib/format"
import { DISCLAIMER } from "@/lib/site"

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`

/**
 * One perp pair: chart + paper trading, alerts and tracking, sakz-bot's call,
 * the news moving it — and Riven's read tying them together. Tap Riven (or
 * Scan) and he reads it out; double-tap him to ask a question out loud.
 */
export function PerpPairClient({ coin }: { coin: string }) {
  const router = useRouter()
  const riven = useRiven()
  const [markets, setMarkets] = useState<PerpMarket[] | null>(null)
  const [insight, setInsight] = useState<PerpInsight | null>(null)
  const [signals, setSignals] = useState<PerpSignal[] | null>(null)
  const [order, setOrder] = useState<PerpSignal | null>(null)
  const [flash, setFlash] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch("/api/perps/markets", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { markets?: PerpMarket[] } | null) => alive && j?.markets && setMarkets(j.markets))
        .catch(() => {})
    void load()
    const id = window.setInterval(() => document.visibilityState === "visible" && void load(), 10_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  const loadInsight = useCallback(
    () =>
      fetch(`/api/perps/insight?coin=${coin}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: PerpInsight | null) => j && setInsight(j))
        .catch(() => {}),
    [coin],
  )
  useEffect(() => {
    void loadInsight()
    const id = window.setInterval(() => void loadInsight(), 60_000)
    return () => window.clearInterval(id)
  }, [loadInsight])

  useEffect(() => {
    fetch("/api/perp-signals?status=all&take=200", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { signals?: PerpSignal[] } | null) => setSignals((j?.signals ?? []).filter((s) => signalCoinKey(s.symbol) === coin)))
      .catch(() => setSignals([]))
  }, [coin])

  const market = markets?.find((m) => m.symbol.toUpperCase() === coin) ?? null
  const open = signals?.find((s) => s.outcome === "pending") ?? null
  const signalByCoin = useMemo(() => new Map(open ? [[coin, open]] : []), [open, coin])
  const up = (market?.change24h ?? 0) >= 0

  const mood: Mood = insight?.mood ?? "idle"
  const holos: Holo[] = market
    ? [
        {
          title: `${coin} · Riven's read`,
          value: pct(market.change24h),
          note: insight?.why ?? "Reading the market, funding and news…",
          gauge: insight ? insight.activity / 10 : undefined,
          tone: up ? "green" : "red",
        },
        {
          title: "Funding APR",
          value: `${market.fundingApr.toFixed(1)}%`,
          tone: market.fundingBias === "NEUTRAL" ? "blue" : "amber",
        },
        { title: "News 24h", value: String(insight?.news.filter((n) => Date.now() - +new Date(n.publishedAt) < 86_400_000).length ?? "—"), tone: "blue" },
        { title: "sakz call", value: open ? `${open.bias} ${open.confidence}/10` : "none", tone: open ? (open.bias === "LONG" ? "green" : "red") : "blue" },
      ]
    : []
  useRivenPage({
    mood,
    holos,
    topic: { kind: "perp", coin },
    lines: insight ? [insight.why, ...insight.bullets.slice(0, 3), "Double-tap me to ask about this pair out loud."] : undefined,
    greet: insight ? insight.why : undefined,
    scan: {
      hasData: !!market,
      onPress: () => void loadInsight(),
      onDone: () => {
        setFlash((f) => f + 1)
        document.getElementById("read")?.scrollIntoView({ behavior: "smooth", block: "start" })
      },
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <Link href="/perps" className="w-fit text-[13px] font-semibold text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]">
        ← All pairs
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <CoinIcon coin={coin} size={44} />
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight text-[var(--rv-ink)]">
            {coin}
            <span className="text-[16px] font-semibold text-[var(--rv-ink-3)]">-PERP</span>
          </h1>
          <p className="text-[12px] text-[var(--rv-ink-3)]">Hyperliquid · paper trading · max {market?.maxLeverage ?? "—"}x</p>
        </div>
        {market && (
          <div className="ml-2">
            <p className="rv-num text-[22px] font-bold text-[var(--rv-ink)]">{priceUsd(market.markPrice)}</p>
            <p className="rv-num text-[13px] font-semibold" style={{ color: up ? "var(--rv-up)" : "var(--rv-down)" }}>
              {pct(market.change24h)} 24h
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => riven.scan()}
          className="rv-btn ml-auto h-9 gap-1.5 px-3 text-[13px]"
          title="Riven reads the market, funding, news and the scanner for this pair"
        >
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.2-4.2" />
          </svg>
          Why is it moving?
        </button>
      </header>

      {/* Riven's read: the analysis engine's plain-English take */}
      <section
        id="read"
        key={`read-${flash}`}
        className="rv-card scroll-mt-28 p-4"
        style={flash ? { animation: "rv-flash 1.6s ease-out" } : undefined}
      >
        <div className="flex items-center gap-2">
          <p className="rv-label">Riven&apos;s read</p>
          {insight && (
            <span className="rv-num ml-auto text-[11.5px] text-[var(--rv-ink-3)]">
              Activity {insight.activity}/10 · not a buy score
            </span>
          )}
        </div>
        {insight ? (
          <>
            <p className="mt-1.5 text-[15px] leading-snug font-semibold text-[var(--rv-ink)]">{insight.why}</p>
            <ul className="mt-2 flex flex-col gap-1 text-[13px] leading-relaxed text-[var(--rv-ink-2)]">
              {insight.bullets.map((b, i) => (
                <li key={i}>• {b}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] text-[var(--rv-ink-3)]">
              From Hyperliquid, sakz-bot and crypto news. Riven explains; you decide. {DISCLAIMER}
            </p>
          </>
        ) : (
          <div className="mt-2 h-16 animate-pulse rounded-md bg-white/[0.04]" />
        )}
      </section>

      {market && markets ? (
        <PerpTerminal
          market={market}
          markets={markets}
          signal={open}
          signalByCoin={signalByCoin}
          onSelect={(s) => router.push(`/perps/${s.toUpperCase()}`)}
        />
      ) : markets ? (
        <p className="rv-card px-4 py-8 text-center text-[13px] text-[var(--rv-ink-2)]">
          Hyperliquid has no {coin} perp. <Link href="/perps" className="text-[var(--rv-ice)] hover:underline">See all pairs</Link>
        </p>
      ) : (
        <div className="rv-card h-[420px] animate-pulse" />
      )}

      {/* sakz-bot's call on this pair */}
      {open && (
        <section className="rv-card flex flex-wrap items-center gap-3 p-4">
          <span
            className="rounded px-2 py-0.5 text-[12px] font-extrabold"
            style={{ color: "#0b0b0d", background: open.bias === "LONG" ? "var(--rv-up)" : "var(--rv-down)" }}
          >
            {open.bias}
          </span>
          <div className="rv-num min-w-0 flex-1 text-[13px] text-[var(--rv-ink-2)]">
            <b className="text-[var(--rv-ink)]">sakz-bot call</b> · conviction {open.confidence}/10 · entry {priceUsd(open.entryLow)}–
            {priceUsd(open.entryHigh)} · stop {priceUsd(open.stopLoss)} · targets {priceUsd(open.t1)} / {priceUsd(open.t2)} /{" "}
            {priceUsd(open.t3)} · {ago(open.scanTime)}
          </div>
          <button type="button" onClick={() => setOrder(open)} className="rv-btn h-9 px-4 text-[13px]">
            Paper trade this call
          </button>
        </section>
      )}

      {market && markets && <PerpWatch market={market} markets={markets} signals={signals} onSelect={(s) => router.push(`/perps/${s.toUpperCase()}`)} />}
      <TelegramConnect />

      <NewsFeed coin={coin} limit={9} />

      {order && <SignalOrderModal key={order.id} signal={order} onClose={() => setOrder(null)} />}
    </div>
  )
}

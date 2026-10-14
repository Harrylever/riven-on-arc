"use client"

import Link from "next/link"
import { Carousel } from "@/components/riven/carousel"
import type { PerpSignal } from "@/components/perps/perps-panel"
import { CoinIcon, coinArtUrl } from "@/components/perps/coin-icon"
import { ago, priceUsd } from "@/lib/format"
import { signalCoinKey, venueName } from "@/lib/perp-symbols"
import { ArrowIcon } from "@/components/riven/arrow"
import { Progress } from "@/components/ui/progress"
import { Card } from "@/components/ui/card"

const OUTCOME: Record<string, { label: string; color: string }> = {
  pending: { label: "Live", color: "var(--rv-blue)" },
  t1_hit: { label: "Hit T1", color: "var(--rv-up)" },
  t2_hit: { label: "Hit T2", color: "var(--rv-up)" },
  t3_hit: { label: "Hit T3", color: "var(--rv-up)" },
  sl_hit: { label: "Stopped", color: "var(--rv-down)" },
  expired: { label: "Expired", color: "var(--rv-ink-3)" },
}

const pctFrom = (from: number, to: number) =>
  from > 0 ? ((to - from) / from) * 100 : 0

/** The pair's own logo, big, over a soft blurred copy of itself — readable at a glance. */
function CoinArt({ coin, long }: { coin: string; long: boolean }) {
  const url = coinArtUrl(coin)
  return (
    <>
      <div
        className="absolute inset-0 scale-150 opacity-40 blur-2xl"
        style={{
          backgroundImage: `url(${url})`,
          backgroundSize: "60%",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 55%, transparent 30%, ${long ? "rgba(20,40,8,0.55)" : "rgba(48,10,10,0.55)"} 100%)`,
        }}
        aria-hidden
      />
      <div className="absolute inset-0 grid place-items-center">
        <div className="drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:scale-105">
          <CoinIcon coin={coin} size={88} />
        </div>
      </div>
    </>
  )
}

/** Riven Scanner's calls as a gliding row of cards; each opens that pair's page. */
export function SignalCarousel({
  signals,
  marks,
  marksReady,
}: {
  signals: PerpSignal[]
  /** Live mark price per base coin (Hyperliquid). */
  marks: Map<string, number>
  /** False until Hyperliquid's prices have loaded, so a missing price isn't mistaken for "not listed". */
  marksReady: boolean
}) {
  if (signals.length === 0) {
    return (
      <Card
        variant="riven"
        className="px-4 py-6 text-center text-[13px] text-[var(--rv-ink-2)]"
      >
        No open Riven Scanner calls right now. It scans every ~10 minutes;
        connect Telegram below to get the next one.
      </Card>
    )
  }
  return (
    <Carousel label="Live scanner calls">
      {signals.map((s) => {
        const coin = signalCoinKey(s.symbol)
        const long = s.bias === "LONG"
        const col = long ? "var(--rv-up)" : "var(--rv-down)"
        const mark = marks.get(coin) ?? null
        const o = OUTCOME[s.outcome] ?? OUTCOME.pending!
        const t1Pct = pctFrom(s.entryPrice, s.t1)
        const slPct = pctFrom(s.entryPrice, s.stopLoss)
        return (
          <Link
            key={s.id}
            href={`/perps/${coin}`}
            className="group relative flex w-[232px] shrink-0 flex-col overflow-hidden rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-card)] text-left transition-colors hover:border-[var(--rv-stroke-strong)]"
          >
            <div
              className="relative aspect-[5/3] w-full overflow-hidden"
              style={{
                background: `linear-gradient(160deg, ${long ? "rgba(163,230,53,0.16)" : "rgba(248,113,113,0.16)"}, var(--rv-sunken) 70%)`,
              }}
            >
              <CoinArt coin={coin} long={long} />
              <span
                className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[11px] font-extrabold"
                style={{ color: "#0b0b0d", background: col }}
              >
                {s.bias}
              </span>
              <span
                className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] font-bold"
                style={{ color: o.color }}
              >
                {o.label}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-[var(--rv-ink)]">
                    {coin}
                    <span className="text-[11.5px] font-semibold text-[var(--rv-ink-3)]">
                      {" "}
                      /USDT
                    </span>
                  </p>
                  <p className="text-[11px] text-[var(--rv-ink-3)]">
                    Called on {venueName(s.exchange)} · {ago(s.scanTime)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="rv-num text-[13px] font-bold text-[var(--rv-ink)]">
                    {priceUsd(mark ?? s.entryPrice)}
                  </p>
                  <p className="text-[10.5px] text-[var(--rv-ink-3)]">
                    {mark
                      ? "live price"
                      : marksReady
                        ? "entry · no live market"
                        : "entry"}
                  </p>
                </div>
              </div>
              {/* conviction */}
              <div className="flex items-center gap-2">
                <Progress
                  value={Math.min(100, s.confidence * 10)}
                  aria-label="Conviction"
                  className="block flex-1"
                  trackClassName="h-1.5 rounded-full bg-white/[0.06]"
                  indicatorClassName="rounded-full"
                  indicatorStyle={{ background: col }}
                />
                <span className="rv-num text-[11px] font-semibold text-[var(--rv-ink-2)]">
                  {s.confidence}/10
                </span>
              </div>
              <div className="rv-num grid grid-cols-3 gap-1 text-[10.5px]">
                <span className="text-[var(--rv-ink-3)]">
                  Entry · {venueName(s.exchange)}
                  <b className="block text-[11.5px] text-[var(--rv-ink)]">
                    {priceUsd(s.entryPrice)}
                  </b>
                </span>
                <span className="text-[var(--rv-ink-3)]">
                  T1
                  <b
                    className="block text-[11.5px]"
                    style={{ color: "var(--rv-up)" }}
                  >
                    {t1Pct >= 0 ? "+" : ""}
                    {t1Pct.toFixed(1)}%
                  </b>
                </span>
                <span className="text-[var(--rv-ink-3)]">
                  Stop
                  <b
                    className="block text-[11.5px]"
                    style={{ color: "var(--rv-down)" }}
                  >
                    {slPct >= 0 ? "+" : ""}
                    {slPct.toFixed(1)}%
                  </b>
                </span>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[11.5px] font-semibold text-[var(--rv-ice)] group-hover:underline">
                Chart, plan & Riven's read
                <ArrowIcon className="size-3" />
              </span>
            </div>
          </Link>
        )
      })}
    </Carousel>
  )
}

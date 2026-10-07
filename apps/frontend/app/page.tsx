import type { Metadata } from "next"
import Link from "next/link"
import { getAlerts, getArcPulse, getCallouts, getScreener, getStats } from "@/lib/arc-data"
import { DEFAULT_FILTERS } from "@/lib/screener-params"
import { REASON_LABEL } from "@/lib/reasons"
import { compact, usd } from "@/lib/riven-format"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site"
import {
  AlertList,
  CalloutsRow,
  CaughtList,
  SectionTitle,
  TopCarousel,
} from "@/components/riven/home-sections"
import { MascotStage } from "@/components/mascot/mascot-stage"
import { BigOrb } from "@/components/riven/orb-field"
import type { Holo } from "@/components/mascot/mascot"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
}

const settle = <T,>(p: Promise<T>, fallback: T) =>
  p.catch((err: Error) => {
    console.error(`[home] ${err.message}`)
    return fallback
  })

export default async function Home() {
  const [stats, topRaw, caught, alerts, callouts, pulse] = await Promise.all([
    settle(getStats(), null),
    // carousel: what's trading right now with real liquidity (flagged ones dropped below)
    settle(getScreener({ ...DEFAULT_FILTERS, view: "all", minLiq: 1000, tf: "1h" }, 24), null),
    settle(
      getScreener({ ...DEFAULT_FILTERS, view: "caught", sort: "new" }, 6),
      null,
    ),
    settle(getAlerts({ limit: 6 }), []),
    settle(getCallouts(12), []),
    settle(getArcPulse(), null),
  ])
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  const flaggedPct =
    stats && stats.launches24h
      ? Math.round((stats.fake24h / stats.launches24h) * 100)
      : null
  // results are shared from a cache: copy, never mutate
  const top = topRaw ? { ...topRaw, tokens: topRaw.tokens.filter((t) => !t.fake).slice(0, 14) } : null
  const wall = (top?.tokens ?? []).filter((t) => t.image).slice(0, 12)

  // Holograms Riven pulls up in the hero — all live numbers.
  const topVol = (top?.tokens ?? []).slice(0, 8).map((t) => t.volume.h24 ?? 0)
  const maxVol = Math.max(1, ...topVol)
  const reasons = stats?.reasons24h ?? []
  const maxReason = Math.max(1, ...reasons.map((r) => r.count))
  const mover = [...(top?.tokens ?? [])].sort(
    (a, b) => (b.change.h24 ?? -1e9) - (a.change.h24 ?? -1e9),
  )[0]
  const holos: Holo[] = [
    {
      title: "Arc volume · 24h",
      value: stats ? usd(stats.volume24h) : "—",
      bars: topVol.map((v) => v / maxVol),
      tone: "blue",
    },
    {
      title: "Flagged today",
      value: stats
        ? `${compact(stats.fake24h)} of ${compact(stats.launches24h)}`
        : "—",
      bars: reasons.map((r) => r.count / maxReason),
      tone: "red",
    },
    ...(mover && mover.change.h24 !== null
      ? [
          {
            title: `Top mover · ${mover.symbol}`,
            value: `${mover.change.h24 >= 0 ? "+" : ""}${Math.round(mover.change.h24)}%`,
            tone: "green" as const,
          },
        ]
      : []),
  ]
  const lines = [
    stats
      ? `${compact(stats.launches24h)} tokens launched on Arc today. I checked every one.`
      : "I check every token on Arc.",
    stats && stats.fake24h
      ? `${compact(stats.fake24h)} got flagged — scroll to "Caught today" for the receipts.`
      : "Nothing flagged yet today.",
    "I never guess a score. If the chain hasn't told me enough, I say so.",
    "Tap me and I'll pull up the numbers.",
  ]

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="relative -mx-4 -mt-5 overflow-hidden border-b border-[var(--rv-stroke)] px-4 pt-14 pb-12 sm:pt-20 sm:pb-16">
        {/* Faded wall of real Arc token art, like a trading floor behind glass. */}
        <div
          className="pointer-events-none absolute inset-0 grid grid-cols-4 gap-3 p-3 opacity-[0.16] sm:grid-cols-6 lg:grid-cols-12"
          aria-hidden
        >
          {[...wall, ...wall].map((t, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- decorative remote launch art
            <img
              key={`${t.address}-${i}`}
              src={t.image!}
              alt=""
              referrerPolicy="no-referrer"
              className="aspect-square w-full rounded-xl object-cover"
            />
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,15,18,0.55)_0%,var(--rv-bg)_72%)]"
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-card)] px-3 py-1 text-[12px] text-[var(--rv-ink-2)]">
              <span className="rv-live-dot" /> Live on Arc mainnet
            </p>
            <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-0.035em] text-[var(--rv-ink)] sm:text-[64px] lg:text-[68px]">
              Every token on Arc,
              <br />
              <span className="text-[var(--rv-blue)]">rug-checked.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-[var(--rv-ink-2)] sm:text-[18px]">
              A 1–10 safety score for every Arc launch, from facts anyone can
              check on-chain — and the evidence when a token is faking it.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/trending" className="rv-btn h-12 px-6 text-[15px]">
                Open the screener →
              </Link>
              <Link
                href="/methodology"
                className="rv-btn-ghost h-12 px-6 text-[15px]"
              >
                How the score works
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-[var(--rv-ink-3)] lg:justify-start">
              <span className="rv-label">Reads directly from</span>
              <span className="text-[var(--rv-ink-2)]">Arc</span>
              <span className="text-[var(--rv-ink-2)]">Uniswap v4</span>
              <span className="text-[var(--rv-ink-2)]">Argus</span>
              <span className="text-[var(--rv-ink-2)]">Tolly</span>
              <span className="text-[var(--rv-ink-2)]">Circle USDC</span>
            </div>
          </div>
          <div className="relative order-first h-[300px] sm:h-[380px] lg:order-none lg:h-[520px]">
            {/* Riven's "thinking" orb, cycling through every state behind him */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
              <BigOrb size={560} showLabel className="w-[min(560px,108%)] opacity-90" />
            </div>
            <div
              className="pointer-events-none absolute inset-x-10 bottom-6 h-24 rounded-[100%] bg-[radial-gradient(ellipse,rgba(124,196,232,0.25),transparent_70%)] blur-xl"
              aria-hidden
            />
            <MascotStage
              className="h-full w-full"
              holos={holos}
              lines={lines}
              greet="Hey, I'm Riven. I rug-check every token on Arc."
              lively
              intro
              autoScan={false}
              bubbleSide="bottom"
            />
          </div>
        </div>

        {/* Riven in numbers */}
        <dl className="relative mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-stroke)] sm:grid-cols-4">
          <Stat
            label="Launches · 24h"
            value={stats ? compact(stats.launches24h) : "—"}
          />
          <Stat
            label="Flagged · 24h"
            value={stats ? compact(stats.fake24h) : "—"}
            sub={flaggedPct !== null ? `${flaggedPct}% of launches` : undefined}
            color="var(--rv-risk)"
          />
          <Stat
            label="Volume · 24h"
            value={stats ? usd(stats.volume24h) : "—"}
          />
          <Stat
            label="Tokens tracked"
            value={stats ? compact(stats.tokensTracked) : "—"}
          />
        </dl>
      </section>

      {/* Built for Arc: what USDC-native gas lets Riven measure */}
      {pulse && (
        <section aria-label="Arc pulse">
          <SectionTitle title="Arc pulse · last 24h" live />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PulseCard
              value={usd(pulse.realUsdcInTradingPools)}
              label="Real USDC in trading pools"
              hint={`Across ${compact(pulse.tradingPools)} pools — what sellers can actually exit into`}
              color="var(--rv-blue)"
            />
            <PulseCard
              value={String(pulse.liquidityPulls24h)}
              label="Liquidity pulls caught"
              hint="Launch liquidity removed from the pool"
              color="var(--rv-risk)"
            />
            <PulseCard
              value={String(pulse.creatorSells24h + pulse.whaleSells24h)}
              label="Creator & whale sells caught"
              hint={`${pulse.creatorSells24h} creators sold out · ${pulse.whaleSells24h} whales sold 5%+`}
              color="var(--rv-caution)"
            />
            <PulseCard
              value={String(pulse.livePerpCalls)}
              label="Live perp calls"
              hint="Margined in Arc USDC (paper) · self-calibrating scanner"
              color="var(--rv-healthy)"
              href="/perps"
            />
          </div>
          <div className="mt-3 grid gap-2 text-[12.5px] text-[var(--rv-ink-2)] sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["USDC is gas", "Every Arc fee and pool is in dollars — so Riven's checks read in plain dollars too."],
              ["Real dollars, not paper liquidity", "Riven reads each pool's actual USDC on-chain, not the token valued at its own price."],
              ["⚡ 10 USDC flash buy", "Non-custodial: you sign every swap in your own wallet. Riven never holds keys."],
              ["Perps with Arc USDC", "Your Arc USDC balance becomes your perps margin — practise on 100+ markets."],
            ].map(([t, d]) => (
              <div key={t} className="rv-card px-3 py-2.5">
                <p className="font-semibold text-[var(--rv-ink)]">{t}</p>
                <p className="mt-0.5 leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {top && top.tokens.length > 0 && (
        <section>
          <SectionTitle
            title="Most traded on Arc"
            href="/trending"
            cta="Full screener"
            live
          />
          <TopCarousel tokens={top.tokens} />
        </section>
      )}

      <section>
        <SectionTitle title="Callouts" live />
        <CalloutsRow callouts={callouts} now={now} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle
            title="Caught today"
            href="/trending?view=caught"
            cta="All flagged"
          />
          {stats && stats.reasons24h.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {stats.reasons24h.map((r) => (
                <span
                  key={r.code}
                  className="rv-chip"
                  title={REASON_LABEL[r.code]?.hint}
                >
                  <span className="rv-num text-[var(--rv-risk)]">
                    {r.count}
                  </span>
                  {REASON_LABEL[r.code]?.label ?? r.code}
                </span>
              ))}
            </div>
          )}
          <CaughtList tokens={caught?.tokens ?? []} now={now} />
        </section>
        <section>
          <SectionTitle
            title="Rug radar"
            href="/alerts"
            cta="All alerts"
            live
          />
          <AlertList alerts={alerts} now={now} />
        </section>
      </div>
    </div>
  )
}

function PulseCard({
  value,
  label,
  hint,
  color,
  href,
}: {
  value: string
  label: string
  hint: string
  color: string
  href?: string
}) {
  const body = (
    <>
      <p className="rv-num text-[26px] leading-none font-bold" style={{ color }}>
        {value}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-[var(--rv-ink)]">{label}</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--rv-ink-3)]">{hint}</p>
    </>
  )
  return href ? (
    <Link href={href} className="rv-card block p-4 hover:border-[var(--rv-stroke-strong)]">
      {body}
    </Link>
  ) : (
    <div className="rv-card p-4">{body}</div>
  )
}

function Stat({
  label,
  value,
  sub,
  color = "var(--rv-ink)",
}: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-[var(--rv-card)] px-5 py-5 text-center">
      <dd
        className="rv-num text-[28px] font-semibold tracking-tight sm:text-[32px]"
        style={{ color }}
      >
        {value}
      </dd>
      <dt className="rv-label mt-1">{label}</dt>
      {sub && (
        <p className="mt-0.5 text-[11.5px] text-[var(--rv-ink-3)]">{sub}</p>
      )}
    </div>
  )
}

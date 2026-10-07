import type { Metadata } from "next"
import Link from "next/link"
import { getAlerts, getCallouts, getScreener, getStats } from "@/lib/arc-data"
import { DEFAULT_FILTERS } from "@/lib/screener-params"
import { REASON_LABEL } from "@/lib/reasons"
import { compact, usd } from "@/lib/riven-format"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site"
import { AlertList, CalloutsRow, CaughtList, SectionTitle, TopCarousel } from "@/components/riven/home-sections"

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
  const [stats, top, caught, alerts, callouts] = await Promise.all([
    settle(getStats(), null),
    settle(getScreener({ ...DEFAULT_FILTERS, view: "all" }, 12), null),
    settle(getScreener({ ...DEFAULT_FILTERS, view: "caught", sort: "new" }, 6), null),
    settle(getAlerts({ limit: 6 }), []),
    settle(getCallouts(12), []),
  ])
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  const flaggedPct = stats && stats.launches24h ? Math.round((stats.fake24h / stats.launches24h) * 100) : null
  const wall = (top?.tokens ?? []).filter((t) => t.image).slice(0, 12)

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="relative -mx-4 -mt-5 overflow-hidden border-b border-[var(--rv-stroke)] px-4 pt-14 pb-12 sm:pt-20 sm:pb-16">
        {/* Faded wall of real Arc token art, like a trading floor behind glass. */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-4 gap-3 p-3 opacity-[0.16] sm:grid-cols-6 lg:grid-cols-12" aria-hidden>
          {[...wall, ...wall].map((t, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- decorative remote launch art
            <img key={`${t.address}-${i}`} src={t.image!} alt="" referrerPolicy="no-referrer" className="aspect-square w-full rounded-xl object-cover" />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,15,18,0.55)_0%,var(--rv-bg)_72%)]" aria-hidden />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-card)] px-3 py-1 text-[12px] text-[var(--rv-ink-2)]">
            <span className="rv-live-dot" /> Live on Arc mainnet
          </p>
          <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-0.035em] text-[var(--rv-ink)] sm:text-[64px]">
            Every token on Arc,
            <br />
            <span className="text-[var(--rv-blue)]">rug-checked.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-[var(--rv-ink-2)] sm:text-[18px]">
            A 1–10 safety score for every Arc launch, from facts anyone can check on-chain — and the evidence when a token is
            faking it.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/trending" className="rv-btn h-12 px-6 text-[15px]">
              Open the screener →
            </Link>
            <Link href="/methodology" className="rv-btn-ghost h-12 px-6 text-[15px]">
              How the score works
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-[var(--rv-ink-3)]">
            <span className="rv-label">Reads directly from</span>
            <span className="text-[var(--rv-ink-2)]">Arc</span>
            <span className="text-[var(--rv-ink-2)]">Uniswap v4</span>
            <span className="text-[var(--rv-ink-2)]">Argus</span>
            <span className="text-[var(--rv-ink-2)]">Tolly</span>
            <span className="text-[var(--rv-ink-2)]">Circle USDC</span>
          </div>
        </div>

        {/* Riven in numbers */}
        <dl className="relative mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-stroke)] sm:grid-cols-4">
          <Stat label="Launches · 24h" value={stats ? compact(stats.launches24h) : "—"} />
          <Stat
            label="Flagged · 24h"
            value={stats ? compact(stats.fake24h) : "—"}
            sub={flaggedPct !== null ? `${flaggedPct}% of launches` : undefined}
            color="var(--rv-risk)"
          />
          <Stat label="Volume · 24h" value={stats ? usd(stats.volume24h) : "—"} />
          <Stat label="Tokens tracked" value={stats ? compact(stats.tokensTracked) : "—"} />
        </dl>
      </section>

      {top && top.tokens.length > 0 && (
        <section>
          <SectionTitle title="Most traded on Arc" href="/trending" cta="Full screener" live />
          <TopCarousel tokens={top.tokens} />
        </section>
      )}

      <section>
        <SectionTitle title="Callouts" live />
        <CalloutsRow callouts={callouts} now={now} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle title="Caught today" href="/trending?view=caught" cta="All flagged" />
          {stats && stats.reasons24h.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {stats.reasons24h.map((r) => (
                <span key={r.code} className="rv-chip" title={REASON_LABEL[r.code]?.hint}>
                  <span className="rv-num text-[var(--rv-risk)]">{r.count}</span>
                  {REASON_LABEL[r.code]?.label ?? r.code}
                </span>
              ))}
            </div>
          )}
          <CaughtList tokens={caught?.tokens ?? []} now={now} />
        </section>
        <section>
          <SectionTitle title="Rug radar" href="/alerts" cta="All alerts" live />
          <AlertList alerts={alerts} now={now} />
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, color = "var(--rv-ink)" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[var(--rv-card)] px-5 py-5 text-center">
      <dd className="rv-num text-[28px] font-semibold tracking-tight sm:text-[32px]" style={{ color }}>
        {value}
      </dd>
      <dt className="rv-label mt-1">{label}</dt>
      {sub && <p className="mt-0.5 text-[11.5px] text-[var(--rv-ink-3)]">{sub}</p>}
    </div>
  )
}

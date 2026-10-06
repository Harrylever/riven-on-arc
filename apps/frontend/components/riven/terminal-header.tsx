import Link from "next/link"
import { compact } from "@/lib/riven-format"

interface Stats {
  tokensTracked: number
  listed: number
  launches24h: number
  fake24h: number
  healthy24h: number
  risky24h: number
  scored24h: number
  lastBlock: string | null
}

/** The terminal section: blue ASCII rain behind a live read-out of Arc right now. */
export function TerminalHeader({ stats }: { stats: Stats | null }) {
  const fakePct = stats && stats.launches24h ? Math.round((stats.fake24h / stats.launches24h) * 100) : null
  return (
    <section className="relative overflow-hidden rounded-[var(--rv-radius)] border border-[rgba(38,168,255,0.35)] bg-transparent">
      {/* Translucent so the dithered Riven raven behind the page shows through,
          darker on the left where the copy sits. */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.55)_45%,rgba(0,0,0,0.1)_100%)]" />
      <div className="relative px-5 py-6 sm:px-7 sm:py-8">
        <p className="rv-num text-[12px] text-[var(--rv-cyan)]">
          riven@arc:~$ <span className="text-[var(--rv-ink-2)]">scan --all-tokens --anti-rug</span>
          <span className="rv-live-dot ml-1 inline-block align-middle" />
        </p>
        <h1 className="rv-display mt-3 max-w-xl text-[30px] leading-[1.05] font-extrabold text-[var(--rv-ink)] sm:text-[42px]">
          Every token on Arc, <span className="text-[var(--rv-blue)]">rug-checked.</span>
        </h1>
        <p className="rv-body mt-3 max-w-lg text-[14px] leading-relaxed text-[var(--rv-ink-2)]">
          Live prices and volume for every Arc pair, plus a 1–10 safety score from on-chain facts: contract, liquidity,
          holders, creator history and real trading. Fakes are hidden by default.
        </p>
        <dl className="rv-num mt-5 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 text-[12px] sm:grid-cols-4">
          <Stat label="Tokens tracked" value={stats ? compact(stats.tokensTracked) : "—"} />
          <Stat label="Launches · 24h" value={stats ? compact(stats.launches24h) : "—"} />
          <Stat label="Caught faking · 24h" value={fakePct === null ? "—" : `${fakePct}%`} color="var(--rv-risk)" />
          <Stat label="Look healthy · 24h" value={stats ? String(stats.healthy24h) : "—"} color="var(--rv-healthy)" />
        </dl>
        <Link href="/methodology" className="rv-body mt-5 inline-block text-[13px] font-semibold text-[var(--rv-ice)] hover:underline">
          How the 1–10 score works →
        </Link>
      </div>
    </section>
  )
}

function Stat({ label, value, color = "var(--rv-ink)" }: { label: string; value: string; color?: string }) {
  return (
    <div className="border-l border-[var(--rv-stroke-strong)] pl-3">
      <dt className="text-[var(--rv-ink-3)] uppercase">{label}</dt>
      <dd className="mt-1 text-[22px] font-semibold" style={{ color }}>
        {value}
      </dd>
    </div>
  )
}

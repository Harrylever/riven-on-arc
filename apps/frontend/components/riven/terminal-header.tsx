import Link from "next/link"
import { compact } from "@/lib/riven-format"
import { REASON_LABEL } from "@/lib/reasons"

interface Stats {
  tokensTracked: number
  listed: number
  launches24h: number
  fake24h: number
  healthy24h: number
  caution24h: number
  risky24h: number
  scored24h: number
  reasons24h: Array<{ code: string; count: number }>
  lastBlock: string | null
  syncedAt: string | null
}

function ago(iso: string | null, now: number) {
  if (!iso) return "—"
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)}h ago`
}

/**
 * The first screen: what Riven found on Arc in the last 24h, with the receipts
 * one tap away. Leads with the finding, not a dashboard of numbers.
 */
export function TerminalHeader({ stats, now }: { stats: Stats | null; now: number }) {
  const flaggedPct = stats && stats.launches24h ? Math.round((stats.fake24h / stats.launches24h) * 100) : null
  return (
    <section className="rv-card relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_260px_at_0%_0%,rgba(30,123,255,0.16),transparent_70%)]" />
      <div className="relative px-5 py-6 sm:px-7 sm:py-7">
        <p className="rv-num flex items-center gap-2 text-[12px] text-[var(--rv-cyan)]">
          <span className="rv-live-dot inline-block" />
          Live on Arc mainnet · indexed {ago(stats?.syncedAt ?? null, now)}
          {stats?.lastBlock && <span className="text-[var(--rv-ink-3)]">#{Number(stats.lastBlock).toLocaleString()}</span>}
        </p>
        <h1 className="rv-display mt-3 max-w-2xl text-[30px] leading-[1.05] font-extrabold text-[var(--rv-ink)] sm:text-[42px]">
          Every token on Arc, <span className="text-[var(--rv-blue)]">rug-checked.</span>
        </h1>
        <p className="rv-body mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--rv-ink-2)]">
          {stats && stats.launches24h > 0 ? (
            <>
              <b className="text-[var(--rv-ink)]">{compact(stats.launches24h)} tokens launched</b> on Arc in the last 24 hours.{" "}
              <b className="text-[var(--rv-risk)]">
                {compact(stats.fake24h)} {stats.fake24h === 1 ? "was" : "were"} flagged
                {flaggedPct !== null ? ` (${flaggedPct}%)` : ""}
              </b>{" "}
              for things you can check on-chain yourself. Here&apos;s why:
            </>
          ) : (
            <>A 1–10 safety score for every Arc token, from on-chain facts: contract, liquidity, holders, creator history and real trading.</>
          )}
        </p>

        {stats && stats.reasons24h.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Why tokens were flagged">
            {stats.reasons24h.map((r) => (
              <li key={r.code}>
                <Link
                  href="/?view=caught"
                  className="rv-body flex items-center gap-2 rounded-full bg-[rgba(239,68,68,0.08)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--rv-ink)] ring-1 ring-[rgba(239,68,68,0.3)] hover:ring-[var(--rv-risk)]"
                  title={REASON_LABEL[r.code]?.hint}
                >
                  <span className="rv-num text-[var(--rv-risk)]">{r.count}</span>
                  {REASON_LABEL[r.code]?.label ?? r.code}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <dl className="rv-num mt-5 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 text-[12px] sm:grid-cols-4">
          <Stat label="Tokens tracked" value={stats ? compact(stats.tokensTracked) : "—"} />
          <Stat label="Scored · 24h" value={stats ? compact(stats.scored24h) : "—"} />
          <Stat label="Risky · 24h" value={stats ? String(stats.risky24h) : "—"} color="var(--rv-risk)" />
          <Stat
            label="Caution or better"
            value={stats ? String(stats.caution24h + stats.healthy24h) : "—"}
            color="var(--rv-caution)"
          />
        </dl>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/?view=caught" className="rv-body text-[13px] font-semibold text-[var(--rv-risk)] hover:underline">
            See every flagged token →
          </Link>
          <Link href="/methodology" className="rv-body text-[13px] font-semibold text-[var(--rv-ice)] hover:underline">
            How the 1–10 score works →
          </Link>
        </div>
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

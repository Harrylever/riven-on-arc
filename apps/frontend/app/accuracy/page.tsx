import Link from "next/link"
import { getAccuracy } from "@/lib/arc-data"
import { ArrowIcon } from "@/components/riven/arrow"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { buildPageMetadata } from "@/lib/site"

export const dynamic = "force-dynamic"
export const metadata = buildPageMetadata({
  title: "Does the score warn in time?",
  description:
    "Riven's own track record: how often tokens it rated Risk, Caution or Healthy later saw liquidity pulled or a creator sell out.",
  path: "/accuracy",
})

const BAND_LABEL = { risk: "Risk", caution: "Caution", healthy: "Healthy" } as const
const BAND_COLOR = { risk: "var(--rv-risk)", caution: "var(--rv-caution)", healthy: "var(--rv-healthy)" } as const
/** Below this many tokens in a band, a rate says almost nothing. */
const MIN_SAMPLE = 30

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—")

export default async function AccuracyPage() {
  const acc = await getAccuracy().catch(() => null)
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[28px] font-extrabold text-[var(--rv-ink)]">Does the score warn in time?</h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[var(--rv-ink-2)]">
          Riven publishes its own hit rate. For every token first scored under{" "}
          <code>{acc?.methodology ?? "the current methodology"}</code>, we check whether liquidity was pulled or the
          creator sold out <em>afterwards</em>. Nothing here is cherry-picked, and a weak result is shown as it is.
        </p>
      </header>

      {!acc ? (
        <div className="rv-card px-6 py-10 text-center text-[var(--rv-ink-2)]">
          The track record is unavailable right now. Try again in a minute.
        </div>
      ) : acc.scored === 0 ? (
        <div className="rv-card px-6 py-10 text-center text-[var(--rv-ink-2)]">
          No tokens have been scored under this methodology yet, so there is nothing to measure.
        </div>
      ) : (
        <>
          <section className="rv-card overflow-x-auto" aria-label="Outcome by first score">
            <Table className="min-w-[420px] text-left text-[13px]">
              <TableCaption className="sr-only">Share of tokens in each first-score band that later saw liquidity pulled or a creator sell out</TableCaption>
              <TableHeader className="text-[11px] tracking-wide text-[var(--rv-ink-3)] uppercase">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto px-4 py-3 text-[11px] font-medium text-[var(--rv-ink-3)]">First score</TableHead>
                  <TableHead className="h-auto px-4 py-3 text-[11px] font-medium text-[var(--rv-ink-3)]">Tokens</TableHead>
                  <TableHead className="h-auto px-4 py-3 text-[11px] font-medium text-[var(--rv-ink-3)]">Later pulled / dumped</TableHead>
                  <TableHead className="h-auto px-4 py-3 text-[11px] font-medium text-[var(--rv-ink-3)]">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acc.bands.map((r) => (
                  <TableRow key={r.band} className="border-0 border-t border-[var(--rv-stroke)]">
                    <TableCell className="px-4 py-3 font-semibold text-[13px]" style={{ color: BAND_COLOR[r.band] }}>
                      {BAND_LABEL[r.band]}
                    </TableCell>
                    <TableCell className="rv-num px-4 py-3 text-[13px]">{r.scored.toLocaleString()}</TableCell>
                    <TableCell className="rv-num px-4 py-3 text-[13px]">{r.badAfter.toLocaleString()}</TableCell>
                    <TableCell className="rv-num px-4 py-3 text-[13px]">
                      {pct(r.badAfter, r.scored)}
                      {r.scored < MIN_SAMPLE && (
                        <span className="ml-2 text-[11px] text-[var(--rv-ink-3)]">too few to conclude</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="rv-card p-4 text-[13.5px] leading-relaxed text-[var(--rv-ink-2)]">
            {acc.caughtShare === null ? (
              <p>No scored token has had liquidity pulled or a creator sell out yet, so catch rate can&apos;t be measured.</p>
            ) : (
              <p>
                Of the <b className="text-[var(--rv-ink)]">{acc.totalBad}</b> scored tokens that later had liquidity pulled or a
                creator sell out, <b className="text-[var(--rv-ink)]">{Math.round(acc.caughtShare * 100)}%</b> were already rated
                Caution or Risk when first scored.
              </p>
            )}
            {acc.alreadyHappened > 0 && (
              <p className="mt-2">
                {acc.alreadyHappened} more had already been pulled or dumped before Riven first scored them. They are left out,
                because nothing could have been warned in advance.
              </p>
            )}
          </section>

          <section className="rv-card p-4 text-[12.5px] leading-relaxed text-[var(--rv-ink-3)]">
            <h2 className="text-[13px] font-bold text-[var(--rv-ink-2)]">What this does and does not prove</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>An &ldquo;outcome&rdquo; is a liquidity pull or creator sell-out that Riven&apos;s own alerts detected. A rug Riven missed does not count, so rates may be flattering.</li>
              <li>Young tokens have had little time to go wrong. Rates rise as the sample ages.</li>
              <li>Bands with fewer than {MIN_SAMPLE} tokens are marked: read them as anecdotes.</li>
              <li>Scores are evidence about on-chain facts, not a prediction or financial advice.</li>
            </ul>
            {acc.since && <p className="mt-2">Counting from {new Date(acc.since).toISOString().slice(0, 10)}.</p>}
          </section>
        </>
      )}
      <Link
        href="/methodology"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--rv-ice)] hover:underline"
      >
        How the score works
        <ArrowIcon />
      </Link>
    </div>
  )
}

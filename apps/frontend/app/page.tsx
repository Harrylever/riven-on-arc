import type { Metadata } from "next"
import { getScreener, getStats } from "@/lib/arc-data"
import { parseFilters } from "@/lib/screener-params"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site"
import { Screener } from "@/components/riven/screener"
import { TerminalHeader } from "@/components/riven/terminal-header"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filters = parseFilters(await searchParams)
  let result: Awaited<ReturnType<typeof getScreener>> = { tokens: [], total: 0, page: 1, pages: 1 }
  let stats: Awaited<ReturnType<typeof getStats>> | null = null
  let failed = false
  try {
    ;[result, stats] = await Promise.all([getScreener(filters), getStats()])
  } catch (err) {
    console.error(`[home] ${(err as Error).message}`)
    failed = true
  }
  return (
    <div className="flex flex-col gap-4">
      <TerminalHeader stats={stats} />
      {failed ? (
        <div className="rv-card px-6 py-10 text-center">
          <p className="rv-display text-lg font-bold text-[var(--rv-ink)]">Can&apos;t reach the Riven database</p>
          <p className="rv-body mt-2 text-sm text-[var(--rv-ink-2)]">The page can&apos;t load tokens right now. Try again in a moment.</p>
        </div>
      ) : (
        <Screener
          filters={filters}
          tokens={result.tokens}
          total={result.total}
          page={result.page}
          pages={result.pages}
          serverNow={Date.now()}
        />
      )}
    </div>
  )
}

import type { Metadata } from "next"
import { getMarketTotals, getScreener } from "@/lib/arc-data"
import { parseFilters } from "@/lib/screener-params"
import { Screener } from "@/components/riven/screener"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Trending on Arc",
  description: "Every token on Arc, ranked live like DexScreener, each with a 1–10 Riven safety score.",
  alternates: { canonical: "/trending" },
}

export default async function TrendingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filters = parseFilters(await searchParams)
  let result: Awaited<ReturnType<typeof getScreener>> | null = null
  let totals: Awaited<ReturnType<typeof getMarketTotals>> | null = null
  try {
    ;[result, totals] = await Promise.all([getScreener(filters), getMarketTotals().catch(() => null)])
  } catch (err) {
    console.error(`[trending] ${(err as Error).message}`)
  }
  if (!result) {
    return (
      <div className="rv-card px-6 py-12 text-center" role="alert">
        <p className="text-[16px] font-semibold text-[var(--rv-ink)]">Can&apos;t reach the Riven database</p>
        <p className="mt-1 text-[13px] text-[var(--rv-ink-2)]">The token list can&apos;t load right now. Try again in a moment.</p>
      </div>
    )
  }
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  return (
    <Screener filters={filters} tokens={result.tokens} total={result.total} page={result.page} pages={result.pages} serverNow={now} totals={totals} />
  )
}

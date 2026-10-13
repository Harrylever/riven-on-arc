import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHero } from "@/components/riven/page-hero"
import {
  ListSkeleton,
  MarketsTabs,
  SummarySkeleton,
  SummaryStrip,
  TABS,
  TabContent,
  parseLimit,
  parseTab,
} from "@/components/riven/markets-sections"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Markets",
  description: "Arc at a glance: new pairs, top volume, safest tokens and everything Riven caught.",
}

/**
 * Arc at a glance. The page shell and every list load independently (Suspense), so one slow query can no
 * longer blank the page, and a list that fails says so instead of rendering an empty "all clear".
 * Tabs are URLs (?tab=flagged&n=50), so a list can be linked and only the open tab is queried.
 */
export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ tab?: string; n?: string }> }) {
  const sp = await searchParams
  const tab = parseTab(sp.tab)
  const limit = parseLimit(sp.n)
  const def = TABS.find((t) => t.id === tab)!
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  return (
    <div className="flex flex-col gap-4">
      <PageHero
        eyebrow="Arc at a glance"
        title="Markets"
        lines={[
          "“Safest” only shows tokens I've scored that aren't flagged.",
          "New pairs land first, and I score them as soon as I can.",
          "Tap any row for the full rug check.",
        ]}
      >
        What just launched, what is trading, what looks safest and what Riven has flagged. Unscored tokens are labelled, never guessed.
      </PageHero>
      <Suspense fallback={<SummarySkeleton />}>
        <SummaryStrip serverNow={now} />
      </Suspense>
      <section className="rv-card overflow-hidden" aria-label={def.label}>
        <div className="px-2 sm:px-3">
          <MarketsTabs active={tab} />
        </div>
        <p className="border-b border-[var(--rv-stroke)] px-4 py-2.5 text-[12px] leading-relaxed text-[var(--rv-ink-3)]">{def.hint}</p>
        <Suspense key={`${tab}-${limit}`} fallback={<ListSkeleton />}>
          <TabContent tab={tab} limit={limit} serverNow={now} />
        </Suspense>
      </section>
    </div>
  )
}

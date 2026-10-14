import { Suspense } from "react"
import { PageHero } from "@/components/riven/page-hero"
import {
  ListSkeleton,
  SummarySkeleton,
  SummaryStrip,
  TABS,
  TabContent,
  parsePage,
  parseTab,
  tabHref,
} from "@/components/riven/markets-sections"
import { MarketsTabs } from "@/components/riven/markets-tabs"
import { buildPageMetadata } from "@/lib/site"

export const dynamic = "force-dynamic"
export const metadata = buildPageMetadata({
  title: "Markets",
  description: "Arc at a glance: new pairs, top volume, safest tokens and everything Riven flagged.",
  path: "/markets",
})

/**
 * Arc at a glance. The page shell and every list load independently (Suspense), so one slow query can no
 * longer blank the page, and a list that fails says so instead of rendering an empty "all clear".
 * Tabs and pages are URLs (?tab=flagged&page=2), so a list can be linked and only the open tab is queried.
 */
export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams
  const tab = parseTab(sp.tab)
  const page = parsePage(sp.page)
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
      <MarketsTabs
        active={tab}
        label={def.label}
        hint={def.hint}
        tabs={TABS.map((x) => ({ id: x.id, label: x.label, href: tabHref(x.id) }))}
      >
        <Suspense key={`${tab}-${page}`} fallback={<ListSkeleton />}>
          <TabContent tab={tab} page={page} serverNow={now} />
        </Suspense>
      </MarketsTabs>
    </div>
  )
}

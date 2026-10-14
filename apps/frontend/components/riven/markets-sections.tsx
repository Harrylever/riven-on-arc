import Link from "next/link"
import { getMarketsSummary, getScreener } from "@/lib/arc-data"
import { DEFAULT_FILTERS, type ScreenerFilters } from "@/lib/screener-params"
import { compact, usd } from "@/lib/riven-format"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD } from "./card-style"
import { FreshnessChip, WatchlistList } from "./markets-live"
import { MarketsTable } from "./markets-table"
import { PageNav } from "./page-nav"

export type TabId = "new" | "volume" | "safest" | "flagged" | "watchlist"

interface TabDef {
  id: TabId
  label: string
  /** One honest line about what the list is, and its limits. */
  hint: string
  filters?: Partial<ScreenerFilters>
  showWhy?: boolean
  empty?: string
}

export const TABS: TabDef[] = [
  {
    id: "safest",
    label: "Safest",
    hint: "Highest Riven score among scored tokens that aren't flagged.",
    filters: { sort: "safest", view: "listed" },
    empty: "No scored token that isn't flagged yet. Riven never guesses a score.",
  },
  {
    id: "flagged",
    label: "Flagged",
    hint: "Tokens with on-chain evidence of fake volume, pulled liquidity, a creator dump, a serial launcher or impersonation. The evidence is shown under each.",
    filters: { sort: "new", view: "caught" },
    showWhy: true,
    empty: "Riven has flagged nothing among the tokens it has read. Tokens it hasn't read yet are unscored, so this is not a guarantee.",
  },
  {
    id: "volume",
    label: "Top volume",
    hint: "Most traded in the last 24 hours. Volume can be faked: flagged tokens are marked.",
    filters: { sort: "volume", view: "all" },
  },
  {
    id: "new",
    label: "New pairs",
    hint: "Newest first. A brand-new pair usually says “Open to score”: open it and Riven scores it right there.",
    filters: { sort: "new", view: "all" },
  },
  { id: "watchlist", label: "Watchlist", hint: "Tokens you starred on this device." },
]

/** The first tab is what /markets opens on. */
export const DEFAULT_TAB: TabId = "safest"
export const parseTab = (v: unknown): TabId => (TABS.some((t) => t.id === v) ? (v as TabId) : DEFAULT_TAB)

/** Rows per page. */
export const PAGE_SIZE = 25
/** A page number from the URL: a whole number from 1, anything else is page 1. */
export const parsePage = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 500) : 1
}

/** The address of a tab (and page): the first tab and the first page leave the URL clean. */
export const tabHref = (tab: TabId, page = 1) => {
  const q = new URLSearchParams()
  if (tab !== DEFAULT_TAB) q.set("tab", tab)
  if (page > 1) q.set("page", String(page))
  const s = q.toString()
  return s ? `/markets?${s}` : "/markets"
}

function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "risk" }) {
  return (
    <Card className={`${CARD} gap-0.5 px-3 py-2.5 sm:px-3.5 sm:py-3`}>
      <dt className="text-[11px] tracking-wide text-[var(--rv-ink-3)] uppercase">{label}</dt>
      <dd className={`rv-num text-[16px] font-bold sm:text-[18px] ${tone === "risk" ? "text-[var(--rv-risk)]" : "text-[var(--rv-ink)]"}`}>{children}</dd>
    </Card>
  )
}
const Sub = ({ children }: { children: React.ReactNode }) => <span className="ml-1 text-[11.5px] font-medium text-[var(--rv-ink-3)]">{children}</span>

export async function SummaryStrip({ serverNow }: { serverNow: number }) {
  let s
  try {
    s = await getMarketsSummary()
  } catch (err) {
    console.error(`[markets] summary: ${(err as Error).message}`)
    return (
      <Alert className="rounded-md border-[color:var(--rv-caution)]/30 bg-[var(--rv-caution)]/10 after:hidden">
        <AlertTitle>Market totals couldn&apos;t be loaded just now</AlertTitle>
        <AlertDescription>The lists below load separately.</AlertDescription>
      </Alert>
    )
  }
  return (
    <section aria-label="Arc market summary" className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Volume 24h">{usd(s.volume24h)}</Stat>
        <Stat label="Trading now">
          {compact(s.trading)}
          <Sub>of ~{compact(s.tokens)}</Sub>
        </Stat>
        <Stat label="New in 24h">{compact(s.launches24h)}</Stat>
        <Stat label="Flagged in 24h" tone="risk">
          {compact(s.flagged24h)}
          <Sub>{compact(s.flaggedTotal)} total</Sub>
        </Stat>
      </dl>
      <FreshnessChip syncedAt={s.syncedAt} serverNow={serverNow} />
    </section>
  )
}

/** A failed read says so: an empty "nothing here" would look like an all-clear. */
export function ListError({ tab }: { tab: TabId }) {
  const def = TABS.find((t) => t.id === tab)!
  return (
    <div className="p-4">
      <Alert variant="destructive" className="rounded-md border-[color:var(--rv-risk)]/30 bg-[var(--rv-risk)]/10 after:hidden">
        <AlertTitle>Couldn&apos;t load {def.label.toLowerCase()} just now.</AlertTitle>
        <AlertDescription>
          This is a loading problem, not an all-clear: nothing here means nothing was checked.
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={tabHref(tab)} />}
            className="mt-3 h-9 rounded-md border-[color:var(--rv-stroke-strong)] px-4 text-[13px] font-semibold tracking-normal normal-case text-[var(--rv-ink)]"
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

export async function TabContent({
  tab,
  page,
  serverNow,
  load = getScreener,
}: {
  tab: TabId
  page: number
  serverNow: number
  /** Injected by tests to simulate a slow or failing database. */
  load?: typeof getScreener
}) {
  const def = TABS.find((t) => t.id === tab)!
  if (tab === "watchlist") return <WatchlistList serverNow={serverNow} />
  let result
  try {
    result = await load({ ...DEFAULT_FILTERS, ...def.filters, page }, PAGE_SIZE, { total: false })
  } catch (err) {
    console.error(`[markets] ${tab}: ${(err as Error).message}`)
    return <ListError tab={tab} />
  }
  const { tokens } = result
  if (tokens.length === 0)
    return (
      <Empty className="border-0 p-8">
        <EmptyHeader>
          <EmptyTitle className="text-[14px] text-[var(--rv-ink)]">{page > 1 ? "No more results" : "Nothing here yet"}</EmptyTitle>
          <EmptyDescription className="text-[13px] leading-relaxed text-[var(--rv-ink-3)]">
            {page > 1 ? "That page is past the end of this list." : (def.empty ?? "Nothing here right now.")}
          </EmptyDescription>
        </EmptyHeader>
        {page > 1 && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={tabHref(tab)} />}
            className="h-9 rounded-md border-[color:var(--rv-stroke-strong)] px-4 text-[13px] font-semibold tracking-normal normal-case text-[var(--rv-ink)]"
          >
            Back to the first page
          </Button>
        )}
      </Empty>
    )
  return (
    <>
      <MarketsTable tokens={tokens} serverNow={serverNow} showWhy={def.showWhy} />
      <div className="border-t border-[var(--rv-stroke)] p-3">
        <PageNav page={page} hasNext={result.hasMore ?? page < result.pages} path="/markets" query={tab === DEFAULT_TAB ? {} : { tab }} />
      </div>
    </>
  )
}

export function ListSkeleton() {
  return (
    <div aria-hidden className="divide-y divide-[var(--rv-stroke)]">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-9 rounded-full bg-white/[0.06]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24 rounded bg-white/[0.06]" />
            <Skeleton className="h-2.5 w-36 rounded bg-white/[0.04]" />
          </div>
          <Skeleton className="h-3 w-14 rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  )
}

export function SummarySkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[66px] rounded-[var(--rv-radius)] bg-white/[0.04]" />
      ))}
    </div>
  )
}

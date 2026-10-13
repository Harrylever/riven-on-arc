import Link from "next/link"
import { getMarketsSummary, getScreener } from "@/lib/arc-data"
import { DEFAULT_FILTERS, type ScreenerFilters } from "@/lib/screener-params"
import { compact, usd } from "@/lib/riven-format"
import { FreshnessChip, WatchlistList } from "./markets-live"
import { MarketsTable } from "./markets-table"

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
    id: "new",
    label: "New pairs",
    hint: "Newest first. Riven scores a token once it has read its holders, so a brand-new pair usually shows Unscored.",
    filters: { sort: "new", view: "all" },
  },
  {
    id: "volume",
    label: "Top volume",
    hint: "Most traded in the last 24 hours. Volume can be faked: flagged tokens are marked.",
    filters: { sort: "volume", view: "all" },
  },
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
  { id: "watchlist", label: "Watchlist", hint: "Tokens you starred on this device." },
]

export const parseTab = (v: unknown): TabId => (TABS.some((t) => t.id === v) ? (v as TabId) : "new")
export const LIMITS = [25, 50, 100] as const
export const parseLimit = (v: unknown): number => {
  const n = Number(v)
  return (LIMITS as readonly number[]).includes(n) ? n : LIMITS[0]
}

export function MarketsTabs({ active }: { active: TabId }) {
  return (
    <nav aria-label="Markets lists" className="overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-[var(--rv-stroke)]">
        {TABS.map((t) => {
          const on = t.id === active
          return (
            <li key={t.id}>
              <Link
                href={t.id === "new" ? "/markets" : `/markets?tab=${t.id}`}
                aria-current={on ? "page" : undefined}
                scroll={false}
                className="relative flex min-h-11 items-center px-3.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors"
                style={{ color: on ? "var(--rv-ink)" : "var(--rv-ink-3)" }}
              >
                {t.label}
                {on && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--rv-blue)]" />}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const stat = "flex flex-col gap-0.5 rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-card)] px-3 py-2.5 sm:px-3.5 sm:py-3"

export async function SummaryStrip({ serverNow }: { serverNow: number }) {
  let s
  try {
    s = await getMarketsSummary()
  } catch (err) {
    console.error(`[markets] summary: ${(err as Error).message}`)
    return (
      <p className="rounded-md border border-[var(--rv-caution)]/30 bg-[var(--rv-caution)]/10 px-3 py-2 text-[12px] text-[var(--rv-ink-2)]">
        Market totals couldn&apos;t be loaded just now. The lists below load separately.
      </p>
    )
  }
  return (
    <section aria-label="Arc market summary" className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className={stat}>
          <dt className="text-[11px] tracking-wide text-[var(--rv-ink-3)] uppercase">Volume 24h</dt>
          <dd className="rv-num text-[16px] font-bold sm:text-[18px] text-[var(--rv-ink)]">{usd(s.volume24h)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-[11px] tracking-wide text-[var(--rv-ink-3)] uppercase">Trading now</dt>
          <dd className="rv-num text-[16px] font-bold sm:text-[18px] text-[var(--rv-ink)]">
            {compact(s.trading)}
            <span className="ml-1 text-[11.5px] font-medium text-[var(--rv-ink-3)]">of ~{compact(s.tokens)}</span>
          </dd>
        </div>
        <div className={stat}>
          <dt className="text-[11px] tracking-wide text-[var(--rv-ink-3)] uppercase">New in 24h</dt>
          <dd className="rv-num text-[16px] font-bold sm:text-[18px] text-[var(--rv-ink)]">{compact(s.launches24h)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-[11px] tracking-wide text-[var(--rv-ink-3)] uppercase">Flagged in 24h</dt>
          <dd className="rv-num text-[16px] font-bold sm:text-[18px] text-[var(--rv-risk)]">
            {compact(s.flagged24h)}
            <span className="ml-1 text-[11.5px] font-medium text-[var(--rv-ink-3)]">{compact(s.flaggedTotal)} total</span>
          </dd>
        </div>
      </dl>
      <FreshnessChip syncedAt={s.syncedAt} serverNow={serverNow} />
    </section>
  )
}

/** A failed read says so: an empty "nothing here" would look like an all-clear. */
export function ListError({ tab }: { tab: TabId }) {
  const def = TABS.find((t) => t.id === tab)!
  return (
    <div role="alert" className="px-4 py-10 text-center">
      <p className="text-[13.5px] font-semibold text-[var(--rv-ink)]">Couldn&apos;t load {def.label.toLowerCase()} just now.</p>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[var(--rv-ink-3)]">
        This is a loading problem, not an all-clear: nothing here means nothing was checked.
      </p>
      <Link href={tab === "new" ? "/markets" : `/markets?tab=${tab}`} className="rv-btn mt-4 inline-flex h-10 px-4 text-[13px]">
        Try again
      </Link>
    </div>
  )
}

export async function TabContent({
  tab,
  limit,
  serverNow,
  load = getScreener,
}: {
  tab: TabId
  limit: number
  serverNow: number
  /** Injected by tests to simulate a slow or failing database. */
  load?: typeof getScreener
}) {
  const def = TABS.find((t) => t.id === tab)!
  if (tab === "watchlist") return <WatchlistList serverNow={serverNow} />
  let tokens
  try {
    tokens = (await load({ ...DEFAULT_FILTERS, ...def.filters }, limit, { total: false })).tokens
  } catch (err) {
    console.error(`[markets] ${tab}: ${(err as Error).message}`)
    return <ListError tab={tab} />
  }
  if (tokens.length === 0)
    return <p className="px-4 py-10 text-center text-[13px] leading-relaxed text-[var(--rv-ink-3)]">{def.empty ?? "Nothing here right now."}</p>
  const next = LIMITS[LIMITS.indexOf(limit as (typeof LIMITS)[number]) + 1]
  return (
    <>
      <MarketsTable tokens={tokens} serverNow={serverNow} showWhy={def.showWhy} />
      {tokens.length >= limit && (
        <div className="border-t border-[var(--rv-stroke)] p-3 text-center">
          {next ? (
            <Link href={`/markets?tab=${tab}&n=${next}`} scroll={false} className="rv-btn-ghost inline-flex h-11 px-5 text-[13px]">
              Show {next - limit} more
            </Link>
          ) : (
            <Link href="/trending?view=all" className="rv-btn-ghost inline-flex h-11 px-5 text-[13px]">
              See every token in the screener
            </Link>
          )}
        </div>
      )}
    </>
  )
}

export function ListSkeleton() {
  return (
    <div aria-hidden className="divide-y divide-[var(--rv-stroke)]">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="size-9 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-2.5 w-36 animate-pulse rounded bg-white/[0.04]" />
          </div>
          <div className="h-3 w-14 animate-pulse rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  )
}

export function SummarySkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-[66px] animate-pulse rounded-[var(--rv-radius)] bg-white/[0.04]" />
      ))}
    </div>
  )
}

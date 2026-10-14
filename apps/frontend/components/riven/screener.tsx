"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  SORTS,
  TIMEFRAMES,
  filtersToQuery,
  type AgeFilter,
  type BandFilter,
  type HasFilter,
  type SortKey,
  type PadFilter,
  type ScreenerFilters,
  type Timeframe,
  type ViewFilter,
} from "@/lib/screener-params"
import { REASON_LABEL } from "@/lib/reasons"
import { age, change, changeColor, compact, usd } from "@/lib/riven-format"
import type { getMarketTotals } from "@/lib/arc-data"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { WatchButton } from "./watch-button"
import { visibleInterval } from "@/lib/visible-interval"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageNav } from "@/components/riven/page-nav"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { RvSelect } from "@/components/riven/rv-select"
import { Hint } from "@/components/riven/hint"

const REFRESH_MS = 60_000
/** Where "Dispute a score" goes: NEXT_PUBLIC_DISPUTE_URL, else the methodology page. */
const DISPUTE_URL =
  process.env.NEXT_PUBLIC_DISPUTE_URL || "/methodology#disputes"

type Totals = Awaited<ReturnType<typeof getMarketTotals>>

const VIEWS: Array<[ViewFilter, string]> = [
  ["all", "All tokens"],
  ["listed", "Hide flagged"],
  ["caught", "Only flagged"],
]
const PADS: Array<[PadFilter, string]> = [
  ["all", "Any source"],
  ["ARGUS", "Argus"],
  ["TOLLY", "Tolly"],
  ["OTHER", "DEX pools"],
]
const BANDS: Array<[BandFilter, string]> = [
  ["all", "Any score"],
  ["healthy", "Healthy 7+"],
  ["caution", "Caution"],
  ["risk", "Risky"],
  ["unscored", "Not scored"],
]
const AGES: Array<[AgeFilter, string]> = [
  ["all", "Any age"],
  ["1h", "< 1 hour"],
  ["6h", "< 6 hours"],
  ["24h", "< 24 hours"],
  ["7d", "< 7 days"],
]
/** Rank-by shortcuts next to Trending (DexScreener's top bar): the common ones as chips, the rest under "More". */
const PRIMARY_RANKS: SortKey[] = [
  "volume",
  "gainers",
  "losers",
  "new",
  "safest",
]
const RANKS = PRIMARY_RANKS.map((id) => SORTS.find((s) => s.id === id)!)
const MORE_RANKS = SORTS.filter(
  (s) => s.id !== "trending" && !PRIMARY_RANKS.includes(s.id),
)
const MORE_OPTIONS: Array<[string, string]> = [
  ["more", "More"],
  ...MORE_RANKS.map((s): [string, string] => [s.id, s.label]),
]
/** Only these rankings use the selected timeframe, so only then is a timeframe column highlighted. */
const TF_SORTS: SortKey[] = ["trending", "gainers", "losers"]

// The page's controls are shadcn components (Toggle, ToggleGroup, Button, Input, Pagination) restyled to Riven's look.
// Their base styles are large, squared and uppercase, so each override resets what it needs to.
/** The segmented pill around Trending and the timeframes. */
const SEG =
  "inline-flex w-fit shrink-0 items-center gap-0.5 rounded-lg border border-[color:var(--rv-stroke)] bg-[var(--rv-sunken)] p-0.5"
const SEG_ITEM =
  "h-auto min-w-0 gap-1 rounded-md px-2.5 py-[5px] text-[12px] font-semibold tracking-normal normal-case text-[var(--rv-ink-2)] hover:bg-transparent hover:text-[var(--rv-ink)] data-[pressed]:bg-[var(--rv-blue)] data-[pressed]:text-[var(--rv-on-blue)] data-[pressed]:hover:bg-[var(--rv-blue)] data-[pressed]:hover:text-[var(--rv-on-blue)]"
/** A quiet chip that is "pressed" when it is the active choice. */
const CHIP_ITEM =
  "h-[30px] min-w-0 shrink-0 rounded-md border border-[color:var(--rv-stroke)] bg-[var(--rv-card)] px-2.5 text-[12px] font-semibold tracking-normal normal-case text-[var(--rv-ink-2)] hover:bg-[var(--rv-card)] hover:text-[var(--rv-ink)] data-[pressed]:border-[color:var(--rv-stroke-strong)] data-[pressed]:bg-[var(--rv-card-hover)] data-[pressed]:text-[var(--rv-ink)]"
const CHIP_BTN =
  "h-[30px] shrink-0 gap-1.5 rounded-md border border-[color:var(--rv-stroke)] bg-[var(--rv-card)] px-2.5 text-[12px] font-semibold tracking-normal normal-case text-[var(--rv-ink-2)] hover:bg-[var(--rv-card)] hover:text-[var(--rv-ink)] aria-pressed:border-[color:var(--rv-stroke-strong)] aria-pressed:bg-[var(--rv-card-hover)] aria-pressed:text-[var(--rv-ink)] aria-expanded:bg-[var(--rv-card-hover)]"
const PRIMARY_BTN =
  "h-9 rounded-md bg-[var(--rv-blue)] px-3.5 text-[13px] font-bold tracking-normal normal-case text-[var(--rv-on-blue)] hover:bg-[var(--rv-blue)] hover:brightness-110"
const GHOST_BTN =
  "h-9 rounded-md border border-[color:var(--rv-stroke-strong)] bg-transparent px-3.5 text-[13px] font-semibold tracking-normal normal-case text-[var(--rv-ink)] hover:bg-white/[0.04] hover:text-[var(--rv-ink)]"
const FIELD =
  "h-9 rounded-[10px] border border-[color:var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 font-mono text-[13px] text-[var(--rv-ink)] focus-visible:border-[color:var(--rv-blue)] focus-visible:ring-0"

const TF_KEY = { "5m": "m5", "1h": "h1", "6h": "h6", "24h": "h24" } as const
const pick = (t: TokenSummary, tf: Timeframe) => ({
  vol: t.volume[TF_KEY[tf]],
  chg: t.change[TF_KEY[tf]],
})

/** Flip once the market sync populates DexScreener profile / social fields. */
const DEX_FILTERS_READY = false

export function Screener({
  title = "Trending on Arc",
  subtitle = "Every Arc token, ranked live, with a 1–10 safety score.",
  filters,
  tokens,
  total,
  page,
  pages,
  serverNow,
  totals,
}: {
  title?: string
  subtitle?: string
  filters: ScreenerFilters
  tokens: TokenSummary[]
  total: number
  page: number
  pages: number
  serverNow: number
  totals?: Totals | null
}) {
  const router = useRouter()
  const path = usePathname()
  const [pending, startTransition] = useTransition()
  const [now, setNow] = useState(serverNow)
  const [panel, setPanel] = useState(false)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const stopRefresh = visibleInterval(
      () => startTransition(() => router.refresh()),
      REFRESH_MS,
    )
    return () => {
      clearInterval(tick)
      stopRefresh()
    }
  }, [router])

  // Any filter change starts again from page 1; paging keeps everything else.
  const go = (patch: Partial<ScreenerFilters>) =>
    startTransition(() =>
      router.push(
        `${path}${filtersToQuery({ ...filters, page: 1, ...patch })}`,
        { scroll: false },
      ),
    )
  const goPage = (p: number) =>
    startTransition(() => {
      router.push(`${path}${filtersToQuery({ ...filters, page: p })}`, {
        scroll: false,
      })
      document
        .getElementById("screener-top")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    })

  const activeCount = (
    ["minLiq", "minMcap", "maxMcap", "minVol", "minScore"] as const
  ).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length
  // The dropdown filters sit inline on desktop; on a phone they live in the Filters panel, so count them there.
  const dropdownActive = (["view", "band", "pad", "age"] as const).filter(
    (k) => filters[k] !== DEFAULT_FILTERS[k],
  ).length
  const showWhy = filters.view === "caught"

  return (
    <section
      id="screener-top"
      aria-label="Arc token screener"
      className="flex scroll-mt-28 flex-col gap-3"
    >
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[var(--rv-ink)]">
            {title}
          </h1>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--rv-ink-2)]">
            {subtitle}
          </p>
        </div>
        {totals && (
          <dl className="grid grid-cols-4 gap-1.5 sm:gap-2">
            <Stat
              label="24h vol"
              long="24h volume"
              value={usd(totals.volume24h)}
            />
            <Stat label="24h txns" value={compact(totals.txns24h)} />
            <Stat label="Tokens" value={compact(totals.tokens)} />
            <Stat
              label="Trading"
              long="Trading now"
              value={compact(totals.trading)}
            />
          </dl>
        )}
      </header>

      {/* Rank by: Trending with its timeframe, then the common rankings; the rest are under More */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className={SEG} role="group" aria-label="Trending timeframe">
          <Toggle
            pressed={filters.sort === "trending"}
            onClick={() => go({ sort: "trending" })}
            className={SEG_ITEM}
          >
            <svg
              viewBox="0 0 24 24"
              width={13}
              height={13}
              fill="currentColor"
              aria-hidden
            >
              <path d="M13.5 2s.9 3.2-1.6 6.1C9.6 10.8 8 12.4 8 15a4 4 0 0 0 8 0c0-1.3-.5-2.4-1.2-3.4 2.8 1 4.2 3.6 4.2 6.1A7 7 0 0 1 5 17.6c0-4.8 3.4-7.4 5.4-9.6C12.6 5.6 13.5 2 13.5 2z" />
            </svg>
            Trending
          </Toggle>
          <ToggleGroup
            value={[filters.tf]}
            spacing={1}
            className="gap-0.5"
            aria-label="Timeframe"
          >
            {TIMEFRAMES.map((tf) => (
              <ToggleGroupItem
                key={tf}
                value={tf}
                onClick={() =>
                  go({
                    tf,
                    ...(filters.sort === "gainers" || filters.sort === "losers"
                      ? {}
                      : { sort: "trending" as const }),
                  })
                }
                className={cn(SEG_ITEM, "uppercase")}
              >
                {tf}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <span
          className="hidden h-5 w-px shrink-0 bg-[var(--rv-stroke)] md:block"
          aria-hidden
        />
        {/* the right edge fades on a phone: this row scrolls sideways */}
        <div className="scrollbar-hidden -mx-4 flex min-w-0 items-center gap-1.5 overflow-x-auto px-4 max-md:[mask-image:linear-gradient(to_right,#000_90%,transparent)] md:mx-0 md:px-0">
          <ToggleGroup
            value={PRIMARY_RANKS.includes(filters.sort) ? [filters.sort] : []}
            spacing={1}
            className="shrink-0 gap-1.5"
            aria-label="Rank by"
          >
            {RANKS.map((s) => (
              <ToggleGroupItem
                key={s.id}
                value={s.id}
                onClick={() => go({ sort: s.id })}
                className={CHIP_ITEM}
              >
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <RvSelect
            label="More rankings"
            hideFirst
            value={
              MORE_RANKS.some((s) => s.id === filters.sort)
                ? filters.sort
                : "more"
            }
            onChange={(v) => v !== "more" && go({ sort: v as SortKey })}
            options={MORE_OPTIONS}
          />
        </div>
      </div>

      {/* Filters: narrow the full list. Inline on desktop; one button (with a count) on a phone. */}
      <div className="flex items-center gap-1.5">
        {/* Profile / Community / Boosted need DexScreener fields the market sync has not
            populated yet, and "Boosted" surfaces paid placement. Re-enable when the data exists. */}
        {DEX_FILTERS_READY &&
          (
            [
              [
                "profile",
                "Profile",
                "Tokens with an enhanced DexScreener profile",
              ],
              [
                "community",
                "Community",
                "Tokens with Telegram / X / socials listed",
              ],
              [
                "boosted",
                "⚡ Boosted",
                "Tokens with paid DexScreener boosts running",
              ],
            ] as Array<[HasFilter, string, string]>
          ).map(([id, label, hint]) => (
            <Hint text={hint}>
              <Button
                variant="plain"
                size="bare"
                key={id}
                type="button"
                aria-pressed={filters.has === id}
                onClick={() => go({ has: filters.has === id ? "all" : id })}
                className="rv-chip shrink-0"
              >
                {label}
              </Button>
            </Hint>
          ))}
        <div className="hidden items-center gap-1.5 md:flex">
          <RvSelect
            label="Which tokens"
            value={filters.view}
            onChange={(v) => go({ view: v as ViewFilter })}
            options={VIEWS}
          />
          <RvSelect
            label="Riven score"
            value={filters.band}
            onChange={(v) => go({ band: v as BandFilter })}
            options={BANDS}
          />
          <RvSelect
            label="Source"
            value={filters.pad}
            onChange={(v) => go({ pad: v as PadFilter })}
            options={PADS}
          />
          <RvSelect
            label="Age"
            value={filters.age}
            onChange={(v) => go({ age: v as AgeFilter })}
            options={AGES}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPanel((p) => !p)}
          aria-expanded={panel}
          aria-pressed={activeCount + dropdownActive > 0}
          className={CHIP_BTN}
        >
          <svg
            viewBox="0 0 24 24"
            width={13}
            height={13}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            aria-hidden
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="hidden md:inline"> · {activeCount}</span>
          )}
          {activeCount + dropdownActive > 0 && (
            <span className="md:hidden"> · {activeCount + dropdownActive}</span>
          )}
        </Button>
        <span
          className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-[12px] text-[var(--rv-ink-2)]"
          aria-live="polite"
        >
          {pending && (
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--rv-caution)]" />
          )}
          {pending ? "Updating" : `${compact(total)} tokens`}
          {!pending && <span className="text-[var(--rv-ink-3)]">· live</span>}
        </span>
      </div>

      {panel && (
        <FilterPanel
          filters={filters}
          onSelect={(f) => go(f)}
          onApply={(f) => {
            setPanel(false)
            go(f)
          }}
        />
      )}

      {tokens.length === 0 ? (
        <div className="rv-card px-6 py-14 text-center">
          <p className="text-[16px] font-semibold text-[var(--rv-ink)]">
            No tokens match
          </p>
          <p className="mt-1 text-[13px] text-[var(--rv-ink-2)]">
            Loosen a filter to see more.
          </p>
          <Button
            type="button"
            onClick={() => go({ ...DEFAULT_FILTERS })}
            className={cn(PRIMARY_BTN, "mt-4")}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <>
          <DesktopTable
            tokens={tokens}
            now={now}
            offset={(page - 1) * PAGE_SIZE}
            filters={filters}
            onSort={(sort, tf) => go({ sort, ...(tf ? { tf } : {}) })}
            showWhy={showWhy}
          />
          <MobileList
            tokens={tokens}
            now={now}
            tf={filters.tf}
            showWhy={showWhy}
          />
          <PageNav
            page={page}
            pages={pages}
            hrefFor={(p) => `${path}${filtersToQuery({ ...filters, page: p })}`}
            onPage={goPage}
          />
        </>
      )}

      <p className="text-[12px] leading-relaxed text-[var(--rv-ink-3)]">
        Every Arc token with a pool is listed. A red edge means Riven flagged it
        from on-chain evidence — fake volume, serial launchers, creators who
        sold out, pulled liquidity, impersonation.{" "}
        <Button
          type="button"
          variant="link"
          onClick={() => go({ view: "caught" })}
          className="inline h-auto p-0 text-left text-[12px] font-semibold tracking-normal whitespace-normal text-[var(--rv-risk)] normal-case hover:underline"
        >
          See only flagged, with the evidence
        </Button>
        {" · "}
        <a
          href={DISPUTE_URL}
          className="font-semibold text-[var(--rv-ice)] hover:underline"
        >
          Dispute a score
        </a>
        {" · "}Market data: DexScreener. Not financial advice.
      </p>
    </section>
  )
}

function Stat({
  label,
  long,
  value,
}: {
  label: string
  long?: string
  value: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-card)] px-2 py-2 sm:px-3.5 sm:py-3">
      <dt className="truncate text-[9.5px] tracking-wide text-[var(--rv-ink-3)] uppercase sm:text-[11px]">
        <span className="sm:hidden">{label}</span>
        <span className="hidden sm:inline">{long ?? label}</span>
      </dt>
      <dd className="rv-num truncate text-[14px] font-bold text-[var(--rv-ink)] sm:text-[18px]">
        {value}
      </dd>
    </div>
  )
}

function FilterPanel({
  filters,
  onApply,
  onSelect,
}: {
  filters: ScreenerFilters
  onApply: (f: Partial<ScreenerFilters>) => void
  onSelect: (f: Partial<ScreenerFilters>) => void
}) {
  const [draft, setDraft] = useState(filters)
  const field = (
    key: "minLiq" | "minMcap" | "maxMcap" | "minVol" | "minScore",
    label: string,
    hint: string,
  ) => (
    <Label className="flex-col items-stretch gap-1 text-[10.5px] tracking-wide text-[var(--rv-ink-3)]">
      {label}
      <Input
        inputMode="decimal"
        value={draft[key] || ""}
        placeholder={hint}
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]: Math.max(0, Number(e.target.value) || 0),
          })
        }
        className={FIELD}
      />
    </Label>
  )
  return (
    <form
      className="rv-card grid grid-cols-2 gap-3 p-4 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault()
        onApply(draft)
      }}
    >
      {/* On desktop these four sit in the bar above; on a phone they are here. They apply as soon as they change. */}
      <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:hidden">
        <RvSelect
          label="Which tokens"
          value={filters.view}
          onChange={(v) => onSelect({ view: v as ViewFilter })}
          options={VIEWS}
        />
        <RvSelect
          label="Riven score"
          value={filters.band}
          onChange={(v) => onSelect({ band: v as BandFilter })}
          options={BANDS}
        />
        <RvSelect
          label="Source"
          value={filters.pad}
          onChange={(v) => onSelect({ pad: v as PadFilter })}
          options={PADS}
        />
        <RvSelect
          label="Age"
          value={filters.age}
          onChange={(v) => onSelect({ age: v as AgeFilter })}
          options={AGES}
        />
      </div>
      {field("minLiq", "Min liquidity $", "0")}
      {field("minMcap", "Min market cap $", "0")}
      {field("maxMcap", "Max market cap $", "any")}
      {field("minVol", "Min 24h volume $", "0")}
      {field("minScore", "Min score /10", "0")}
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-5">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onApply({
              minLiq: 0,
              minMcap: 0,
              maxMcap: 0,
              minVol: 0,
              minScore: 0,
            })
          }
          className={GHOST_BTN}
        >
          Clear
        </Button>
        <Button type="submit" className={PRIMARY_BTN}>
          Apply
        </Button>
      </div>
    </form>
  )
}

/** Paid DexScreener boosts running on this token. */
function Boosts({ n }: { n: number }) {
  return (
    <Hint text={`${n} active DexScreener boost${n === 1 ? "" : "s"}`}>
      <span className="rv-num shrink-0 text-[11px] font-bold text-[#fbbf24]">
        ⚡{n}
      </span>
    </Hint>
  )
}

/** The score chip, or plain "Unscored": a token Riven hasn't read yet gets scored when someone opens it. */
function Score({ t }: { t: TokenSummary }) {
  if (t.score === null)
    return (
      <Hint text="Not scored yet. Open the token and Riven scores it right there.">
        <span className="max-w-[58px] text-right text-[11px] leading-tight text-[var(--rv-ink-3)]">
          Open to score
        </span>
      </Hint>
    )
  return <ScoreBadge score={t.score} band={t.band} size="sm" />
}

/** Flagged rows get a red edge, like a warning stripe. */
function rowStyle(t: TokenSummary) {
  return t.fake ? { boxShadow: "inset 2px 0 0 var(--rv-risk)" } : undefined
}

function Pct({ v }: { v: number | null }) {
  return (
    <span
      className="rv-num"
      style={{ color: v === null ? "var(--rv-ink-3)" : changeColor(v) }}
    >
      {v === null ? "—" : change(v)}
    </span>
  )
}

/** The change column for the timeframe the current ranking uses: highlighted so the eye knows what the list is sorted on. */
const tfColumn = (filters: ScreenerFilters, t?: Timeframe) =>
  t !== undefined && filters.tf === t && TF_SORTS.includes(filters.sort)
const tfCell = (filters: ScreenerFilters, t: Timeframe) =>
  tfColumn(filters, t) ? "bg-white/[0.03]" : ""

function SortHead({
  children,
  s,
  t,
  left,
  title,
  className = "",
  filters,
  onSort,
}: {
  children: React.ReactNode
  s?: SortKey
  t?: Timeframe
  left?: boolean
  title?: string
  className?: string
  filters: ScreenerFilters
  onSort: (s: SortKey, tf?: Timeframe) => void
}) {
  const active =
    s !== undefined &&
    filters.sort === s &&
    (t === undefined || filters.tf === t)
  return (
    <TableHead
      className={`rv-label h-auto px-2 py-2.5 text-[11px] tracking-normal whitespace-nowrap ${left ? "text-left" : "text-right"} ${
        tfColumn(filters, t) ? "bg-white/[0.03] text-[var(--rv-ink)]" : ""
      } ${className}`}
      title={title}
    >
      {s ? (
        <Button
          variant="plain"
          size="bare"
          type="button"
          onClick={() => onSort(s, t)}
          className={`uppercase hover:text-[var(--rv-ink)] ${active ? "text-[var(--rv-blue)]" : ""}`}
        >
          {children}
          {active ? " ▾" : ""}
        </Button>
      ) : (
        children
      )}
    </TableHead>
  )
}

function DesktopTable({
  tokens,
  now,
  offset,
  filters,
  onSort,
  showWhy,
}: {
  tokens: TokenSummary[]
  now: number
  offset: number
  filters: ScreenerFilters
  onSort: (s: SortKey, tf?: Timeframe) => void
  showWhy: boolean
}) {
  const router = useRouter()
  const h = { filters, onSort }
  return (
    <div className="rv-card hidden overflow-x-auto lg:block">
      <Table className="min-w-[900px] text-[13px] xl:min-w-[1060px] 2xl:min-w-[1180px]">
        <TableHeader>
          <TableRow className="border-b border-[var(--rv-stroke)]">
            <TableHead className="rv-label h-auto w-12 py-2.5 pr-0 pl-4 text-left text-[11px] tracking-normal">
              #
            </TableHead>
            <SortHead left {...h}>
              Token
            </SortHead>
            <SortHead {...h}>Price</SortHead>
            <SortHead s="new" {...h}>
              Age
            </SortHead>
            <SortHead
              s="txns"
              title="Buys + sells, 24h"
              className="hidden xl:table-cell"
              {...h}
            >
              Txns
            </SortHead>
            <SortHead s="volume" title="24h volume" {...h}>
              Volume
            </SortHead>
            <SortHead
              s="gainers"
              t="5m"
              className="hidden 2xl:table-cell"
              {...h}
            >
              5m
            </SortHead>
            <SortHead
              s="gainers"
              t="1h"
              className="hidden xl:table-cell"
              {...h}
            >
              1h
            </SortHead>
            <SortHead s="gainers" t="6h" {...h}>
              6h
            </SortHead>
            <SortHead s="gainers" t="24h" {...h}>
              24h
            </SortHead>
            <SortHead s="liquidity" {...h}>
              Liquidity
            </SortHead>
            <SortHead s="mcap" {...h}>
              Mcap
            </SortHead>
            <SortHead s="safest" title="Riven safety score, 1–10" {...h}>
              Riven
            </SortHead>
            <TableHead className="h-auto w-9 p-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokens.map((t, i) => {
            const txns =
              t.buys24h === null ? null : (t.buys24h ?? 0) + (t.sells24h ?? 0)
            return (
              <TableRow
                key={t.address}
                onClick={() => router.push(`/token/${t.address}`)}
                className="h-[54px] cursor-pointer border-b border-[var(--rv-stroke)] transition-colors last:border-0 hover:bg-[var(--rv-row-hover)]"
                style={rowStyle(t)}
                title={t.fake ? t.fakeReasons[0] : undefined}
              >
                <TableCell className="rv-num py-2 pr-0 pl-4 text-[12px] text-[var(--rv-ink-3)]">
                  #{offset + i + 1}
                </TableCell>
                <TableCell className="px-2 py-2 whitespace-normal">
                  <Link
                    href={`/token/${t.address}`}
                    className="flex items-center gap-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TokenAvatar
                      image={t.image}
                      symbol={t.symbol}
                      address={t.address}
                      size={28}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="max-w-[130px] truncate text-[13.5px] font-bold text-[var(--rv-ink)]">
                          {t.symbol}
                        </span>
                        {t.boosts > 0 && <Boosts n={t.boosts} />}
                        <span className="text-[12px] text-[var(--rv-ink-3)]">
                          /USDC
                        </span>
                        <span className="max-w-[150px] truncate text-[12px] text-[var(--rv-ink-3)]">
                          {t.name}
                        </span>
                      </span>
                      {showWhy && (
                        <span className="block max-w-[520px]">
                          <Why t={t} />
                        </span>
                      )}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="rv-num px-2 py-2 text-right font-semibold text-[var(--rv-ink)]">
                  {t.priceUsd === null
                    ? "—"
                    : usd(t.priceUsd, { precise: true })}
                </TableCell>
                <TableCell className="rv-num px-2 py-2 text-right text-[var(--rv-ink-2)]">
                  {age(t.launchedAt, now)}
                </TableCell>
                <Hint
                  text={
                    t.buys24h === null
                      ? undefined
                      : `${t.buys24h} buys / ${t.sells24h} sells`
                  }
                >
                  <TableCell className="rv-num hidden px-2 py-2 text-right text-[var(--rv-ink-2)] xl:table-cell">
                    {txns === null ? (
                      <span className="text-[var(--rv-ink-3)]">—</span>
                    ) : (
                      compact(txns)
                    )}
                  </TableCell>
                </Hint>
                <TableCell className="rv-num px-2 py-2 text-right text-[var(--rv-ink)]">
                  {t.volume.h24 === null ? "—" : usd(t.volume.h24)}
                </TableCell>
                <TableCell
                  className={`hidden px-2 py-2 text-right 2xl:table-cell ${tfCell(filters, "5m")}`}
                >
                  <Pct v={t.change.m5} />
                </TableCell>
                <TableCell
                  className={`hidden px-2 py-2 text-right xl:table-cell ${tfCell(filters, "1h")}`}
                >
                  <Pct v={t.change.h1} />
                </TableCell>
                <TableCell
                  className={`px-2 py-2 text-right ${tfCell(filters, "6h")}`}
                >
                  <Pct v={t.change.h6} />
                </TableCell>
                <TableCell
                  className={`px-2 py-2 text-right ${tfCell(filters, "24h")}`}
                >
                  <Pct v={t.change.h24} />
                </TableCell>
                <TableCell className="px-2 py-2 text-right">
                  <div className="rv-num text-[var(--rv-ink-2)]">
                    {t.liquidityUsd === null ? "—" : usd(t.liquidityUsd)}
                  </div>
                  {t.usdcInPool !== null && t.usdcInPool < 1000 && (
                    <Hint text="Real USDC in the pool — what sellers can exit into">
                      <div className="rv-num text-[10.5px] text-[var(--rv-caution)]">
                        {usd(t.usdcInPool)} real
                      </div>
                    </Hint>
                  )}
                </TableCell>
                <TableCell className="rv-num px-2 py-2 text-right text-[var(--rv-ink)]">
                  {t.marketCap === null ? "—" : usd(t.marketCap)}
                </TableCell>
                <TableCell className="px-2 py-2 text-right">
                  <Score t={t} />
                </TableCell>
                <TableCell
                  className="p-0 pr-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <WatchButton address={t.address} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function MobileList({
  tokens,
  now,
  tf,
  showWhy,
}: {
  tokens: TokenSummary[]
  now: number
  tf: Timeframe
  showWhy: boolean
}) {
  return (
    <ol className="rv-card divide-y divide-[var(--rv-stroke)] overflow-hidden lg:hidden">
      {tokens.map((t) => {
        const { chg } = pick(t, tf)
        return (
          <li key={t.address} style={rowStyle(t)}>
            <Link
              href={`/token/${t.address}`}
              className="flex items-center gap-2.5 px-3 py-2.5 active:bg-[var(--rv-row-hover)]"
            >
              <TokenAvatar
                image={t.image}
                symbol={t.symbol}
                address={t.address}
                size={38}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-bold text-[var(--rv-ink)]">
                    {t.symbol}
                  </span>
                  {t.boosts > 0 && <Boosts n={t.boosts} />}
                  <span className="rv-num shrink-0 text-[11px] text-[var(--rv-ink-3)]">
                    {age(t.launchedAt, now)}
                  </span>
                </div>
                {/* how much trades and how deep the pool is; market cap is on the token page */}
                <div className="rv-num mt-0.5 flex items-center gap-x-2 overflow-hidden text-[10.5px] whitespace-nowrap text-[var(--rv-ink-3)]">
                  <span>
                    Vol {t.volume.h24 === null ? "—" : usd(t.volume.h24)}
                  </span>
                  <span aria-hidden className="max-[374px]:hidden">
                    ·
                  </span>
                  <span className="max-[374px]:hidden">
                    Liq {t.liquidityUsd === null ? "—" : usd(t.liquidityUsd)}
                  </span>
                </div>
                {showWhy && <Why t={t} />}
              </div>
              <div className="shrink-0 text-right">
                <div className="rv-num text-[13px] font-bold text-[var(--rv-ink)]">
                  {t.priceUsd === null
                    ? "—"
                    : usd(t.priceUsd, { precise: true })}
                </div>
                <div
                  className="rv-num text-[11.5px] font-semibold"
                  style={{ color: changeColor(chg) }}
                >
                  {change(chg)}
                </div>
              </div>
              <div className="flex w-[50px] shrink-0 justify-end">
                <Score t={t} />
              </div>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

/** The first flag reason, as evidence the user can check. */
export function Why({ t }: { t: TokenSummary }) {
  if (!t.fake) return null
  const code = t.fakeCodes[0]
  const label = (code && REASON_LABEL[code]?.label) ?? "Flagged"
  const raw = t.fakeReasons[0] ?? ""
  const text = raw.toLowerCase().startsWith(label.toLowerCase())
    ? raw.slice(label.length).replace(/^:?\s*/, "")
    : raw
  return (
    <span className="mt-1 block text-[11.5px] leading-snug text-[var(--rv-risk)]">
      <b>{label}:</b> {text}
      {t.fakeReasons.length > 1 && (
        <span className="text-[var(--rv-ink-3)]">
          {" "}
          · +{t.fakeReasons.length - 1} more
        </span>
      )}
    </span>
  )
}

export function FlagChip() {
  return (
    <Hint text="Flagged by on-chain evidence — open the token to see why">
      <Badge
        variant="neutral"
        className="rounded border-transparent bg-[rgba(248,113,113,0.12)] px-1.5 py-px text-[10px] font-bold tracking-wide text-[var(--rv-risk)] uppercase"
      >
        Flagged
      </Badge>
    </Hint>
  )
}

export function Meta({ t, now }: { t: TokenSummary; now: number }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--rv-ink-3)]">
      <span className="rv-num">{age(t.launchedAt, now)}</span>
      <span className="rounded bg-white/[0.05] px-1.5 py-px text-[10.5px] font-semibold text-[var(--rv-ink-2)]">
        {t.launchpad}
      </span>
      {t.holders !== null && (
        <Hint text="Holders">
          <span className="rv-num flex items-center gap-1">
            <svg
              viewBox="0 0 24 24"
              width={11}
              height={11}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              aria-hidden
            >
              <path d="M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            </svg>
            {compact(t.holders)}
          </span>
        </Hint>
      )}
    </span>
  )
}

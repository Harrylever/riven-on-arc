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

const REFRESH_MS = 20_000
/** Where "Dispute a score" goes: NEXT_PUBLIC_DISPUTE_URL, else the methodology page. */
const DISPUTE_URL = process.env.NEXT_PUBLIC_DISPUTE_URL || "/methodology#disputes"

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
/** Rank-by shortcuts next to Trending — DexScreener's top bar. */
const RANKS = SORTS.filter((s) => s.id !== "trending")

const TF_KEY = { "5m": "m5", "1h": "h1", "6h": "h6", "24h": "h24" } as const
const pick = (t: TokenSummary, tf: Timeframe) => ({ vol: t.volume[TF_KEY[tf]], chg: t.change[TF_KEY[tf]] })

export function Screener({
  title = "Every token on Arc",
  filters,
  tokens,
  total,
  page,
  pages,
  serverNow,
  totals,
}: {
  title?: string
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
    const refresh = setInterval(() => startTransition(() => router.refresh()), REFRESH_MS)
    return () => {
      clearInterval(tick)
      clearInterval(refresh)
    }
  }, [router])

  // Any filter change starts again from page 1; paging keeps everything else.
  const go = (patch: Partial<ScreenerFilters>) =>
    startTransition(() => router.push(`${path}${filtersToQuery({ ...filters, page: 1, ...patch })}`, { scroll: false }))
  const goPage = (p: number) =>
    startTransition(() => {
      router.push(`${path}${filtersToQuery({ ...filters, page: p })}`, { scroll: false })
      document.getElementById("screener-top")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })

  const activeCount = (["minLiq", "minMcap", "maxMcap", "minVol", "minScore"] as const).filter(
    (k) => filters[k] !== DEFAULT_FILTERS[k],
  ).length
  const showWhy = filters.view === "caught"

  return (
    <section id="screener-top" aria-label="Arc token screener" className="flex scroll-mt-28 flex-col gap-3">
      {/* Chain totals, like DexScreener's header strip */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="mr-auto text-[22px] font-bold tracking-tight text-[var(--rv-ink)]">{title}</h1>
        {totals && (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            <Total label="24h volume" value={usd(totals.volume24h)} />
            <Total label="24h txns" value={compact(totals.txns24h)} />
            <Total label="Tokens" value={compact(totals.tokens)} />
            <Total label="Trading now" value={compact(totals.trading)} />
          </dl>
        )}
      </div>

      {/* Trending + timeframe, then rank-by shortcuts */}
      <div className="scrollbar-hidden -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
        <div className="rv-seg shrink-0" role="group" aria-label="Trending timeframe">
          <button
            type="button"
            aria-pressed={filters.sort === "trending"}
            onClick={() => go({ sort: "trending" })}
            className="flex items-center gap-1"
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="currentColor" aria-hidden>
              <path d="M13.5 2s.9 3.2-1.6 6.1C9.6 10.8 8 12.4 8 15a4 4 0 0 0 8 0c0-1.3-.5-2.4-1.2-3.4 2.8 1 4.2 3.6 4.2 6.1A7 7 0 0 1 5 17.6c0-4.8 3.4-7.4 5.4-9.6C12.6 5.6 13.5 2 13.5 2z" />
            </svg>
            Trending
          </button>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              aria-pressed={filters.tf === tf}
              onClick={() =>
                go({ tf, ...(filters.sort === "gainers" || filters.sort === "losers" ? {} : { sort: "trending" as const }) })
              }
              className="uppercase"
            >
              {tf}
            </button>
          ))}
        </div>
        {RANKS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === filters.sort}
            onClick={() => go({ sort: s.id })}
            className="rv-chip shrink-0"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters: users narrow the full list down to what they want */}
      <div className="scrollbar-hidden -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
        <Select label="Which tokens" value={filters.view} onChange={(v) => go({ view: v as ViewFilter })} options={VIEWS} />
        <Select label="Riven score" value={filters.band} onChange={(v) => go({ band: v as BandFilter })} options={BANDS} />
        <Select label="Source" value={filters.pad} onChange={(v) => go({ pad: v as PadFilter })} options={PADS} />
        <Select label="Age" value={filters.age} onChange={(v) => go({ age: v as AgeFilter })} options={AGES} />
        <button
          type="button"
          onClick={() => setPanel((p) => !p)}
          aria-expanded={panel}
          aria-pressed={activeCount > 0}
          className="rv-chip shrink-0"
        >
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-[11.5px] text-[var(--rv-ink-3)]" aria-live="polite">
          <span className={pending ? "size-1.5 rounded-full bg-[var(--rv-caution)]" : "rv-live-dot"} />
          {pending ? "Updating" : `${compact(total)} tokens · live`}
        </span>
      </div>

      {panel && (
        <FilterPanel
          filters={filters}
          onApply={(f) => {
            setPanel(false)
            go(f)
          }}
        />
      )}

      {tokens.length === 0 ? (
        <div className="rv-card px-6 py-14 text-center">
          <p className="text-[16px] font-semibold text-[var(--rv-ink)]">No tokens match</p>
          <p className="mt-1 text-[13px] text-[var(--rv-ink-2)]">Loosen a filter to see more.</p>
          <button type="button" onClick={() => go({ ...DEFAULT_FILTERS })} className="rv-btn mt-4">
            Reset filters
          </button>
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
          <MobileList tokens={tokens} now={now} offset={(page - 1) * PAGE_SIZE} tf={filters.tf} showWhy={showWhy} />
          <Pagination page={page} pages={pages} onPage={goPage} />
        </>
      )}

      <p className="text-[12px] leading-relaxed text-[var(--rv-ink-3)]">
        Every Arc token with a pool is listed. A red edge means Riven flagged it from on-chain evidence — fake volume, serial
        launchers, creators who sold out, pulled liquidity, impersonation.{" "}
        <button type="button" onClick={() => go({ view: "caught" })} className="font-semibold text-[var(--rv-risk)] hover:underline">
          See only flagged, with the evidence
        </button>
        {" · "}
        <a href={DISPUTE_URL} className="font-semibold text-[var(--rv-ice)] hover:underline">
          Dispute a score
        </a>
        {" · "}Market data: DexScreener. Not financial advice.
      </p>
    </section>
  )
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="rv-label">{label}</dt>
      <dd className="rv-num font-bold text-[var(--rv-ink)]">{value}</dd>
    </div>
  )
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: Array<[T, string]>
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rv-chip shrink-0 cursor-pointer outline-none"
      style={value !== options[0]![0] ? { color: "var(--rv-ink)", borderColor: "var(--rv-stroke-strong)" } : undefined}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

function FilterPanel({ filters, onApply }: { filters: ScreenerFilters; onApply: (f: Partial<ScreenerFilters>) => void }) {
  const [draft, setDraft] = useState(filters)
  const field = (key: "minLiq" | "minMcap" | "maxMcap" | "minVol" | "minScore", label: string, hint: string) => (
    <label className="flex flex-col gap-1">
      <span className="rv-label">{label}</span>
      <input
        inputMode="decimal"
        value={draft[key] || ""}
        placeholder={hint}
        onChange={(e) => setDraft({ ...draft, [key]: Math.max(0, Number(e.target.value) || 0) })}
        className="rv-input h-9 px-3 text-[13px]"
      />
    </label>
  )
  return (
    <form
      className="rv-card grid grid-cols-2 gap-3 p-4 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault()
        onApply(draft)
      }}
    >
      {field("minLiq", "Min liquidity $", "0")}
      {field("minMcap", "Min market cap $", "0")}
      {field("maxMcap", "Max market cap $", "any")}
      {field("minVol", "Min 24h volume $", "0")}
      {field("minScore", "Min score /10", "0")}
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-5">
        <button
          type="button"
          onClick={() => onApply({ minLiq: 0, minMcap: 0, maxMcap: 0, minVol: 0, minScore: 0 })}
          className="rv-btn-ghost"
        >
          Clear
        </button>
        <button type="submit" className="rv-btn">
          Apply
        </button>
      </div>
    </form>
  )
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  const nums = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b)
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 py-1" aria-label="Pages">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rv-chip disabled:opacity-30">
        ← Prev
      </button>
      <div className="rv-seg">
        {nums.map((n, i) => (
          <span key={n} className="contents">
            {i > 0 && n - nums[i - 1]! > 1 && <span className="px-1 text-[12px] text-[var(--rv-ink-3)]">…</span>}
            <button type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined} className="rv-num min-w-8">
              {n}
            </button>
          </span>
        ))}
      </div>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rv-chip disabled:opacity-30">
        Next →
      </button>
    </nav>
  )
}

/** Flagged rows get a red edge, like a warning stripe. */
function rowStyle(t: TokenSummary) {
  return t.fake ? { boxShadow: "inset 2px 0 0 var(--rv-risk)" } : undefined
}

function Pct({ v }: { v: number | null }) {
  return (
    <span className="rv-num" style={{ color: v === null ? "var(--rv-ink-3)" : changeColor(v) }}>
      {v === null ? "—" : change(v)}
    </span>
  )
}

function SortHead({
  children,
  s,
  t,
  left,
  title,
  filters,
  onSort,
}: {
  children: React.ReactNode
  s?: SortKey
  t?: Timeframe
  left?: boolean
  title?: string
  filters: ScreenerFilters
  onSort: (s: SortKey, tf?: Timeframe) => void
}) {
  const active = s !== undefined && filters.sort === s && (t === undefined || filters.tf === t)
  return (
    <th className={`rv-label px-2 py-2.5 whitespace-nowrap ${left ? "text-left" : "text-right"}`} title={title}>
      {s ? (
        <button
          type="button"
          onClick={() => onSort(s, t)}
          className={`uppercase hover:text-[var(--rv-ink)] ${active ? "text-[var(--rv-blue)]" : ""}`}
        >
          {children}
          {active ? " ▾" : ""}
        </button>
      ) : (
        children
      )}
    </th>
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
    <div className="rv-card hidden overflow-x-auto md:block">
      <table className="w-full min-w-[1180px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--rv-stroke)]">
            <th className="rv-label w-12 py-2.5 pl-4 text-left">#</th>
            <SortHead left {...h}>
              Token
            </SortHead>
            <SortHead {...h}>Price</SortHead>
            <SortHead s="new" {...h}>
              Age
            </SortHead>
            <SortHead s="txns" title="Buys + sells, 24h" {...h}>
              Txns
            </SortHead>
            <SortHead s="volume" title="24h volume" {...h}>
              Volume
            </SortHead>
            <SortHead s="gainers" t="5m" {...h}>
              5m
            </SortHead>
            <SortHead s="gainers" t="1h" {...h}>
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
            <th className="w-9" />
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => {
            const txns = t.buys24h === null ? null : (t.buys24h ?? 0) + (t.sells24h ?? 0)
            return (
              <tr
                key={t.address}
                onClick={() => router.push(`/token/${t.address}`)}
                className="cursor-pointer border-b border-[var(--rv-stroke)] transition-colors last:border-0 hover:bg-[var(--rv-row-hover)]"
                style={rowStyle(t)}
                title={t.fake ? t.fakeReasons[0] : undefined}
              >
                <td className="rv-num py-2 pl-4 text-[12px] text-[var(--rv-ink-3)]">#{offset + i + 1}</td>
                <td className="px-2 py-2">
                  <Link href={`/token/${t.address}`} className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                    <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={28} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="max-w-[130px] truncate text-[13.5px] font-bold text-[var(--rv-ink)]">{t.symbol}</span>
                        <span className="text-[12px] text-[var(--rv-ink-3)]">/USDC</span>
                        <span className="max-w-[150px] truncate text-[12px] text-[var(--rv-ink-3)]">{t.name}</span>
                      </span>
                      {showWhy && (
                        <span className="block max-w-[520px]">
                          <Why t={t} />
                        </span>
                      )}
                    </span>
                  </Link>
                </td>
                <td className="rv-num px-2 py-2 text-right font-semibold text-[var(--rv-ink)]">
                  {t.priceUsd === null ? "—" : usd(t.priceUsd, { precise: true })}
                </td>
                <td className="rv-num px-2 py-2 text-right text-[var(--rv-ink-2)]">{age(t.launchedAt, now)}</td>
                <td
                  className="rv-num px-2 py-2 text-right text-[var(--rv-ink-2)]"
                  title={t.buys24h === null ? undefined : `${t.buys24h} buys / ${t.sells24h} sells`}
                >
                  {txns === null ? <span className="text-[var(--rv-ink-3)]">—</span> : compact(txns)}
                </td>
                <td className="rv-num px-2 py-2 text-right text-[var(--rv-ink)]">{t.volume.h24 === null ? "—" : usd(t.volume.h24)}</td>
                <td className="px-2 py-2 text-right">
                  <Pct v={t.change.m5} />
                </td>
                <td className="px-2 py-2 text-right">
                  <Pct v={t.change.h1} />
                </td>
                <td className="px-2 py-2 text-right">
                  <Pct v={t.change.h6} />
                </td>
                <td className="px-2 py-2 text-right">
                  <Pct v={t.change.h24} />
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="rv-num text-[var(--rv-ink-2)]">{t.liquidityUsd === null ? "—" : usd(t.liquidityUsd)}</div>
                  {t.usdcInPool !== null && t.usdcInPool < 1000 && (
                    <div className="rv-num text-[10.5px] text-[var(--rv-caution)]" title="Real USDC in the pool — what sellers can exit into">
                      {usd(t.usdcInPool)} real
                    </div>
                  )}
                </td>
                <td className="rv-num px-2 py-2 text-right text-[var(--rv-ink)]">{t.marketCap === null ? "—" : usd(t.marketCap)}</td>
                <td className="px-2 py-2 text-right">
                  <ScoreBadge score={t.score} band={t.band} size="sm" />
                </td>
                <td className="pr-2" onClick={(e) => e.stopPropagation()}>
                  <WatchButton address={t.address} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MobileList({
  tokens,
  now,
  offset,
  tf,
  showWhy,
}: {
  tokens: TokenSummary[]
  now: number
  offset: number
  tf: Timeframe
  showWhy: boolean
}) {
  return (
    <ol className="rv-card divide-y divide-[var(--rv-stroke)] overflow-hidden md:hidden">
      {tokens.map((t, i) => {
        const { chg } = pick(t, tf)
        return (
          <li key={t.address} style={rowStyle(t)}>
            <Link href={`/token/${t.address}`} className="flex items-center gap-2.5 px-3 py-2.5 active:bg-[var(--rv-row-hover)]">
              <span className="rv-num w-6 shrink-0 text-[10.5px] text-[var(--rv-ink-3)]">{offset + i + 1}</span>
              <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[14px] font-bold text-[var(--rv-ink)]">{t.symbol}</span>
                  <span className="text-[11px] text-[var(--rv-ink-3)]">/USDC</span>
                </div>
                <div className="rv-num mt-0.5 flex flex-wrap gap-x-2 text-[10.5px] text-[var(--rv-ink-3)]">
                  <span>{age(t.launchedAt, now)}</span>
                  <span>Liq {t.liquidityUsd === null ? "—" : usd(t.liquidityUsd)}</span>
                  <span>Vol {t.volume.h24 === null ? "—" : usd(t.volume.h24)}</span>
                  <span>Mcap {t.marketCap === null ? "—" : usd(t.marketCap)}</span>
                </div>
                {showWhy && <Why t={t} />}
              </div>
              <div className="shrink-0 text-right">
                <div className="rv-num text-[13px] font-bold text-[var(--rv-ink)]">
                  {t.priceUsd === null ? "—" : usd(t.priceUsd, { precise: true })}
                </div>
                <div className="rv-num text-[11.5px] font-semibold" style={{ color: changeColor(chg) }}>
                  {change(chg)}
                </div>
              </div>
              <ScoreBadge score={t.score} band={t.band} size="sm" />
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
  const text = raw.toLowerCase().startsWith(label.toLowerCase()) ? raw.slice(label.length).replace(/^:?\s*/, "") : raw
  return (
    <span className="mt-1 block text-[11.5px] leading-snug text-[var(--rv-risk)]">
      <b>{label}:</b> {text}
      {t.fakeReasons.length > 1 && <span className="text-[var(--rv-ink-3)]"> · +{t.fakeReasons.length - 1} more</span>}
    </span>
  )
}

export function FlagChip() {
  return (
    <span
      className="rounded bg-[rgba(248,113,113,0.12)] px-1.5 py-px text-[10px] font-bold tracking-wide text-[var(--rv-risk)] uppercase"
      title="Flagged by on-chain evidence — open the token to see why"
    >
      Flagged
    </span>
  )
}

export function Meta({ t, now }: { t: TokenSummary; now: number }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--rv-ink-3)]">
      <span className="rv-num">{age(t.launchedAt, now)}</span>
      <span className="rounded bg-white/[0.05] px-1.5 py-px text-[10.5px] font-semibold text-[var(--rv-ink-2)]">{t.launchpad}</span>
      {t.holders !== null && (
        <span className="rv-num flex items-center gap-1" title="Holders">
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          </svg>
          {compact(t.holders)}
        </span>
      )}
    </span>
  )
}


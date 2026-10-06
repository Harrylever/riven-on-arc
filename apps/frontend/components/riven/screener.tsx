"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  SORTS,
  filtersToQuery,
  type AgeFilter,
  type BandFilter,
  type PadFilter,
  type ScreenerFilters,
  type ViewFilter,
} from "@/lib/screener-params"
import { REASON_LABEL } from "@/lib/reasons"
import { BAND_META, age, change, changeColor, compact, usd } from "@/lib/riven-format"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { WatchButton } from "./watch-button"
import { CopyBadge } from "./copycat"

const REFRESH_MS = 20_000
/** Where score disputes go: set NEXT_PUBLIC_DISPUTE_URL (form, X account, email); else the methodology page. */
const DISPUTE_URL = process.env.NEXT_PUBLIC_DISPUTE_URL || "/methodology#disputes"
const BANDS: BandFilter[] = ["all", "healthy", "caution", "risk"]
const VIEWS: Array<{ id: ViewFilter; label: string; hint: string }> = [
  { id: "listed", label: "Listed", hint: "Flagged tokens hidden" },
  { id: "caught", label: "Caught", hint: "Only flagged tokens, with the evidence" },
  { id: "all", label: "Everything", hint: "Listed and flagged together" },
]

export function Screener({
  filters,
  tokens,
  total,
  page,
  pages,
  serverNow,
}: {
  filters: ScreenerFilters
  tokens: TokenSummary[]
  total: number
  page: number
  pages: number
  serverNow: number
}) {
  const router = useRouter()
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
    startTransition(() =>
      router.push(`/${filtersToQuery({ ...filters, page: 1, ...patch })}`, { scroll: false }),
    )
  const goPage = (p: number) =>
    startTransition(() => {
      router.push(`/${filtersToQuery({ ...filters, page: p })}`, { scroll: false })
      document.getElementById("screener-top")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })

  const activeCount = (Object.keys(DEFAULT_FILTERS) as Array<keyof ScreenerFilters>).filter(
    (k) => !["sort", "band", "page", "view"].includes(k) && filters[k] !== DEFAULT_FILTERS[k],
  ).length

  return (
    <section id="screener-top" aria-label="Arc token screener" className="flex scroll-mt-20 flex-col gap-3">
      {/* Listed / Caught / Everything */}
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-lg bg-[var(--rv-card)] p-1 ring-1 ring-[var(--rv-stroke)]" role="radiogroup" aria-label="Which tokens">
          {VIEWS.map((v) => {
            const on = v.id === filters.view
            const caught = v.id === "caught"
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={v.hint}
                onClick={() => go({ view: v.id })}
                className="rv-body rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
                style={{
                  color: on ? (caught ? "#fff" : "#000") : caught ? "var(--rv-risk)" : "var(--rv-ink-2)",
                  background: on ? (caught ? "var(--rv-risk)" : "var(--rv-ice)") : "transparent",
                }}
              >
                {v.label}
              </button>
            )
          })}
        </div>
        <span className="rv-body hidden text-[12px] text-[var(--rv-ink-3)] sm:inline">
          {VIEWS.find((v) => v.id === filters.view)?.hint}
        </span>
      </div>

      {/* Sort tabs */}
      <nav className="scrollbar-hidden -mx-4 flex gap-1.5 overflow-x-auto px-4" aria-label="Sort">
        {SORTS.map((s) => {
          const on = s.id === filters.sort
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go({ sort: s.id })}
              aria-pressed={on}
              className="rv-body shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors"
              style={{
                color: on ? "#fff" : "var(--rv-ink-2)",
                background: on ? "var(--rv-blue)" : "var(--rv-card)",
                boxShadow: on ? "none" : "inset 0 0 0 1px var(--rv-stroke)",
              }}
            >
              {s.label}
            </button>
          )
        })}
      </nav>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        {BANDS.map((b) => {
          const on = b === filters.band
          const color = b === "all" ? "var(--rv-ice)" : BAND_META[b].color
          return (
            <button
              key={b}
              type="button"
              onClick={() => go({ band: b })}
              aria-pressed={on}
              className="rv-body rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                color: on ? "#000" : color,
                background: on ? color : "transparent",
                boxShadow: `inset 0 0 0 1px ${on ? color : "var(--rv-stroke)"}`,
              }}
            >
              {b === "all" ? "All scores" : BAND_META[b].short}
            </button>
          )
        })}
        <Select
          label="Launchpad"
          value={filters.pad}
          onChange={(v) => go({ pad: v as PadFilter })}
          options={[
            ["all", "All launchpads"],
            ["ARGUS", "Argus"],
            ["TOLLY", "Tolly"],
            ["OTHER", "Other Uniswap v4"],
          ]}
        />
        <Select
          label="Age"
          value={filters.age}
          onChange={(v) => go({ age: v as AgeFilter })}
          options={[
            ["all", "Any age"],
            ["1h", "< 1 hour"],
            ["6h", "< 6 hours"],
            ["24h", "< 24 hours"],
            ["7d", "< 7 days"],
          ]}
        />
        <button
          type="button"
          onClick={() => setPanel((p) => !p)}
          aria-expanded={panel}
          className="rv-body rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--rv-ice)] ring-1 ring-[var(--rv-stroke-strong)]"
        >
          Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
        <span className="rv-num ml-auto text-[11px] text-[var(--rv-ink-3)]" aria-live="polite">
          {pending ? "syncing…" : "live"}
        </span>
      </div>

      {panel && <FilterPanel filters={filters} onApply={(f) => { setPanel(false); go(f) }} />}

      {tokens.length === 0 ? (
        <div className="rv-card px-6 py-12 text-center">
          <p className="rv-display text-lg font-bold text-[var(--rv-ink)]">No tokens match these filters</p>
          <p className="rv-body mt-1 text-sm text-[var(--rv-ink-2)]">
            {filters.view === "caught"
              ? "Nothing flagged under these filters — loosen one to see more."
              : filters.view === "listed"
                ? "Loosen a filter, or switch to “Everything” to include flagged tokens."
                : "Loosen a filter."}
          </p>
          <button
            type="button"
            onClick={() => go(DEFAULT_FILTERS)}
            className="rv-body mt-4 rounded-lg bg-[var(--rv-blue)] px-4 py-2 text-sm font-semibold text-white"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <>
          <DesktopTable tokens={tokens} now={now} offset={(page - 1) * PAGE_SIZE} showWhy={filters.view !== "listed"} />
          <MobileList tokens={tokens} now={now} showWhy={filters.view !== "listed"} />
          <Pagination page={page} pages={pages} total={total} onPage={goPage} />
        </>
      )}
      {filters.view === "listed" && (
        <p className="rv-body text-[12px] text-[var(--rv-ink-3)]">
          Riven hides tokens flagged for fake volume, serial launchers, creators who sold out, pulled liquidity, dead tokens
          and impersonation.{" "}
          <button type="button" onClick={() => go({ view: "caught" })} className="font-semibold text-[var(--rv-risk)] hover:underline">
            See them with the evidence
          </button>
          . Think a flag is wrong?{" "}
          <a href={DISPUTE_URL} className="font-semibold text-[var(--rv-ice)] hover:underline">
            Dispute a score
          </a>
          .
        </p>
      )}
    </section>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<[string, string]>
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rv-body rounded-full bg-black px-3 py-1.5 text-[12px] font-semibold text-[var(--rv-ink-2)] ring-1 ring-[var(--rv-stroke)] outline-none focus:ring-[var(--rv-blue)]"
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
      <span className="rv-body text-[11px] font-semibold tracking-wide text-[var(--rv-ink-3)] uppercase">{label}</span>
      <input
        inputMode="decimal"
        value={draft[key] || ""}
        placeholder={hint}
        onChange={(e) => setDraft({ ...draft, [key]: Math.max(0, Number(e.target.value) || 0) })}
        className="rv-input h-10 px-3 text-[14px]"
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
          onClick={() => onApply({ ...DEFAULT_FILTERS, sort: filters.sort })}
          className="rv-body rounded-lg px-4 py-2 text-sm font-semibold text-[var(--rv-ink-2)] ring-1 ring-[var(--rv-stroke)]"
        >
          Reset
        </button>
        <button type="submit" className="rv-body rounded-lg bg-[var(--rv-blue)] px-4 py-2 text-sm font-semibold text-white">
          Apply
        </button>
      </div>
    </form>
  )
}

function Pct({ v }: { v: number | null }) {
  return (
    <span className="rv-num" style={{ color: changeColor(v) }}>
      {change(v)}
    </span>
  )
}

function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number
  pages: number
  total: number
  onPage: (p: number) => void
}) {
  if (pages <= 1) return <p className="rv-num text-[11px] text-[var(--rv-ink-3)]">{total} tokens</p>
  // Window of page numbers around the current one, always including first and last.
  const nums = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b)
  const btn = "rv-num h-9 min-w-9 rounded-md px-2.5 text-[13px] font-semibold transition-colors"
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 py-1" aria-label="Pages">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className={`${btn} text-[var(--rv-ink-2)] ring-1 ring-[var(--rv-stroke)] disabled:opacity-30`}
      >
        ← Prev
      </button>
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1]! > 1 && <span className="text-[var(--rv-ink-3)]">…</span>}
          <button
            type="button"
            onClick={() => onPage(n)}
            aria-current={n === page ? "page" : undefined}
            className={btn}
            style={{
              color: n === page ? "#fff" : "var(--rv-ink-2)",
              background: n === page ? "var(--rv-blue)" : "transparent",
              boxShadow: n === page ? "none" : "inset 0 0 0 1px var(--rv-stroke)",
            }}
          >
            {n}
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className={`${btn} text-[var(--rv-ink-2)] ring-1 ring-[var(--rv-stroke)] disabled:opacity-30`}
      >
        Next →
      </button>
      <span className="rv-num w-full text-center text-[11px] text-[var(--rv-ink-3)]">
        Page {page} of {pages} · {total} tokens
      </span>
    </nav>
  )
}

/** The first flag reason, as evidence the user can check. */
function Why({ t }: { t: TokenSummary }) {
  if (!t.fake) return null
  const code = t.fakeCodes[0]
  return (
    <span className="rv-body mt-0.5 block text-[11.5px] leading-snug text-[var(--rv-risk)]">
      <b>{(code && REASON_LABEL[code]?.label) ?? "Flagged"}:</b> {t.fakeReasons[0]}
      {t.fakeReasons.length > 1 && <span className="text-[var(--rv-ink-3)]"> · +{t.fakeReasons.length - 1} more</span>}
    </span>
  )
}

function FlagBadge() {
  return (
    <span
      className="rounded bg-[rgba(239,68,68,0.12)] px-1.5 text-[10px] font-bold text-[var(--rv-risk)] uppercase"
      title="Flagged by on-chain evidence — open the token to see why"
    >
      flagged
    </span>
  )
}

function DesktopTable({
  tokens,
  now,
  offset,
  showWhy,
}: {
  tokens: TokenSummary[]
  now: number
  offset: number
  showWhy: boolean
}) {
  const router = useRouter()
  return (
    <div className="rv-card hidden overflow-x-auto md:block">
      <table className="rv-table w-full min-w-[1080px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--rv-stroke)] text-left">
            <th className="w-10 px-3 py-2.5">#</th>
            <th className="px-2 py-2.5">Token</th>
            <th className="px-2 py-2.5 text-right">Price</th>
            <th className="px-2 py-2.5 text-right">Age</th>
            <th className="px-2 py-2.5 text-right">Txns</th>
            <th className="px-2 py-2.5 text-right">Volume</th>
            <th className="px-2 py-2.5 text-right">5M</th>
            <th className="px-2 py-2.5 text-right">1H</th>
            <th className="px-2 py-2.5 text-right">6H</th>
            <th className="px-2 py-2.5 text-right">24H</th>
            <th className="px-2 py-2.5 text-right">Liquidity</th>
            <th className="px-2 py-2.5 text-right">MCap</th>
            <th className="px-3 py-2.5 text-right">Score</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => (
            <tr
              key={t.address}
              onClick={() => router.push(`/token/${t.address}`)}
              className="cursor-pointer border-b border-[var(--rv-stroke)] transition-colors last:border-0 hover:bg-[var(--rv-row-hover)]"
            >
              <td className="rv-num px-3 py-2.5 text-[var(--rv-ink-3)]">{offset + i + 1}</td>
              <td className="px-2 py-2">
                <Link href={`/token/${t.address}`} className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                  <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={30} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="rv-body max-w-[150px] truncate font-semibold text-[var(--rv-ink)]">{t.symbol}</span>
                      {t.fake && <FlagBadge />}
                      <CopyBadge copies={t.copies} />
                    </span>
                    <span className="rv-body block max-w-[180px] truncate text-[11px] text-[var(--rv-ink-3)]">
                      {t.name} · {t.launchpad}
                    </span>
                    {showWhy && <span className="block max-w-[360px]"><Why t={t} /></span>}
                  </span>
                </Link>
              </td>
              <td className="rv-num px-2 py-2.5 text-right text-[var(--rv-ink)]">{usd(t.priceUsd, { precise: true })}</td>
              <td className="rv-num px-2 py-2.5 text-right text-[var(--rv-ink-2)]">{age(t.launchedAt, now)}</td>
              <td className="rv-num px-2 py-2.5 text-right text-[var(--rv-ink-2)]">
                {t.buys24h === null ? "—" : compact((t.buys24h ?? 0) + (t.sells24h ?? 0))}
              </td>
              <td className="rv-num px-2 py-2.5 text-right text-[var(--rv-ink)]">{usd(t.volume.h24)}</td>
              <td className="px-2 py-2.5 text-right"><Pct v={t.change.m5} /></td>
              <td className="px-2 py-2.5 text-right"><Pct v={t.change.h1} /></td>
              <td className="px-2 py-2.5 text-right"><Pct v={t.change.h6} /></td>
              <td className="px-2 py-2.5 text-right"><Pct v={t.change.h24} /></td>
              <td className="rv-num px-2 py-2.5 text-right text-[var(--rv-ink-2)]">{usd(t.liquidityUsd)}</td>
              <td className="rv-num px-2 py-2.5 text-right text-[var(--rv-ink)]">{usd(t.marketCap)}</td>
              <td className="px-3 py-2 text-right">
                <ScoreBadge score={t.score} band={t.band} size="sm" word />
              </td>
              <td className="pr-2" onClick={(e) => e.stopPropagation()}>
                <WatchButton address={t.address} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MobileList({ tokens, now, showWhy }: { tokens: TokenSummary[]; now: number; showWhy: boolean }) {
  return (
    <ol className="rv-card divide-y divide-[var(--rv-stroke)] md:hidden">
      {tokens.map((t) => (
        <li key={t.address} className="flex items-center">
          <Link href={`/token/${t.address}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 active:bg-[var(--rv-row-hover)]">
            <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rv-body truncate text-[15px] font-semibold text-[var(--rv-ink)]">{t.symbol}</span>
                {t.fake && <FlagBadge />}
                <CopyBadge copies={t.copies} />
                <span className="rv-num text-[11px] text-[var(--rv-ink-3)]">{age(t.launchedAt, now)}</span>
              </div>
              <div className="rv-num mt-0.5 flex gap-2.5 text-[12px] text-[var(--rv-ink-2)]">
                <span>MC {usd(t.marketCap)}</span>
                <span>Liq {usd(t.liquidityUsd)}</span>
                <span style={{ color: changeColor(t.change.h24) }}>{change(t.change.h24)}</span>
              </div>
              {showWhy && <Why t={t} />}
            </div>
            <ScoreBadge score={t.score} band={t.band} size="sm" word />
          </Link>
          <WatchButton address={t.address} />
        </li>
      ))}
    </ol>
  )
}

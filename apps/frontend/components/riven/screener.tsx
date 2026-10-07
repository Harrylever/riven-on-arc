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
  type PadFilter,
  type ScreenerFilters,
  type Timeframe,
  type ViewFilter,
} from "@/lib/screener-params"
import { REASON_LABEL } from "@/lib/reasons"
import { BAND_META, age, change, changeColor, compact, usd } from "@/lib/riven-format"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { WatchButton } from "./watch-button"
import { CopyBadge } from "./copycat"

const REFRESH_MS = 20_000
/** Where "Dispute a score" goes: NEXT_PUBLIC_DISPUTE_URL, else the methodology page. */
const DISPUTE_URL = process.env.NEXT_PUBLIC_DISPUTE_URL || "/methodology#disputes"

const BANDS: BandFilter[] = ["all", "healthy", "caution", "risk"]
const VIEWS: Array<{ id: ViewFilter; label: string; hint: string }> = [
  { id: "listed", label: "Listed", hint: "Flagged tokens hidden" },
  { id: "caught", label: "Caught", hint: "Only flagged tokens, with the evidence" },
  { id: "all", label: "Everything", hint: "Listed and flagged together" },
]
const PADS: Array<[PadFilter, string]> = [
  ["all", "All launchpads"],
  ["ARGUS", "Argus"],
  ["TOLLY", "Tolly"],
  ["OTHER", "Uniswap v4"],
]

const pick = (t: TokenSummary, tf: Timeframe) => {
  const k = ({ "5m": "m5", "1h": "h1", "6h": "h6", "24h": "h24" } as const)[tf]
  return { vol: t.volume[k], chg: t.change[k] }
}

export function Screener({
  title = "Trending",
  filters,
  tokens,
  total,
  page,
  pages,
  serverNow,
}: {
  title?: string
  filters: ScreenerFilters
  tokens: TokenSummary[]
  total: number
  page: number
  pages: number
  serverNow: number
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

  const activeCount = (Object.keys(DEFAULT_FILTERS) as Array<keyof ScreenerFilters>).filter(
    (k) => !["sort", "band", "page", "view", "tf", "pad", "age"].includes(k) && filters[k] !== DEFAULT_FILTERS[k],
  ).length
  const showWhy = filters.view !== "listed"

  return (
    <section id="screener-top" aria-label="Arc token screener" className="flex scroll-mt-28 flex-col gap-3">
      {/* Title + timeframe + view */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--rv-ink)]">{title}</h1>
        <div className="rv-seg" role="group" aria-label="Timeframe">
          {TIMEFRAMES.map((tf) => (
            <button key={tf} type="button" aria-pressed={filters.tf === tf} onClick={() => go({ tf })}>
              {tf}
            </button>
          ))}
        </div>
        <div className="rv-seg" role="radiogroup" aria-label="Which tokens">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={filters.view === v.id}
              title={v.hint}
              onClick={() => go({ view: v.id })}
              style={v.id === "caught" && filters.view !== "caught" ? { color: "var(--rv-risk)" } : undefined}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-[var(--rv-ink-3)]" aria-live="polite">
          <span className={pending ? "size-1.5 rounded-full bg-[var(--rv-caution)]" : "rv-live-dot"} />
          {pending ? "Updating" : `${total} tokens · live`}
        </span>
      </div>

      {/* Sort + launchpad + band + filters */}
      <div className="scrollbar-hidden -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
        {SORTS.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === filters.sort} onClick={() => go({ sort: s.id })} className="rv-chip shrink-0">
            {s.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--rv-stroke)]" aria-hidden />
        {PADS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filters.pad === id} onClick={() => go({ pad: id })} className="rv-chip shrink-0">
            {label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--rv-stroke)]" aria-hidden />
        {BANDS.map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={b === filters.band}
            onClick={() => go({ band: b })}
            className="rv-chip shrink-0"
            style={b !== "all" ? { color: BAND_META[b].color } : undefined}
          >
            {b === "all" ? "Any score" : BAND_META[b].short}
          </button>
        ))}
        <select
          aria-label="Age"
          value={filters.age}
          onChange={(e) => go({ age: e.target.value as AgeFilter })}
          className="rv-chip shrink-0 outline-none"
        >
          <option value="all">Any age</option>
          <option value="1h">&lt; 1 hour</option>
          <option value="6h">&lt; 6 hours</option>
          <option value="24h">&lt; 24 hours</option>
          <option value="7d">&lt; 7 days</option>
        </select>
        <button
          type="button"
          onClick={() => setPanel((p) => !p)}
          aria-expanded={panel}
          aria-pressed={activeCount > 0}
          className="rv-chip shrink-0"
        >
          Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
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
          <p className="mt-1 text-[13px] text-[var(--rv-ink-2)]">
            {filters.view === "caught"
              ? "Nothing flagged under these filters — loosen one to see more."
              : filters.view === "listed"
                ? "Loosen a filter, or switch to “Everything” to include flagged tokens."
                : "Loosen a filter."}
          </p>
          <button type="button" onClick={() => go({ ...DEFAULT_FILTERS })} className="rv-btn mt-4">
            Reset filters
          </button>
        </div>
      ) : (
        <>
          <DesktopTable tokens={tokens} now={now} offset={(page - 1) * PAGE_SIZE} tf={filters.tf} showWhy={showWhy} />
          <MobileList tokens={tokens} now={now} tf={filters.tf} showWhy={showWhy} />
          <Pagination page={page} pages={pages} onPage={goPage} />
        </>
      )}

      {filters.view === "listed" && (
        <p className="text-[12px] leading-relaxed text-[var(--rv-ink-3)]">
          Hidden here: tokens flagged for fake volume, serial launchers, creators who sold out, pulled liquidity, dead tokens and
          impersonation.{" "}
          <button type="button" onClick={() => go({ view: "caught" })} className="font-semibold text-[var(--rv-risk)] hover:underline">
            See them with the evidence
          </button>
          {" · "}
          <a href={DISPUTE_URL} className="font-semibold text-[var(--rv-ice)] hover:underline">
            Dispute a score
          </a>
        </p>
      )}
    </section>
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
      {field("minVol", "Min volume $", "0")}
      {field("minScore", "Min score /10", "0")}
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-5">
        <button type="button" onClick={() => onApply({ ...DEFAULT_FILTERS, sort: filters.sort, tf: filters.tf })} className="rv-btn-ghost">
          Reset
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
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
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
      {t.fake && <FlagChip />}
      <CopyBadge copies={t.copies} />
    </span>
  )
}

/** Faint row tint by direction, like a heat map; flagged rows get a red edge. */
function rowStyle(t: TokenSummary, chg: number | null) {
  const tint =
    chg === null || Math.abs(chg) < 1 ? "transparent" : chg > 0 ? "rgba(163,230,53,0.035)" : "rgba(248,113,113,0.035)"
  return { background: tint, boxShadow: t.fake ? "inset 2px 0 0 var(--rv-risk)" : undefined }
}

function DesktopTable({
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
  const router = useRouter()
  return (
    <div className="rv-card hidden overflow-x-auto md:block">
      <table className="w-full min-w-[980px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--rv-stroke)] text-left">
            <th className="rv-label w-10 py-2.5 pl-4">#</th>
            <th className="rv-label px-2 py-2.5">Token</th>
            <th className="rv-label px-2 py-2.5 text-right">Price</th>
            <th className="rv-label px-2 py-2.5 text-right">Market cap</th>
            <th className="rv-label px-2 py-2.5 text-right">Vol {tf}</th>
            <th className="rv-label px-2 py-2.5 text-right">Liquidity</th>
            <th className="rv-label px-2 py-2.5 text-right">Txns 24h</th>
            <th className="rv-label px-3 py-2.5 text-right">Riven score</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => {
            const { vol, chg } = pick(t, tf)
            return (
              <tr
                key={t.address}
                onClick={() => router.push(`/token/${t.address}`)}
                className="cursor-pointer border-b border-[var(--rv-stroke)] transition-colors last:border-0 hover:bg-[var(--rv-row-hover)]"
                style={rowStyle(t, chg)}
              >
                <td className="rv-num py-3 pl-4 align-top text-[12px] text-[var(--rv-ink-3)]">{offset + i + 1}</td>
                <td className="px-2 py-2.5">
                  <Link href={`/token/${t.address}`} className="flex items-start gap-3" onClick={(e) => e.stopPropagation()}>
                    <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={40} />
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-1.5">
                        <span className="max-w-[160px] truncate text-[14px] font-bold text-[var(--rv-ink)]">{t.symbol}</span>
                        <span className="max-w-[200px] truncate text-[12px] text-[var(--rv-ink-3)]">{t.name}</span>
                      </span>
                      <Meta t={t} now={now} />
                      {showWhy && (
                        <span className="block max-w-[440px]">
                          <Why t={t} />
                        </span>
                      )}
                    </span>
                  </Link>
                </td>
                <td className="rv-num px-2 py-3 text-right align-top text-[var(--rv-ink-2)]">{usd(t.priceUsd, { precise: true })}</td>
                <td className="px-2 py-2.5 text-right align-top">
                  <div className="rv-num text-[14px] font-bold text-[var(--rv-ink)]">{usd(t.marketCap)}</div>
                  <div className="rv-num text-[11.5px] font-semibold" style={{ color: changeColor(chg) }}>
                    {change(chg)}
                  </div>
                </td>
                <td className="rv-num px-2 py-3 text-right align-top font-semibold text-[var(--rv-ink)]">{usd(vol)}</td>
                <td className="px-2 py-2.5 text-right align-top">
                  <div className="rv-num text-[var(--rv-ink-2)]">{usd(t.liquidityUsd)}</div>
                  {t.usdcInPool !== null && (
                    <div
                      className="rv-num text-[11px]"
                      style={{ color: t.usdcInPool < 1000 ? "var(--rv-caution)" : "var(--rv-ink-3)" }}
                      title="Real USDC in the pool — what sellers can exit into"
                    >
                      {usd(t.usdcInPool)} USDC
                    </div>
                  )}
                </td>
                <td className="rv-num px-2 py-3 text-right align-top text-[12px]">
                  {t.buys24h === null ? (
                    <span className="text-[var(--rv-ink-3)]">—</span>
                  ) : (
                    <>
                      <span className="text-[var(--rv-up)]">{compact(t.buys24h)}</span>
                      <span className="text-[var(--rv-ink-3)]"> / </span>
                      <span className="text-[var(--rv-down)]">{compact(t.sells24h)}</span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right align-top">
                  <ScoreBadge score={t.score} band={t.band} size="sm" word />
                </td>
                <td className="pr-2 align-top" onClick={(e) => e.stopPropagation()}>
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

function MobileList({ tokens, now, tf, showWhy }: { tokens: TokenSummary[]; now: number; tf: Timeframe; showWhy: boolean }) {
  return (
    <ol className="rv-card divide-y divide-[var(--rv-stroke)] overflow-hidden md:hidden">
      {tokens.map((t) => {
        const { chg } = pick(t, tf)
        return (
          <li key={t.address} className="flex items-start" style={rowStyle(t, chg)}>
            <Link href={`/token/${t.address}`} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 active:bg-[var(--rv-row-hover)]">
              <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[15px] font-bold text-[var(--rv-ink)]">{t.symbol}</span>
                  <span className="truncate text-[12px] text-[var(--rv-ink-3)]">{t.name}</span>
                </div>
                <Meta t={t} now={now} />
                {showWhy && <Why t={t} />}
              </div>
              <div className="shrink-0 text-right">
                <div className="rv-num text-[14px] font-bold text-[var(--rv-ink)]">{usd(t.marketCap)}</div>
                <div className="rv-num text-[11.5px] font-semibold" style={{ color: changeColor(chg) }}>
                  {change(chg)}
                </div>
                <div className="mt-1">
                  <ScoreBadge score={t.score} band={t.band} size="sm" />
                </div>
              </div>
            </Link>
            <div className="pt-3 pr-1">
              <WatchButton address={t.address} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

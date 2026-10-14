"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { SUB_SCORE_LABEL, type SubScoreKey } from "@riven/shared/score"
import type { Callout, CreatorRecord, TokenDetail } from "@/lib/arc-data"
import {
  BAND_META,
  age,
  change,
  changeColor,
  compact,
  pct,
  shortAddr,
  times,
  usd,
} from "@/lib/riven-format"
import { ScoreMeter } from "./score-badge"
import { ScoreNow } from "./score-now"
import { Findings } from "./findings"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TAB_LIST, TAB_TRIGGER } from "./card-style"
import { CalloutsRow } from "./home-sections"
import {
  exitQuote,
  maxSellForImpact,
  plausiblePoolUsdc,
} from "@/lib/exit-quote"
import type { Holo, Mood } from "@/components/mascot/mascot"
import { useRiven, useRivenPage } from "@/components/mascot/riven-context"
import { TokenAvatar } from "./token-avatar"
import { WatchButton } from "./watch-button"
import { CopyBadge, CopycatWarning } from "./copycat"
import { TradeSheet } from "./trade-sheet"
import { useArcWallet } from "@/hooks/use-arc-wallet"
import { TRADING_ENABLED } from "@/lib/flags"
import { visibleInterval } from "@/lib/visible-interval"
import { ArrowIcon } from "@/components/riven/arrow"
import { Input } from "@/components/ui/input"
import { RV_INPUT } from "@/components/riven/card-style"

const EXPLORER = "https://explorer.arc.io"
const ORDER: SubScoreKey[] = [
  "contract",
  "liquidity",
  "holders",
  "creator",
  "activity",
]
const SUB_HINT: Record<SubScoreKey, string> = {
  contract: "Can anyone mint, pause, upgrade or tax it?",
  liquidity: "Can the pool be pulled, and is there USDC to sell into?",
  holders: "Is supply spread out, or held by the team, snipers and insiders?",
  creator: "Has this creator dumped or launched lots of tokens before?",
  activity: "Is real trading happening, or is the volume fake?",
}
const ALERT_LABEL: Record<string, string> = {
  RUG_PULL: "Rug pull",
  CREATOR_DUMP: "Creator dump",
  WHALE_DUMP: "Whale dump",
  SCORE_DROP: "Score drop",
}

/** `serverNow` keeps relative times identical between the server render and hydration. */
export function TokenView({
  t,
  callouts = [],
  serverNow,
}: {
  t: TokenDetail
  callouts?: Callout[]
  serverNow: number
}) {
  const m = BAND_META[t.band]
  const now = serverNow
  const tradable =
    TRADING_ENABLED && (!!t.pairAddress || t.launchpad !== "Tolly")
  const dangers = t.flags.filter((f) => f.level === "danger")
  const warnings = t.flags.filter((f) => f.level === "warning")
  const goods = t.flags.filter((f) => f.level === "good")
  const [tab, setTab] = useState<
    "trades" | "holders" | "bubblemaps" | "creator" | "callouts"
  >("trades")

  const mood: Mood =
    t.fake || t.band === "risk"
      ? "danger"
      : t.band === "caution"
        ? "warn"
        : t.band === "healthy"
          ? "happy"
          : "idle"
  const tone: Holo["tone"] =
    t.band === "healthy"
      ? "green"
      : t.band === "caution"
        ? "amber"
        : t.band === "risk"
          ? "red"
          : "blue"
  const holos: Holo[] = [
    {
      title: `${t.symbol} · Riven score`,
      value: t.score === null ? "scoring…" : `${t.score.toFixed(1)}/10`,
      note: t.fake ? t.fakeReasons[0] : t.verdict,
      gauge: t.score === null ? undefined : t.score / 10,
      series:
        t.priceSeries.length > 2 ? t.priceSeries.map((s) => s.p) : undefined,
      tone,
    },
    {
      title: "24h",
      value: t.change.h24 === null ? "—" : change(t.change.h24),
      tone: (t.change.h24 ?? 0) >= 0 ? "green" : "red",
    },
    {
      title: "Real USDC",
      value: t.usdcInPool === null ? "—" : usd(t.usdcInPool),
      tone: t.usdcInPool !== null && t.usdcInPool < 1000 ? "amber" : "blue",
    },
    {
      title: "Holders",
      value: t.holders === null ? "—" : compact(t.holders),
      tone: "blue",
    },
  ]
  // Nothing to read: no score, no price, no pool → he shrugs instead of scanning.
  const hasData =
    t.score !== null || t.priceUsd !== null || t.liquidityUsd !== null
  const router = useRouter()
  const riven = useRiven()
  const [flash, setFlash] = useState(0)
  const requestScan = () =>
    fetch(`/api/arc/tokens/${t.address}/rescore`, { method: "POST" })
      .catch(() => {})
      .finally(() => router.refresh())
  const lines = [
    t.fake ? `Flagged: ${t.fakeReasons[0]}` : t.verdict,
    ...dangers.slice(0, 2).map((f) => f.text),
    ...(goods[0] ? [`Good sign: ${goods[0].text.toLowerCase()}.`] : []),
    "Tap me — I'll scan it and pull up the numbers.",
  ]
  useRivenPage({
    mood,
    holos,
    lines,
    greet: `${m.label}. ${t.fake ? t.fakeReasons[0] : t.verdict}`,
    scan: {
      hasData,
      // Hologram open: ask for a fresh score and reload the numbers…
      onPress: () => void requestScan(),
      // …then point at the full breakdown, updated.
      onDone: () => {
        router.refresh()
        setFlash((f) => f + 1)
        document
          .getElementById("score")
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      },
    },
  })
  // Keep the page live: numbers refresh about once a minute while it is visible, and once more after a scan settles.
  useEffect(() => visibleInterval(() => router.refresh(), 60_000), [router])
  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => router.refresh(), 45_000)
    return () => window.clearTimeout(id)
  }, [flash, router])

  return (
    <div className="flex flex-col gap-4">
      {/* Header: three rows on a phone (identity + actions, price, facts); one row from md up */}
      <header className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 md:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] md:gap-x-4 md:gap-y-1">
        <Link
          href="/trending"
          className="col-start-1 row-start-1 inline-flex items-center text-[12px] font-semibold text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)] md:row-span-2"
          aria-label="Back to trending"
        >
          <ArrowIcon dir="left" className="size-4" />
        </Link>
        <div className="col-start-2 row-start-1 md:row-span-2">
          <TokenAvatar
            image={t.image}
            symbol={t.symbol}
            address={t.address}
            size={52}
          />
        </div>
        <div className="col-start-3 row-start-1 flex min-w-0 flex-col md:flex-row md:flex-wrap md:items-baseline md:gap-x-2 md:self-end">
          <h1 className="truncate text-[22px] leading-tight font-bold tracking-tight text-[var(--rv-ink)] md:text-[24px]">
            {t.symbol}
          </h1>
          <span className="truncate text-[13px] text-[var(--rv-ink-3)] md:text-[14px]">
            {t.name}
          </span>
        </div>
        <div className="col-start-4 row-start-1 flex items-center gap-1.5 md:col-start-5 md:row-span-2 md:gap-2">
          <button
            type="button"
            onClick={() => {
              riven.scan()
              if (!hasData)
                riven.speak(
                  "Nothing to read on this pair yet — no trades or pool data.",
                  4500,
                )
            }}
            className="rv-btn size-9 gap-1.5 px-0 text-[13px] sm:w-auto sm:px-3"
            title="Riven scans this token and refreshes its score"
            aria-label="Scan this token"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-[17px] sm:size-[15px]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              aria-hidden
            >
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-4.2-4.2" />
            </svg>
            <span className="hidden sm:inline">Scan</span>
          </button>
          <WatchButton address={t.address} size="lg" />
        </div>
        <div className="col-span-4 row-start-2 flex items-baseline justify-between gap-3 md:col-span-1 md:col-start-4 md:row-span-2 md:block md:text-right">
          <div className="rv-num text-[26px] leading-none font-bold tracking-tight text-[var(--rv-ink)] md:text-[24px]">
            {usd(t.priceUsd, { precise: true })}
          </div>
          <div
            className="rv-num text-[13px] font-semibold whitespace-nowrap md:mt-1"
            style={{ color: changeColor(t.change.h24) }}
          >
            {change(t.change.h24)}{" "}
            <span className="text-[var(--rv-ink-3)]">24h</span>
          </div>
        </div>
        <div className="col-span-4 row-start-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--rv-ink-3)] md:col-span-1 md:col-start-3 md:row-start-2 md:mt-1 md:self-start">
          <span className="rounded bg-white/[0.05] px-1.5 py-px font-semibold whitespace-nowrap text-[var(--rv-ink-2)]">
            {t.launchpad}
          </span>
          <span className="rv-num whitespace-nowrap">
            {age(t.launchedAt, now)} old
          </span>
          {t.fake && (
            <span className="rounded bg-[rgba(248,113,113,0.12)] px-1.5 py-px text-[10px] font-bold tracking-wide whitespace-nowrap text-[var(--rv-risk)] uppercase">
              Flagged
            </span>
          )}
          <CopyBadge copies={t.copies} />
          <CopyAddress address={t.address} />
          <a
            href={`${EXPLORER}/address/${t.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap hover:text-[var(--rv-ice)]"
          >
            Explorer ↗
          </a>
          {t.dexUrl && (
            <a
              href={t.dexUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap hover:text-[var(--rv-ice)]"
            >
              DexScreener ↗
            </a>
          )}
        </div>
      </header>

      {/* Stat strip */}
      <section className="rv-card scrollbar-hidden flex overflow-x-auto">
        <Stat label="Market cap" value={usd(t.marketCap)} />
        <Stat
          label="Change 1h"
          value={change(t.change.h1)}
          color={changeColor(t.change.h1)}
        />
        <Stat label="Volume 24h" value={usd(t.volume.h24)} />
        <Stat
          label="Liquidity"
          value={usd(t.liquidityUsd)}
          hint="DexScreener's figure"
        />
        <Stat
          label="USDC in pool"
          value={usd(t.usdcInPool)}
          color={
            t.usdcInPool !== null && t.usdcInPool < 1000
              ? "var(--rv-caution)"
              : undefined
          }
          hint="Real USDC sellers can exit into"
        />
        <Stat label="Holders" value={compact(t.holders)} />
        <Stat
          label="Buys / sells"
          value={
            t.buys24h === null
              ? "—"
              : `${compact(t.buys24h)} / ${compact(t.sells24h)}`
          }
        />
        <Stat label="Fee" value={t.feePct === null ? "—" : pct(t.feePct)} />
      </section>
      {t.liquidityUsd !== null &&
        t.usdcInPool !== null &&
        t.usdcInPool < t.liquidityUsd * 0.1 && (
          <p className="-mt-2 text-[12px] leading-snug text-[var(--rv-caution)]">
            Most of that &ldquo;liquidity&rdquo; is this token valued at its own
            price. Only {usd(t.usdcInPool)} of real USDC is in the pool —
            that&apos;s all sellers can exit into.
          </p>
        )}

      {t.usdcInPool !== null &&
        plausiblePoolUsdc(t.usdcInPool, t.liquidityUsd) && (
          <ExitCheck poolUsdc={t.usdcInPool} />
        )}

      <CopycatWarning token={t} copies={t.copyList} now={now} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Chart */}
          {t.pairAddress ? (
            <section className="rv-card overflow-hidden">
              <iframe
                title={`${t.symbol} chart`}
                src={`https://dexscreener.com/arc/${t.pairAddress}?embed=1&loadChartSettings=0&trades=0&info=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=5`}
                className="h-[460px] w-full border-0 bg-[var(--rv-sunken)]"
                loading="lazy"
              />
            </section>
          ) : t.priceSeries.length > 2 ? (
            <PriceChart series={t.priceSeries} />
          ) : null}

          {/* Tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="rv-card gap-0 overflow-hidden">
            <div className="border-b border-[var(--rv-stroke)] px-2">
            <TabsList variant="line" className={TAB_LIST} aria-label="Token details">
              {(
                [
                  [
                    "trades",
                    `Trades${t.trades.length ? ` ${t.trades.length}` : ""}`,
                  ],
                  ["holders", "Holders"],
                  ["bubblemaps", "Bubble maps"],
                  ["creator", "Creator"],
                  [
                    "callouts",
                    `Callouts${callouts.length ? ` ${callouts.length}` : ""}`,
                  ],
                ] as const
              ).map(([id, label]) => (
                <TabsTrigger key={id} value={id} className={TAB_TRIGGER}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            </div>
            <TabsContent value={tab} className="[&>section]:rounded-md [&>section]:border-0 [&>section]:bg-transparent [&>section>h2]:hidden">
              {tab === "trades" &&
                (t.trades.length ? (
                  <Trades t={t} now={now} />
                ) : (
                  <p className="p-4 text-[13px] text-[var(--rv-ink-2)]">
                    No indexed trades yet.
                  </p>
                ))}
              {tab === "holders" && (
                <Holders t={t} onBubbleMaps={() => setTab("bubblemaps")} />
              )}
              {tab === "bubblemaps" && (
                <BubbleMap address={t.address} symbol={t.symbol} />
              )}
              {tab === "creator" &&
                (t.creatorRecord ? (
                  <CreatorTrack record={t.creatorRecord} now={now} />
                ) : (
                  <p className="p-4 text-[13px] text-[var(--rv-ink-2)]">
                    The creator of this token isn&apos;t known yet.
                  </p>
                ))}
              {tab === "callouts" && (
                <div className="p-4">
                  <CalloutsRow callouts={callouts} now={now} />
                </div>
              )}
            </TabsContent>
          </Tabs>

          <section className="rv-card flex flex-col gap-2 p-4 text-[12px]">
            <h2 className="text-[15px] font-bold text-[var(--rv-ink)]">
              Check it yourself
            </h2>
            <Row
              label="Token"
              value={t.address}
              href={`${EXPLORER}/address/${t.address}`}
            />
            {/^0x[0-9a-f]{40}$/.test(t.creator) && (
              <Row
                label="Creator"
                value={t.creator}
                href={`${EXPLORER}/address/${t.creator}`}
              />
            )}
            {t.launchTx && (
              <Row
                label="Launch tx"
                value={t.launchTx}
                href={`${EXPLORER}/tx/${t.launchTx}`}
              />
            )}
            {t.dexUrl && (
              <Row label="DexScreener" value="Open pair" href={t.dexUrl} />
            )}
            {[...new Set(t.links)].filter(safeLink).map((l) => (
              <Row key={l} label="Website" value={l} href={l} unverified />
            ))}
            {t.socials
              .filter((s) => safeLink(s.url))
              .map((s) => (
                <Row
                  key={s.url}
                  label={s.type}
                  value={s.url}
                  href={s.url}
                  unverified
                />
              ))}
            {(t.links.length > 0 || t.socials.length > 0) && (
              <p className="text-[11px] text-[var(--rv-caution)]">
                Website and social links are set by the token creator and
                aren&apos;t verified. Never connect your wallet to a site just
                because a token links to it.
              </p>
            )}
            <p className="mt-1 text-[11px] text-[var(--rv-ink-3)]">
              Scores come from Arc mainnet. Market numbers come from
              DexScreener. Not financial advice. DYOR.
            </p>
          </section>
        </div>

        {/* Sidebar: shown first on phones (order-first): the score is the point of Riven. */}
        <aside className="order-first flex flex-col gap-3 lg:sticky lg:top-28 lg:order-none">
          <section
            id="score"
            key={`score-${flash}`}
            className="rv-card relative scroll-mt-28 overflow-hidden"
            style={flash ? { animation: "rv-flash 1.6s ease-out" } : undefined}
          >
            <div className="relative p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="rv-label">Riven score</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span
                      className="text-[44px] leading-none font-bold tracking-tight"
                      style={{ color: m.color }}
                    >
                      {t.score === null ? "—" : t.score.toFixed(1)}
                    </span>
                    <span className="rv-num text-[14px] text-[var(--rv-ink-3)]">
                      /10
                    </span>
                  </div>
                </div>
                <span
                  className="rounded-md px-2.5 py-1 text-[12px] font-bold tracking-wide uppercase"
                  style={{ color: m.color, background: m.tint }}
                >
                  {m.label}
                </span>
              </div>
              <div className="mt-3">
                <ScoreMeter score={t.score} band={t.band} />
              </div>
              <p className="mt-3 text-[14px] leading-snug font-semibold text-[var(--rv-ink)]">
                {t.verdict}
              </p>
              <p className="mt-1 text-[11px] text-[var(--rv-ink-3)]">
                {t.scoredAt
                  ? `Scored ${age(t.scoredAt, now)} ago`
                  : "Not scored yet"}
                {t.confidence ? ` · ${t.confidence} confidence` : ""}
                {t.holderHistory === "partial" || t.holderHistory === "too_long"
                  ? " · holder history still loading"
                  : ""}
              </p>
              {t.score === null && (
                <UnscoredChecklist
                  measured={t.measured}
                  holderHistory={t.holderHistory}
                  address={t.address}
                />
              )}
              {t.subScores && (
                <div className="mt-4 grid gap-2.5">
                  {ORDER.map((k) => (
                    <SubBar key={k} k={k} {...t.subScores![k]} />
                  ))}
                </div>
              )}
              <Link
                href="/methodology"
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--rv-ice)] hover:underline"
              >
                How the score works
                <ArrowIcon />
              </Link>
            </div>
          </section>

          {tradable && <TradeBox t={t} />}

          <Shield t={t} />

          <Findings flags={[...dangers, ...warnings, ...goods]} />
        </aside>
      </div>
    </div>
  )
}

/** Why a token has no number yet: which of the three required reads are done, and what the holder read is waiting on. */
function UnscoredChecklist({
  measured,
  holderHistory,
  address,
}: {
  measured: { contract: boolean; liquidity: boolean; holders: boolean }
  holderHistory: string | null
  address: string
}) {
  const read = [measured.contract, measured.liquidity, measured.holders].filter(
    Boolean,
  ).length
  const holderNote =
    holderHistory === "too_long"
      ? "This token's history is longer than Riven replays on public RPCs, so it stays unscored rather than guessed."
      : holderHistory === "unavailable"
        ? "The RPC could not serve this token's transfer history. Unscored beats a wrong score."
        : "Replaying every transfer since launch. Busy tokens take longer."
  const rows: Array<[string, boolean, string | null]> = [
    ["Contract powers (mint, pause, upgrade)", measured.contract, null],
    ["Who controls the launch liquidity", measured.liquidity, null],
    [
      "Who holds the supply",
      measured.holders,
      measured.holders ? null : holderNote,
    ],
  ]
  return (
    <Collapsible
      defaultOpen
      className="mt-3 rounded-lg border border-[var(--rv-stroke)] bg-[var(--rv-sunken)]"
    >
      <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--rv-blue)]">
        <span className="min-w-0 flex-1 text-[12px] font-semibold text-[var(--rv-ink)]">
          Riven publishes a number only after all three are read
        </span>
        <span className="rv-num shrink-0 text-[11px] font-normal text-[var(--rv-ink-3)]">
          {read} of 3 read
        </span>
        <svg
          viewBox="0 0 16 16"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 text-[var(--rv-ink-3)] transition-transform duration-200 group-data-[panel-open]/trigger:rotate-180 motion-reduce:transition-none"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </CollapsibleTrigger>
      {/* kept mounted while closed: the live scoring check inside keeps running. No height animation: its content changes height as the status updates. */}
      <CollapsibleContent keepMounted>
        <div className="px-3 pb-3">
          <ul className="grid gap-1.5">
            {rows.map(([label, done, note]) => (
              <li
                key={label}
                className="text-[12px] leading-snug text-[var(--rv-ink-2)]"
              >
                <span aria-hidden className="mr-1.5">
                  {done ? "\u2713" : "\u2026"}
                </span>
                <span className="sr-only">{done ? "Read: " : "Waiting: "}</span>
                {label}
                {note && (
                  <span className="block pl-5 text-[11px] text-[var(--rv-ink-3)]">
                    {note}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <ScoreNow address={address} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const EXIT_SIZES = [100, 1_000, 10_000]

/** "If I sold $X right now?": best-case proceeds from the USDC that is really in the pool. */
function ExitCheck({ poolUsdc }: { poolUsdc: number }) {
  const [size, setSize] = useState(1_000)
  const [custom, setCustom] = useState("")
  const q = exitQuote(poolUsdc, size)
  const safe = maxSellForImpact(poolUsdc, 0.05)
  const tone = !q
    ? "var(--rv-ink-2)"
    : q.exceedsPool || q.impact > 0.25
      ? "var(--rv-risk)"
      : q.impact > 0.05
        ? "var(--rv-caution)"
        : "var(--rv-healthy)"
  return (
    <section className="rv-card p-4" aria-label="Exit check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold text-[var(--rv-ink)]">
          Can you get out?
        </h2>
        <span className="text-[11px] text-[var(--rv-ink-3)]">
          Best case from {usd(poolUsdc)} real USDC in the pool
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {EXIT_SIZES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={size === v && custom === ""}
            onClick={() => {
              setSize(v)
              setCustom("")
            }}
            className="rv-chip"
          >
            Sell {usd(v)}
          </button>
        ))}
        <label className="sr-only" htmlFor="exit-custom">
          Custom sale size in USD
        </label>
        <Input
          id="exit-custom"
          inputMode="decimal"
          placeholder="Custom $"
          value={custom}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "").slice(0, 12)
            setCustom(v)
            const n = Number(v)
            if (Number.isFinite(n) && n > 0) setSize(n)
          }}
          className="h-8 w-24 rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-2 text-[12px] text-[var(--rv-ink)]"
        />
      </div>
      {q && (
        <p className="mt-3 text-[13px] leading-snug text-[var(--rv-ink)]">
          Selling <b>{usd(size)}</b> would return at most{" "}
          <b style={{ color: tone }}>{usd(q.receive, { precise: true })}</b>{" "}
          <span style={{ color: tone }}>
            ({Math.round(q.impact * 100)}% lost to price impact)
          </span>
          {q.exceedsPool &&
            ". That is more than the pool holds: it cannot be sold in full."}
        </p>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--rv-ink-3)]">
        {safe !== null
          ? `Up to about ${usd(safe)} keeps the loss under 5%. `
          : ""}
        Estimate for a constant-product pool; concentrated liquidity moves price
        more, so real exits can be worse. Not financial advice.
      </p>
    </section>
  )
}

function Stat({
  label,
  value,
  color,
  hint,
}: {
  label: string
  value: string
  color?: string
  hint?: string
}) {
  return (
    <div
      className="min-w-[118px] flex-1 border-r border-[var(--rv-stroke)] px-4 py-3 last:border-r-0"
      title={hint}
    >
      <div className="rv-label">{label}</div>
      <div
        className="rv-num mt-1 truncate text-[15px] font-bold"
        style={{ color: color ?? "var(--rv-ink)" }}
      >
        {value}
      </div>
    </div>
  )
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(address).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        })
      }
      className="rv-num flex items-center gap-1 rounded bg-white/[0.05] px-1.5 py-px text-[11px] whitespace-nowrap text-[var(--rv-ink-2)] hover:text-[var(--rv-ink)]"
      title="Copy contract address"
    >
      {shortAddr(address)}
      <span className="text-[var(--rv-ice)]">{copied ? "✓" : "⧉"}</span>
    </button>
  )
}

/** Inline trade box: pick side and size, then review and sign in the trade sheet. */
function TradeBox({ t }: { t: TokenDetail }) {
  const wallet = useArcWallet()
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [amount, setAmount] = useState("10")
  const [open, setOpen] = useState(false)
  const risky = t.fake || t.band === "risk"
  return (
    <section className="rv-card p-4">
      <div className="rv-seg w-full" role="radiogroup" aria-label="Side">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => {
              setSide(s)
              setAmount(s === "buy" ? "10" : "")
            }}
            className="flex-1 capitalize"
            style={
              side === s
                ? {
                    background: s === "buy" ? "var(--rv-up)" : "var(--rv-down)",
                    color: "#0a0a0c",
                  }
                : undefined
            }
          >
            {s}
          </button>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="rv-label">
          {side === "buy" ? "You pay (USDC)" : `You sell (${t.symbol})`}
        </span>
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0"
          className={`${RV_INPUT} rv-num mt-1 h-11 w-full px-3 text-right text-[20px] font-bold`}
        />
      </label>
      {side === "buy" && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {["5", "10", "25", "100"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(v)}
              aria-pressed={amount === v}
              className="rv-chip justify-center"
            >
              {v}
            </button>
          ))}
        </div>
      )}
      {risky && (
        <p className="mt-3 text-[12px] leading-snug text-[var(--rv-caution)]">
          Riven {t.fake ? "flagged" : "rates"} this token
          {t.fake ? "" : " risky"} — you&apos;ll see why before anything is
          signed.
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!amount || Number(amount) <= 0}
        className="mt-3 h-11 w-full rounded-md text-[14px] font-bold transition-[filter] hover:brightness-110 disabled:opacity-40"
        style={{
          background: side === "buy" ? "var(--rv-up)" : "var(--rv-down)",
          color: "#0a0a0c",
        }}
      >
        {wallet.address ? `Review ${side}` : "Connect wallet to trade"}
      </button>
      <p className="mt-2 text-center text-[10.5px] text-[var(--rv-ink-3)]">
        Uniswap v4 on Arc · you sign every transaction · Riven never holds funds
      </p>
      {open && (
        <TradeSheet
          token={t}
          wallet={wallet}
          initialSide={side}
          initialAmount={amount}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  )
}

/** Anti-rug shield: the four ways people lose money on a launch, checked at a glance. */
function Shield({ t }: { t: TokenDetail }) {
  const codes = new Set(t.flags.map((f) => f.code))
  const known = t.flags.length > 0
  const rows: Array<{
    label: string
    state: "ok" | "bad" | "warn" | "unknown"
    note: string
  }> = [
    {
      label: "Can't print new tokens",
      state: !known ? "unknown" : codes.has("MINT") ? "bad" : "ok",
      note: codes.has("MINT") ? "Mint function is live" : "No mint function",
    },
    {
      label: "Liquidity can't be pulled",
      state: !known
        ? "unknown"
        : codes.has("LP_REMOVED")
          ? "bad"
          : codes.has("LP_UNLOCKED")
            ? "bad"
            : "ok",
      note: codes.has("LP_REMOVED")
        ? "Already pulled"
        : codes.has("LP_UNLOCKED")
          ? "Held by a wallet"
          : "Locked or burned",
    },
    {
      label: "You can sell",
      state: !known
        ? "unknown"
        : codes.has("RESTRICT")
          ? "bad"
          : codes.has("NO_SELLS")
            ? "warn"
            : "ok",
      note: codes.has("RESTRICT")
        ? "Trading can be paused"
        : codes.has("NO_SELLS")
          ? "No sells seen yet"
          : "Sells are going through",
    },
    {
      label: "Team isn't dumping",
      state: !known
        ? "unknown"
        : codes.has("CREATOR_DUMP") || codes.has("INSIDERS")
          ? "bad"
          : codes.has("CREATOR_HEAVY")
            ? "warn"
            : "ok",
      note: codes.has("CREATOR_DUMP")
        ? "Creator sold their bag"
        : codes.has("INSIDERS")
          ? "Creator-funded wallets hold a lot"
          : codes.has("CREATOR_HEAVY")
            ? "Creator holds a lot"
            : "No dump seen",
    },
  ]
  const color = {
    ok: "var(--rv-healthy)",
    bad: "var(--rv-risk)",
    warn: "var(--rv-caution)",
    unknown: "var(--rv-unscored)",
  }
  return (
    <section className="rv-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[16px] font-bold text-[var(--rv-ink)]">
          Anti-rug shield
        </h2>
        {t.alerts.length > 0 && (
          <span className="rv-num text-[11px] font-semibold text-[var(--rv-risk)]">
            {t.alerts.length} alert{t.alerts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <ul className="mt-2.5 grid gap-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-[13px]">
            <span
              className="rv-num w-5 text-center font-bold"
              style={{ color: color[r.state] }}
            >
              {r.state === "ok" ? "✓" : r.state === "unknown" ? "?" : "✕"}
            </span>
            <span className="flex-1 text-[var(--rv-ink)]">{r.label}</span>
            <span className="text-[12px]" style={{ color: color[r.state] }}>
              {r.note}
            </span>
          </li>
        ))}
      </ul>
      {t.alerts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--rv-stroke)] pt-3">
          {t.alerts.slice(0, 5).map((a) => (
            <li key={a.id} className="flex items-baseline gap-2 text-[12px]">
              <span className="rounded bg-[rgba(248,113,113,0.12)] px-1.5 text-[10px] font-bold text-[var(--rv-risk)] uppercase">
                {ALERT_LABEL[a.type] ?? a.type}
              </span>
              <span className="flex-1 text-[var(--rv-ink-2)]">{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function CreatorTrack({
  record,
  now,
  title = "Creator's other launches",
  link = true,
}: {
  record: CreatorRecord
  now: number
  title?: string
  link?: boolean
}) {
  const statusColor = {
    alive: "var(--rv-healthy)",
    dead: "var(--rv-ink-3)",
    rugged: "var(--rv-risk)",
  }
  return (
    <section className="rv-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-bold text-[var(--rv-ink)]">{title}</h2>
        {link && (
          <Link
            href={`/creator/${record.wallet}`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--rv-ice)] hover:underline"
          >
            Full record
            <ArrowIcon className="size-3" />
          </Link>
        )}
        <a
          href={`${EXPLORER}/address/${record.wallet}`}
          target="_blank"
          rel="noreferrer"
          className="rv-num text-[11px] text-[var(--rv-ink-3)] hover:text-[var(--rv-ice)]"
        >
          {shortAddr(record.wallet)}
        </a>
      </div>
      <dl className="rv-num mt-2.5 grid grid-cols-4 gap-2 text-[11px]">
        <Mini label="Launches" value={String(record.launches)} />
        <Mini
          label="Alive"
          value={String(record.alive)}
          color="var(--rv-healthy)"
        />
        <Mini
          label="Dead / rugged"
          value={`${record.dead} / ${record.rugged}`}
          color="var(--rv-risk)"
        />
        <Mini
          label="Best ATH"
          value={times(record.bestAthX)}
          color="var(--rv-ice)"
        />
      </dl>
      {record.tokens.length === 0 ? (
        <p className="mt-3 text-[12px] text-[var(--rv-ink-2)]">
          This is the only token Riven has seen from this creator.
        </p>
      ) : (
        <table className="rv-table mt-3 w-full text-[12px]">
          <thead>
            <tr className="text-left">
              <th className="py-1.5">Token</th>
              <th className="py-1.5 text-right">ATH</th>
              <th className="py-1.5 text-right">Now</th>
              <th className="py-1.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {record.tokens.slice(0, 12).map((x) => (
              <tr
                key={x.address}
                className="border-t border-[var(--rv-stroke)]"
              >
                <td className="py-1.5">
                  <Link
                    href={`/token/${x.address}`}
                    className="flex items-center gap-2"
                  >
                    <TokenAvatar
                      image={x.image}
                      symbol={x.symbol}
                      address={x.address}
                      size={22}
                    />
                    <span className="max-w-[110px] truncate font-semibold text-[var(--rv-ink)]">
                      {x.symbol}
                    </span>
                    <span className="rv-num text-[10px] text-[var(--rv-ink-3)]">
                      {age(x.launchedAt, now)}
                    </span>
                  </Link>
                </td>
                <td className="rv-num py-1.5 text-right text-[var(--rv-ink)]">
                  {times(x.athX)}
                </td>
                <td
                  className="rv-num py-1.5 text-right"
                  style={{
                    color:
                      (x.nowX ?? 1) >= 1 ? "var(--rv-up)" : "var(--rv-down)",
                  }}
                >
                  {times(x.nowX)}
                </td>
                <td
                  className="py-1.5 text-right text-[11px] font-semibold uppercase"
                  style={{ color: statusColor[x.status] }}
                >
                  {x.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[10px] text-[var(--rv-ink-3)]">
        ATH and Now are multiples of the first trade price, from swaps Riven
        indexed.
      </p>
    </section>
  )
}

function Mini({
  label,
  value,
  color = "var(--rv-ink)",
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
      <dt className="text-[var(--rv-ink-3)]">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-semibold" style={{ color }}>
        {value}
      </dd>
    </div>
  )
}

function SubBar({
  k,
  points,
  max,
}: {
  k: SubScoreKey
  points: number
  max: number
}) {
  const ratio = max > 0 ? points / max : 0
  const color =
    ratio >= 0.7
      ? "var(--rv-healthy)"
      : ratio >= 0.4
        ? "var(--rv-caution)"
        : "var(--rv-risk)"
  return (
    <div title={SUB_HINT[k]}>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-semibold text-[var(--rv-ink)]">
          {SUB_SCORE_LABEL[k]}
        </span>
        <span className="rv-num text-[var(--rv-ink-2)]">
          {((points / max) * 10).toFixed(1)}
          <span className="text-[var(--rv-ink-3)]">/10</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-white/[0.06]">
        <div
          className="h-full rounded-sm"
          style={{ width: `${Math.max(2, ratio * 100)}%`, background: color }}
        />
      </div>
    </div>
  )
}

function PriceChart({ series }: { series: Array<{ t: number; p: number }> }) {
  const W = 640
  const H = 220
  const ps = series.map((s) => s.p)
  const lo = Math.min(...ps)
  const hi = Math.max(...ps)
  const t0 = series[0]!.t
  const t1 = series[series.length - 1]!.t || t0 + 1
  const d = series
    .map((s, i) => {
      const x = ((s.t - t0) / Math.max(1, t1 - t0)) * W
      const y = H - 10 - ((s.p - lo) / Math.max(hi - lo, hi * 1e-9)) * (H - 20)
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  const up = series[series.length - 1]!.p >= series[0]!.p
  const color = up ? "var(--rv-up)" : "var(--rv-down)"
  return (
    <section className="rv-card p-4">
      <h2 className="text-[16px] font-bold text-[var(--rv-ink)]">
        Price (indexed swaps)
      </h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-[220px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Price chart"
      >
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </section>
  )
}

/** Top-10 share of supply, the dev wallet, and a way into the Bubblemaps holder map. */
function Holders({
  t,
  onBubbleMaps,
}: {
  t: TokenDetail
  onBubbleMaps: () => void
}) {
  // topHolders is exactly the ten largest wallets with pool, burn and launchpad contracts left out,
  // so their percentages add up to the top-10 share (the same figure the score uses).
  const top10 =
    t.topHolders.length > 0
      ? Math.min(
          100,
          t.topHolders.reduce((sum, h) => sum + h.pct, 0),
        )
      : null
  return (
    <section className="rv-card p-4">
      <h2 className="text-[16px] font-bold text-[var(--rv-ink)]">Holders</h2>
      {top10 === null ? (
        <p className="text-[13px] text-[var(--rv-ink-2)]">
          {t.holderHistory === "partial" || t.holderHistory === "too_long"
            ? "Riven is still loading this token's holder history."
            : "Almost no wallets hold this token — nearly all of the supply is back in the pool."}
        </p>
      ) : (
        <div>
          <p className="rv-label">Top 10 holders</p>
          <p className="rv-num mt-1 text-[34px] leading-none font-bold text-[var(--rv-ink)]">
            {pct(top10)}
            <span className="ml-2 text-[13px] font-medium text-[var(--rv-ink-3)]">
              of supply
            </span>
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-[var(--rv-blue)]"
              style={{ width: `${top10}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--rv-ink-3)]">
            Pool, burn and launchpad contracts excluded.
          </p>
        </div>
      )}

      <DevWallet creator={t.creator} launchpad={t.launchpad} />

      <button
        type="button"
        onClick={onBubbleMaps}
        className="rv-btn mt-4 h-11 w-full gap-2 px-4 text-[13px] sm:h-10 sm:w-auto"
      >
        View bubble map
        <ArrowIcon />
      </button>
    </section>
  )
}

/** The wallet that created the token, in full, with copy and explorer links. */
function DevWallet({
  creator,
  launchpad,
}: {
  creator: string
  launchpad: string
}) {
  const [copied, setCopied] = useState(false)
  const known = /^0x[0-9a-f]{40}$/.test(creator)
  // Tokens found through the pool indexer have no factory event; the wallet that created the pool stands in.
  const factoryLaunch = launchpad === "Argus" || launchpad === "Tolly"
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(creator)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard blocked: the address is still selectable on screen
    }
  }
  return (
    <div className="mt-4 border-t border-[var(--rv-stroke)] pt-4">
      <p className="rv-label">Dev wallet</p>
      {known ? (
        <>
          <p className="rv-num mt-1 text-[12px] leading-snug text-[var(--rv-ink)] sm:text-[13px]">
            {creator.slice(0, 21)}
            <wbr />
            {creator.slice(21)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rv-btn-ghost h-9 px-3 text-[12px]"
            >
              {copied ? "Copied" : "Copy address"}
            </button>
            <a
              href={`${EXPLORER}/address/${creator}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1 px-1 text-[12px] font-semibold text-[var(--rv-ice)] hover:underline"
            >
              View on explorer
              <ArrowIcon className="size-3" />
            </a>
          </div>
          {!factoryLaunch && (
            <p className="mt-1.5 text-[11px] text-[var(--rv-ink-3)]">
              This token wasn&apos;t launched through a factory Riven reads, so
              this is the wallet that created its trading pool.
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-[13px] text-[var(--rv-ink-2)]">
          Riven hasn&apos;t found who created this token yet.
        </p>
      )}
    </div>
  )
}

/**
 * Bubblemaps' holder map, loaded only once this tab is opened. It supports Arc (chain "arc").
 * Embedding from a production domain needs the domain registered with a Bubblemaps partner ID
 * (NEXT_PUBLIC_BUBBLEMAPS_PARTNER_ID); without one the demo ID works on localhost, so the link
 * out below is always offered.
 */
function BubbleMap({ address, symbol }: { address: string; symbol: string }) {
  // Bubblemaps builds a token's map on first sight: 5–15 seconds for a token it hasn't seen (instant after).
  // The frame is cross-origin, so we can't tell when it has painted; the note simply expires.
  const [building, setBuilding] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setBuilding(false), 15_000)
    return () => clearTimeout(id)
  }, [])
  const partner = process.env.NEXT_PUBLIC_BUBBLEMAPS_PARTNER_ID || "demo"
  const src = `https://iframe.bubblemaps.io/map?address=${address}&chain=arc&partnerId=${encodeURIComponent(partner)}`
  return (
    <section className="rv-card p-4">
      <h2 className="text-[16px] font-bold text-[var(--rv-ink)]">Bubble map</h2>
      <p className="text-[12px] text-[var(--rv-ink-3)]">
        Each bubble is a wallet; links show wallets that moved tokens between
        each other.
      </p>
      <div className="relative mt-3 h-[460px] overflow-hidden rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-black sm:h-[580px]">
        {building && (
          <p className="pointer-events-none absolute top-2 left-2 z-10 rounded-full bg-black/75 px-3 py-1 text-[11.5px] text-[var(--rv-ink-2)]">
            Building the map… a new token can take up to ~15 seconds the first
            time.
          </p>
        )}
        <iframe
          src={src}
          title={`Bubblemaps holder map for ${symbol}`}
          className="h-full w-full"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--rv-ink-3)]">
        Powered by Bubblemaps. If the map stays blank,{" "}
        <a
          href={`https://app.bubblemaps.io/arc/token/${address}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-[var(--rv-ice)] hover:underline"
        >
          open it on Bubblemaps
        </a>
        .
      </p>
    </section>
  )
}

function Trades({ t, now }: { t: TokenDetail; now: number }) {
  if (t.trades.length === 0) return null
  return (
    <section className="rv-card p-4">
      <h2 className="text-[16px] font-bold text-[var(--rv-ink)]">
        Latest trades
      </h2>
      <ul className="mt-2">
        {t.trades.map((w) => (
          <li
            key={w.id}
            className="rv-num flex items-center gap-3 border-b border-[var(--rv-stroke)] py-1.5 text-[12px] last:border-0"
          >
            <span
              className="w-9 font-bold uppercase"
              style={{
                color: w.side === "buy" ? "var(--rv-up)" : "var(--rv-down)",
              }}
            >
              {w.side}
            </span>
            <span className="text-[var(--rv-ink)]">{usd(w.usdc)}</span>
            <span className="text-[var(--rv-ink-3)]">
              {compact(w.tokens)} tokens
            </span>
            <span className="ml-auto text-[var(--rv-ink-3)]">
              {age(w.ts, now)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Creator-supplied links: plain http(s) only — no javascript:, data: or app schemes. */
function safeLink(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}

function Row({
  label,
  value,
  href,
  unverified = false,
}: {
  label: string
  value: string
  href: string
  unverified?: boolean
}) {
  const [copied, setCopied] = useState(false)
  // Show creator links by host only, so a look-alike path can't pass as a real site.
  const shown = value.startsWith("0x")
    ? shortAddr(value)
    : unverified
      ? new URL(value).host
      : value
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[var(--rv-ink-3)] capitalize">
        {label}
      </span>
      <a
        href={href}
        target="_blank"
        rel={
          unverified
            ? "noopener noreferrer nofollow ugc"
            : "noopener noreferrer"
        }
        className="rv-num min-w-0 flex-1 truncate text-[var(--rv-ink-2)] hover:text-[var(--rv-ice)]"
      >
        {shown}
        {unverified && (
          <span className="ml-1.5 text-[10px] text-[var(--rv-ink-3)]">
            (creator link)
          </span>
        )}
      </a>
      {value.startsWith("0x") && (
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(value).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            })
          }
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-[var(--rv-ice)] ring-1 ring-[var(--rv-stroke-strong)] hover:bg-white/5"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  )
}

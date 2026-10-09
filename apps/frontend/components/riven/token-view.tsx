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
import { CalloutsRow } from "./home-sections"
import type { Holo, Mood } from "@/components/mascot/mascot"
import { useRiven, useRivenPage } from "@/components/mascot/riven-context"
import { TokenAvatar } from "./token-avatar"
import { WatchButton } from "./watch-button"
import { CopyBadge, CopycatWarning } from "./copycat"
import { TradeSheet } from "./trade-sheet"
import { useArcWallet } from "@/hooks/use-arc-wallet"
import { TRADING_ENABLED } from "@/lib/flags"

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
  const [tab, setTab] = useState<"trades" | "holders" | "creator" | "callouts">(
    "trades",
  )

  const mood: Mood =
    t.fake || t.band === "risk"
      ? "danger"
      : t.band === "caution"
        ? "warn"
        : t.band === "healthy"
          ? "happy"
          : "idle"
  const tone: Holo["tone"] =
    t.band === "healthy" ? "green" : t.band === "caution" ? "amber" : t.band === "risk" ? "red" : "blue"
  const holos: Holo[] = [
    {
      title: `${t.symbol} · Riven score`,
      value: t.score === null ? "scoring…" : `${t.score.toFixed(1)}/10`,
      note: t.fake ? t.fakeReasons[0] : t.verdict,
      gauge: t.score === null ? undefined : t.score / 10,
      series: t.priceSeries.length > 2 ? t.priceSeries.map((s) => s.p) : undefined,
      tone,
    },
    { title: "24h", value: t.change.h24 === null ? "—" : change(t.change.h24), tone: (t.change.h24 ?? 0) >= 0 ? "green" : "red" },
    {
      title: "Real USDC",
      value: t.usdcInPool === null ? "—" : usd(t.usdcInPool),
      tone: t.usdcInPool !== null && t.usdcInPool < 1000 ? "amber" : "blue",
    },
    { title: "Holders", value: t.holders === null ? "—" : compact(t.holders), tone: "blue" },
  ]
  // Nothing to read: no score, no price, no pool → he shrugs instead of scanning.
  const hasData = t.score !== null || t.priceUsd !== null || t.liquidityUsd !== null
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
        document.getElementById("score")?.scrollIntoView({ behavior: "smooth", block: "start" })
      },
    },
  })
  // Keep the page live: numbers refresh every 30s, and once more after a scan settles.
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 30_000)
    return () => window.clearInterval(id)
  }, [router])
  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => router.refresh(), 45_000)
    return () => window.clearTimeout(id)
  }, [flash, router])

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link
          href="/trending"
          className="text-[12px] font-semibold text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
          aria-label="Back to trending"
        >
          ←
        </Link>
        <TokenAvatar
          image={t.image}
          symbol={t.symbol}
          address={t.address}
          size={52}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="text-[24px] font-bold tracking-tight text-[var(--rv-ink)]">
              {t.symbol}
            </h1>
            <span className="truncate text-[14px] text-[var(--rv-ink-3)]">
              {t.name}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--rv-ink-3)]">
            <span className="rounded bg-white/[0.05] px-1.5 py-px font-semibold text-[var(--rv-ink-2)]">
              {t.launchpad}
            </span>
            <span className="rv-num">{age(t.launchedAt, now)} old</span>
            {t.fake && (
              <span className="rounded bg-[rgba(248,113,113,0.12)] px-1.5 py-px text-[10px] font-bold tracking-wide text-[var(--rv-risk)] uppercase">
                Flagged
              </span>
            )}
            <CopyBadge copies={t.copies} />
            <CopyAddress address={t.address} />
            <a
              href={`${EXPLORER}/address/${t.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--rv-ice)]"
            >
              Explorer ↗
            </a>
            {t.dexUrl && (
              <a
                href={t.dexUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--rv-ice)]"
              >
                DexScreener ↗
              </a>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="rv-num text-[24px] font-bold tracking-tight text-[var(--rv-ink)]">
            {usd(t.priceUsd, { precise: true })}
          </div>
          <div
            className="rv-num text-[13px] font-semibold"
            style={{ color: changeColor(t.change.h24) }}
          >
            {change(t.change.h24)}{" "}
            <span className="text-[var(--rv-ink-3)]">24h</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            riven.scan()
            if (!hasData) riven.speak("Nothing to read on this pair yet — no trades or pool data.", 4500)
          }}
          className="rv-btn h-9 gap-1.5 px-3 text-[13px]"
          title="Riven scans this token and refreshes its score"
        >
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.2-4.2" />
          </svg>
          Scan
        </button>
        <WatchButton address={t.address} size="lg" />
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
          <section className="rv-card overflow-hidden">
            <div
              className="flex items-center gap-1 border-b border-[var(--rv-stroke)] px-2 pt-2"
              role="tablist"
            >
              {(
                [
                  [
                    "trades",
                    `Trades${t.trades.length ? ` ${t.trades.length}` : ""}`,
                  ],
                  ["holders", "Holders"],
                  ["creator", "Creator"],
                  [
                    "callouts",
                    `Callouts${callouts.length ? ` ${callouts.length}` : ""}`,
                  ],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className="relative px-3 pt-1.5 pb-2.5 text-[13px] font-semibold transition-colors"
                  style={{
                    color: tab === id ? "var(--rv-ink)" : "var(--rv-ink-3)",
                  }}
                >
                  {label}
                  {tab === id && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--rv-blue)]" />
                  )}
                </button>
              ))}
            </div>
            <div className="[&>section]:rounded-md [&>section]:border-0 [&>section]:bg-transparent [&>section>h2]:hidden">
              {tab === "trades" &&
                (t.trades.length ? (
                  <Trades t={t} now={now} />
                ) : (
                  <p className="p-4 text-[13px] text-[var(--rv-ink-2)]">
                    No indexed trades yet.
                  </p>
                ))}
              {tab === "holders" && <Holders t={t} />}
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
            </div>
          </section>

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
              {t.subScores && (
                <div className="mt-4 grid gap-2.5">
                  {ORDER.map((k) => (
                    <SubBar key={k} k={k} {...t.subScores![k]} />
                  ))}
                </div>
              )}
              <Link
                href="/methodology"
                className="mt-3 inline-block text-[12px] font-semibold text-[var(--rv-ice)] hover:underline"
              >
                How the score works →
              </Link>
            </div>
          </section>

          {tradable && <TradeBox t={t} />}

          <Shield t={t} />

          <section className="rv-card p-4">
            <h2 className="text-[15px] font-bold text-[var(--rv-ink)]">
              What Riven found
            </h2>
            {t.flags.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--rv-ink-2)]">
                Still reading this token&apos;s on-chain data.
              </p>
            ) : (
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {[...dangers, ...warnings, ...goods].map((f, i) => (
                  <li
                    key={`${f.text}-${i}`}
                    className="flex items-start gap-2.5 text-[13px] leading-snug text-[var(--rv-ink)]"
                  >
                    <span
                      aria-hidden
                      className="mt-1 size-2 shrink-0 rounded-sm"
                      style={{
                        background:
                          f.level === "danger"
                            ? "var(--rv-risk)"
                            : f.level === "warning"
                              ? "var(--rv-caution)"
                              : "var(--rv-healthy)",
                      }}
                    />
                    <span className="flex-1">{f.text}</span>
                    <span className="text-[10px] tracking-wide text-[var(--rv-ink-3)] uppercase">
                      {SUB_SCORE_LABEL[f.category]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
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
      className="rv-num flex items-center gap-1 rounded bg-white/[0.05] px-1.5 py-px text-[11px] text-[var(--rv-ink-2)] hover:text-[var(--rv-ink)]"
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
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0"
          className="rv-input rv-num mt-1 h-11 w-full px-3 text-right text-[20px] font-bold"
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
          <li
            key={r.label}
            className="flex items-center gap-2.5 text-[13px]"
          >
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
            <li
              key={a.id}
              className="flex items-baseline gap-2 text-[12px]"
            >
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

function CreatorTrack({ record, now }: { record: CreatorRecord; now: number }) {
  const statusColor = {
    alive: "var(--rv-healthy)",
    dead: "var(--rv-ink-3)",
    rugged: "var(--rv-risk)",
  }
  return (
    <section className="rv-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-bold text-[var(--rv-ink)]">
          Creator&apos;s other launches
        </h2>
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

function Holders({ t }: { t: TokenDetail }) {
  return (
    <section className="rv-card p-4">
      <h2 className="text-[16px] font-bold text-[var(--rv-ink)]">
        Top holders
      </h2>
      <p className="text-[11px] text-[var(--rv-ink-3)]">
        Pool, burn and launchpad contracts excluded.
      </p>
      {t.topHolders.length === 0 ? (
        <p className="mt-2 text-[13px] text-[var(--rv-ink-2)]">
          {t.holderHistory === "partial" || t.holderHistory === "too_long"
            ? "Riven is still loading this token's holder history."
            : "Almost no wallets hold this token — nearly all of the supply is back in the pool."}
        </p>
      ) : (
        <ol className="mt-2.5 flex flex-col gap-1.5">
          {t.topHolders.map((h, i) => (
            <li
              key={h.address}
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="rv-num w-4 text-[var(--rv-ink-3)]">{i + 1}</span>
              <a
                href={`${EXPLORER}/address/${h.address}`}
                target="_blank"
                rel="noreferrer"
                className="rv-num text-[var(--rv-ink-2)] hover:text-[var(--rv-ice)]"
              >
                {shortAddr(h.address)}
              </a>
              {h.tag && (
                <span className="rounded bg-[rgba(251,191,36,0.12)] px-1.5 text-[10px] font-semibold text-[var(--rv-caution)] uppercase">
                  {h.tag}
                </span>
              )}
              <span className="mx-2 h-1 flex-1 overflow-hidden rounded-sm bg-white/[0.05]">
                <span
                  className="block h-full bg-[var(--rv-blue)]"
                  style={{ width: `${Math.min(100, Math.max(1, h.pct))}%` }}
                />
              </span>
              <span className="rv-num w-12 text-right text-[var(--rv-ink)]">
                {pct(h.pct)}
              </span>
            </li>
          ))}
        </ol>
      )}
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

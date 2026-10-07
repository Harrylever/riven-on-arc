"use client"

import Link from "next/link"
import { useState } from "react"
import { SUB_SCORE_LABEL, type SubScoreKey } from "@clawdex/shared/score"
import type { CreatorRecord, TokenDetail } from "@/lib/arc-data"
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
import { ScoreBadge, ScoreMeter } from "./score-badge"
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
  serverNow,
}: {
  t: TokenDetail
  serverNow: number
}) {
  const m = BAND_META[t.band]
  const now = serverNow
  const wallet = useArcWallet()
  const [trade, setTrade] = useState<"buy" | "sell" | null>(null)
  const tradable =
    TRADING_ENABLED && (!!t.pairAddress || t.launchpad !== "Tolly")
  const dangers = t.flags.filter((f) => f.level === "danger")
  const warnings = t.flags.filter((f) => f.level === "warning")
  const goods = t.flags.filter((f) => f.level === "good")

  return (
    <div className="flex flex-col gap-3.5">
      <Link
        href="/trending"
        className="rv-body w-fit text-[13px] font-semibold text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
      >
        ← Trending
      </Link>

      {/* Identity + price */}
      <section className="flex flex-wrap items-center gap-3.5">
        <TokenAvatar
          image={t.image}
          symbol={t.symbol}
          address={t.address}
          size={56}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="rv-display truncate text-[26px] leading-tight font-extrabold text-[var(--rv-ink)] sm:text-[30px]">
              {t.symbol}
            </h1>
            {t.fake && (
              <span
                className="rv-body rounded-md bg-[rgba(248,113,113,0.12)] px-2 py-0.5 text-[11px] font-bold text-[var(--rv-risk)] uppercase"
                title="Flagged by on-chain evidence — hidden from the default list"
              >
                Flagged
              </span>
            )}
            <CopyBadge copies={t.copies} />
          </div>
          <p className="rv-body truncate text-[13px] text-[var(--rv-ink-2)]">
            {t.name} · {t.launchpad} · {age(t.launchedAt, now)} old
          </p>
        </div>
        <div className="text-right">
          <div className="rv-num text-[22px] font-semibold text-[var(--rv-ink)]">
            {usd(t.priceUsd, { precise: true })}
          </div>
          <div
            className="rv-num text-[13px]"
            style={{ color: changeColor(t.change.h24) }}
          >
            {change(t.change.h24)} 24h
          </div>
        </div>
        <WatchButton address={t.address} size="lg" />
      </section>

      {/* The score comes first on phones (on desktop it heads the right column). */}
      <a
        href="#score"
        className="rv-card flex items-center gap-4 p-4 lg:hidden"
      >
        <div className="flex items-baseline gap-1">
          <span
            className="rv-display text-[40px] leading-none font-extrabold"
            style={{ color: m.color }}
          >
            {t.score === null ? "—" : t.score.toFixed(1)}
          </span>
          <span className="rv-num text-[13px] text-[var(--rv-ink-3)]">/10</span>
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="rv-body text-[12px] font-bold tracking-wide uppercase"
            style={{ color: m.color }}
          >
            {m.label}
          </p>
          <p className="rv-body line-clamp-2 text-[13px] leading-snug text-[var(--rv-ink)]">
            {t.fake ? t.fakeReasons[0] : t.verdict}
          </p>
          <p className="rv-body mt-0.5 text-[11px] font-semibold text-[var(--rv-ice)]">
            See the evidence ↓
          </p>
        </div>
      </a>

      <CopycatWarning token={t} copies={t.copyList} now={now} />

      {tradable && (
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          {(t.fake || t.band === "risk") && (
            <p className="rv-body text-[12px] leading-snug text-[var(--rv-caution)]">
              Riven {t.fake ? "flagged" : "rates"} this token{" "}
              {t.fake ? "" : "risky "}— read why before you trade.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTrade("buy")}
              className={`rv-body h-11 rounded-lg text-[15px] font-bold ${
                t.fake || t.band === "risk"
                  ? "text-[var(--rv-up)] ring-1 ring-[rgba(74,222,128,0.45)]"
                  : "bg-[var(--rv-up)] text-black"
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setTrade("sell")}
              className="rv-body h-11 rounded-lg bg-[var(--rv-down)] text-[15px] font-bold text-black"
            >
              Sell
            </button>
          </div>
        </div>
      )}
      {trade && (
        <TradeSheet
          token={t}
          wallet={wallet}
          initialSide={trade}
          onClose={() => setTrade(null)}
        />
      )}

      <div className="grid gap-3.5 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-3.5">
          {/* Chart */}
          {t.pairAddress ? (
            <section className="rv-card overflow-hidden">
              <iframe
                title={`${t.symbol} chart`}
                src={`https://dexscreener.com/arc/${t.pairAddress}?embed=1&loadChartSettings=0&trades=0&info=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=5`}
                className="h-[380px] w-full border-0 bg-black"
                loading="lazy"
              />
            </section>
          ) : t.priceSeries.length > 2 ? (
            <PriceChart series={t.priceSeries} />
          ) : null}

          {/* Market strip */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Market cap" value={usd(t.marketCap)} />
            <Metric
              label="Liquidity · DexScreener"
              value={usd(t.liquidityUsd)}
            />
            <Metric
              label="USDC in pool"
              value={usd(t.usdcInPool)}
              tone={
                t.usdcInPool !== null && t.usdcInPool < 1000
                  ? "warn"
                  : undefined
              }
            />
            <Metric label="Volume 24h" value={usd(t.volume.h24)} />
            <Metric
              label="Buys / sells 24h"
              value={
                t.buys24h === null
                  ? "—"
                  : `${compact(t.buys24h)} / ${compact(t.sells24h)}`
              }
            />
            <Metric label="Holders" value={compact(t.holders)} />
            <Metric
              label="Trading fee"
              value={t.feePct === null ? "—" : pct(t.feePct)}
            />
            <Metric
              label="1h / 6h"
              value={`${change(t.change.h1)} / ${change(t.change.h6)}`}
            />
            {t.liquidityUsd !== null &&
              t.usdcInPool !== null &&
              t.usdcInPool < t.liquidityUsd * 0.1 && (
                <p className="rv-body col-span-2 text-[12px] leading-snug text-[var(--rv-caution)] sm:col-span-4">
                  Most of that &ldquo;liquidity&rdquo; is this token valued at
                  its own price. Only {usd(t.usdcInPool)} of real USDC is in the
                  pool — that&apos;s all sellers can exit into.
                </p>
              )}
          </section>

          <Holders t={t} />
          <Trades t={t} now={now} />
        </div>

        <div className="flex flex-col gap-3.5">
          {/* Score */}
          <section id="score" className="rv-card scroll-mt-20 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="rv-body text-[11px] font-semibold tracking-[0.14em] text-[var(--rv-ink-3)] uppercase">
                  Riven score
                </p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span
                    className="rv-display text-[52px] leading-none font-extrabold"
                    style={{ color: m.color }}
                  >
                    {t.score === null ? "—" : t.score.toFixed(1)}
                  </span>
                  <span className="rv-num text-[16px] text-[var(--rv-ink-3)]">
                    /10
                  </span>
                </div>
              </div>
              <ScoreBadge score={t.score} band={t.band} />
            </div>
            <div className="mt-3">
              <ScoreMeter score={t.score} band={t.band} />
            </div>
            <p className="rv-body mt-3 text-[15px] leading-snug font-semibold text-[var(--rv-ink)]">
              {t.verdict}
            </p>
            <p className="rv-body mt-1 text-[11px] text-[var(--rv-ink-3)]">
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
          </section>

          <Shield t={t} />

          {/* Flags */}
          <section className="rv-card p-4">
            <h2 className="rv-display text-[16px] font-bold text-[var(--rv-ink)]">
              What Riven found
            </h2>
            {t.flags.length === 0 ? (
              <p className="rv-body mt-2 text-sm text-[var(--rv-ink-2)]">
                Still reading this token&apos;s on-chain data.
              </p>
            ) : (
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {[...dangers, ...warnings, ...goods].map((f, i) => (
                  <li
                    key={`${f.text}-${i}`}
                    className="rv-body flex items-start gap-2.5 text-[13px] leading-snug text-[var(--rv-ink)]"
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

          {t.creatorRecord && (
            <CreatorTrack record={t.creatorRecord} now={now} />
          )}

          <section className="rv-card rv-body flex flex-col gap-2 p-4 text-[12px]">
            <h2 className="rv-display text-[16px] font-bold text-[var(--rv-ink)]">
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
      </div>
    </div>
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
        <h2 className="rv-display text-[16px] font-bold text-[var(--rv-ink)]">
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
            className="rv-body flex items-center gap-2.5 text-[13px]"
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
              className="rv-body flex items-baseline gap-2 text-[12px]"
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
        <h2 className="rv-display text-[16px] font-bold text-[var(--rv-ink)]">
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
        <p className="rv-body mt-3 text-[12px] text-[var(--rv-ink-2)]">
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
                    <span className="rv-body max-w-[110px] truncate font-semibold text-[var(--rv-ink)]">
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
                  className="rv-body py-1.5 text-right text-[11px] font-semibold uppercase"
                  style={{ color: statusColor[x.status] }}
                >
                  {x.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="rv-body mt-2 text-[10px] text-[var(--rv-ink-3)]">
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
      <div className="rv-body flex items-baseline justify-between text-[12px]">
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

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "warn" | "bad"
}) {
  return (
    <div className="rv-card px-3 py-2.5">
      <div className="rv-body text-[10px] font-semibold tracking-wide text-[var(--rv-ink-3)] uppercase">
        {label}
      </div>
      <div
        className="rv-num mt-0.5 truncate text-[15px] font-semibold"
        style={{
          color:
            tone === "bad"
              ? "var(--rv-risk)"
              : tone === "warn"
                ? "var(--rv-caution)"
                : "var(--rv-ink)",
        }}
      >
        {value}
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
      <h2 className="rv-display text-[16px] font-bold text-[var(--rv-ink)]">
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
      <h2 className="rv-display text-[16px] font-bold text-[var(--rv-ink)]">
        Top holders
      </h2>
      <p className="rv-body text-[11px] text-[var(--rv-ink-3)]">
        Pool, burn and launchpad contracts excluded.
      </p>
      {t.topHolders.length === 0 ? (
        <p className="rv-body mt-2 text-[13px] text-[var(--rv-ink-2)]">
          {t.holderHistory === "partial" || t.holderHistory === "too_long"
            ? "Riven is still loading this token's holder history."
            : "Almost no wallets hold this token — nearly all of the supply is back in the pool."}
        </p>
      ) : (
        <ol className="mt-2.5 flex flex-col gap-1.5">
          {t.topHolders.map((h, i) => (
            <li
              key={h.address}
              className="rv-body flex items-center gap-2 text-[12px]"
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
      <h2 className="rv-display text-[16px] font-bold text-[var(--rv-ink)]">
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

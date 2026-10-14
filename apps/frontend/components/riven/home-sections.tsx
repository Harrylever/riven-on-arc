"use client"

import Link from "next/link"
import type { Callout, TokenAlert, TokenSummary } from "@/lib/arc-data"
import {
  BAND_META,
  age,
  change,
  changeColor,
  compact,
  usd,
} from "@/lib/riven-format"
import { FlashBuy } from "./flash-buy"
import { Carousel } from "./carousel"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { Why } from "./screener"
import { ArrowIcon } from "@/components/riven/arrow"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function SectionTitle({
  title,
  href,
  cta,
  live,
}: {
  title: string
  href?: string
  cta?: string
  live?: boolean
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-[17px] font-bold tracking-tight text-[var(--rv-ink)]">
        {title}
      </h2>
      {href && (
        <Button
          nativeButton={false}
          variant="rivenGhost"
          size="rv"
          render={<Link href={href} />}
          className="ml-auto h-8 gap-1 px-3 text-[12px]"
        >
          {cta ?? "View all"}
          <ArrowIcon />
        </Button>
      )}
    </div>
  )
}

/** Big token cards, most-traded first — the "what's moving on Arc" carousel. */
export function TopCarousel({ tokens }: { tokens: TokenSummary[] }) {
  return (
    <Carousel label="Most traded on Arc">
      {tokens.map((t, i) => (
        <Link
          key={t.address}
          href={`/token/${t.address}`}
          className="group relative flex w-[210px] shrink-0 flex-col overflow-hidden rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-card)] transition-colors hover:border-[var(--rv-stroke-strong)]"
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--rv-sunken)]">
            {t.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote launch art
              <img
                src={t.image}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="grid size-full place-items-center">
                <TokenAvatar
                  image={null}
                  symbol={t.symbol}
                  address={t.address}
                  size={72}
                />
              </div>
            )}
            <span className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-[var(--rv-ink)]">
              #{i + 1}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-[var(--rv-ink)]">
                  {t.symbol}
                </p>
                <p className="truncate text-[11.5px] text-[var(--rv-ink-3)]">
                  {t.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="rv-num text-[14px] font-bold text-[var(--rv-ink)]">
                  {usd(t.marketCap)}
                </p>
                <p
                  className="rv-num text-[11.5px] font-semibold"
                  style={{ color: changeColor(t.change.h24) }}
                >
                  {change(t.change.h24)}
                </p>
              </div>
            </div>
            <p className="rv-num text-[11px] text-[var(--rv-ink-3)]">
              {compact((t.buys24h ?? 0) + (t.sells24h ?? 0))} trades · vol{" "}
              {usd(t.volume.h24)}
            </p>
            <div className="mt-auto flex items-center justify-between pt-1.5">
              <ScoreBadge score={t.score} band={t.band} size="sm" />
              <FlashBuy token={t} />
            </div>
          </div>
        </Link>
      ))}
    </Carousel>
  )
}

/** KOL posts on X that named an Arc token, next to that token's live score. */
export function CalloutsRow({
  callouts,
  now,
}: {
  callouts: Callout[]
  now: number
}) {
  if (callouts.length === 0) {
    return (
      <Card
        variant="riven"
        className="flex flex-col items-start gap-1 p-4 text-[13px] text-[var(--rv-ink-2)] sm:flex-row sm:items-center sm:gap-3"
      >
        <span className="text-[var(--rv-ink)]">No KOL callouts yet.</span>
        <span>
          Riven watches X for tracked KOLs posting Arc contract addresses — and
          shows each one next to the token&apos;s score, so a shill never comes
          without the facts.
        </span>
      </Card>
    )
  }
  return (
    <Carousel label="KOL callouts" speed={16}>
      {callouts.map((c) => (
        <article
          key={c.id}
          className="flex w-[280px] shrink-0 flex-col gap-2.5 rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-[var(--rv-card)] p-3"
        >
          <header className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-white/[0.06] text-[11px] font-bold text-[var(--rv-ink)] uppercase">
              {c.author.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[var(--rv-ink)]">
                {c.authorName ?? c.author}
              </p>
              <p className="truncate text-[11px] text-[var(--rv-ink-3)]">
                @{c.author} · {age(c.postedAt, now)} ago
              </p>
            </div>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="rounded-md p-1.5 text-[var(--rv-ink-2)] hover:bg-white/[0.06] hover:text-[var(--rv-ink)]"
              aria-label={`Open @${c.author}'s post on X`}
            >
              <svg
                viewBox="0 0 24 24"
                width={14}
                height={14}
                fill="currentColor"
                aria-hidden
              >
                <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3zm-1.08 16.2h1.7L7.4 4.73H5.58l11.09 14.47z" />
              </svg>
            </a>
          </header>
          <p className="line-clamp-3 text-[12.5px] leading-snug text-[var(--rv-ink-2)]">
            {c.text}
          </p>
          <Link
            href={`/token/${c.token.address}`}
            className="mt-auto flex items-center gap-2 rounded-md bg-[var(--rv-sunken)] p-2 ring-1 ring-[var(--rv-stroke)] hover:ring-[var(--rv-stroke-strong)]"
          >
            <TokenAvatar
              image={c.token.image}
              symbol={c.token.symbol}
              address={c.token.address}
              size={26}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-bold text-[var(--rv-ink)]">
                ${c.token.symbol}
              </span>
              <span className="rv-num block text-[11px] text-[var(--rv-ink-3)]">
                {usd(c.token.marketCap)}
              </span>
            </span>
            <ScoreBadge score={c.token.score} band={c.token.band} size="sm" />
          </Link>
          <div className="flex items-center justify-between">
            <span
              className="text-[11px]"
              style={{ color: BAND_META[c.token.band].color }}
            >
              {c.token.fake
                ? "Flagged by Riven"
                : BAND_META[c.token.band].label}
            </span>
            <FlashBuy token={c.token} />
          </div>
        </article>
      ))}
    </Carousel>
  )
}

export function CaughtList({
  tokens,
  now,
}: {
  tokens: TokenSummary[]
  now: number
}) {
  if (tokens.length === 0)
    return (
      <p className="rv-card p-4 text-[13px] text-[var(--rv-ink-2)]">
        Nothing flagged in the last day.
      </p>
    )
  return (
    <Card
      variant="riven"
      as="ol"
      className="divide-y divide-[var(--rv-stroke)] overflow-hidden"
    >
      {tokens.map((t) => (
        <li key={t.address}>
          <Link
            href={`/token/${t.address}`}
            className="flex items-start gap-3 px-3.5 py-3 hover:bg-[var(--rv-row-hover)]"
          >
            <TokenAvatar
              image={t.image}
              symbol={t.symbol}
              address={t.address}
              size={36}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-[13.5px] font-bold text-[var(--rv-ink)]">
                  {t.symbol}
                </span>
                <span className="rv-num text-[11px] text-[var(--rv-ink-3)]">
                  {age(t.launchedAt, now)}
                </span>
              </div>
              <Why t={t} />
            </div>
            <ScoreBadge score={t.score} band={t.band} size="sm" />
          </Link>
        </li>
      ))}
    </Card>
  )
}

const ALERT_META: Record<string, { label: string; color: string }> = {
  RUG_PULL: { label: "Liquidity pulled", color: "var(--rv-risk)" },
  CREATOR_DUMP: { label: "Creator sold", color: "var(--rv-risk)" },
  WHALE_DUMP: { label: "Whale sold", color: "var(--rv-caution)" },
  SCORE_DROP: { label: "Score drop", color: "var(--rv-caution)" },
}

export function AlertList({
  alerts,
  now,
}: {
  alerts: TokenAlert[]
  now: number
}) {
  if (alerts.length === 0)
    return (
      <p className="rv-card p-4 text-[13px] text-[var(--rv-ink-2)]">
        Quiet for now — no rugs, dumps or score drops caught.
      </p>
    )
  return (
    <Card
      variant="riven"
      as="ol"
      className="divide-y divide-[var(--rv-stroke)] overflow-hidden"
    >
      {alerts.map((a) => {
        const m = ALERT_META[a.type] ?? {
          label: a.type,
          color: "var(--rv-ink-2)",
        }
        return (
          <li key={a.id}>
            <Link
              href={`/token/${a.token.address}`}
              className="flex items-start gap-3 px-3.5 py-3 hover:bg-[var(--rv-row-hover)]"
            >
              <TokenAvatar
                image={a.token.image}
                symbol={a.token.symbol}
                address={a.token.address}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-bold text-[var(--rv-ink)]">
                    {a.token.symbol}
                  </span>
                  <span
                    className="rounded px-1.5 py-px text-[10px] font-bold uppercase"
                    style={{
                      color: m.color,
                      background: "rgba(255,255,255,0.05)",
                    }}
                  >
                    {m.label}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--rv-ink-2)]">
                  {a.message}
                </p>
              </div>
              <span className="rv-num shrink-0 text-[11px] text-[var(--rv-ink-3)]">
                {age(a.createdAt, now)}
              </span>
            </Link>
          </li>
        )
      })}
    </Card>
  )
}

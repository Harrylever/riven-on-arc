"use client"

import { ScoreBadge, Sparkline, TokenAvatar } from "@/components/ds"
import { WatchStar } from "@/components/token/TokenPanels"
import { Chip } from "@/components/terminal/chip"
import { categoryMetric, type Cat } from "@/components/terminal/types"
import { ago, launchpadLabel, pct, usd } from "@/lib/format"
import type { LeaderboardTokenItem } from "@/lib/mock"

export function TokenList({
  tokens,
  loading,
  active,
  watchedOnly,
  cat,
  timeframe,
  isWatched,
  onToggleWatch,
  onSelect,
}: {
  tokens: LeaderboardTokenItem[]
  loading: boolean
  active: string | null
  watchedOnly: boolean
  cat: Cat
  timeframe: "5m" | "1h" | "6h" | "24h"
  isWatched: (m: string) => boolean
  onToggleWatch: (m: string) => void
  onSelect: (m: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-none border border-[var(--border)] bg-[var(--surface)] lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto">
      {loading ? (
        <TokenListSkeleton />
      ) : tokens.length === 0 ? (
        <p className="p-8 text-center text-xs text-[var(--text-muted)]">
          {watchedOnly
            ? "Nothing on your watchlist yet. Tap the ★ on any token."
            : cat === "graduated"
              ? "No graduated tokens found right now."
              : cat === "mostheld"
                ? "Holder counts have not been collected for these tokens yet."
                : "No token in this category right now."}
        </p>
      ) : (
        tokens.map((t) => (
          <TokenRow
            key={t.mint}
            token={t}
            active={active === t.mint}
            cat={cat}
            timeframe={timeframe}
            watched={isWatched(t.mint)}
            onToggleWatch={() => onToggleWatch(t.mint)}
            onSelect={() => onSelect(t.mint)}
          />
        ))
      )}
    </div>
  )
}

function TokenListSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-3"
        >
          <div
            className="size-9 shrink-0 rounded-none bg-[var(--surface-raised)]"
            style={{ animation: "cdx-pulse 1.4s ease-in-out infinite" }}
          />
          <div className="flex-1">
            <div
              className="h-3 w-20 rounded bg-[var(--surface-raised)]"
              style={{ animation: "cdx-pulse 1.4s ease-in-out infinite" }}
            />
            <div
              className="mt-2 h-2 w-32 rounded bg-[var(--surface-raised)]"
              style={{ animation: "cdx-pulse 1.4s ease-in-out infinite" }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function TokenRow({
  token: t,
  active,
  cat,
  timeframe,
  watched,
  onToggleWatch,
  onSelect,
}: {
  token: LeaderboardTokenItem
  active: boolean
  cat: Cat
  timeframe: "5m" | "1h" | "6h" | "24h"
  watched: boolean
  onToggleWatch: () => void
  onSelect: () => void
}) {
  const change =
    timeframe === "5m"
      ? t.priceChange5m
      : timeframe === "1h"
        ? t.priceChange1h
        : timeframe === "6h"
          ? t.priceChange6h
          : t.priceChange24h

  const vol =
    timeframe === "5m"
      ? t.volume5mUsd
      : timeframe === "1h"
        ? t.volume1hUsd
        : timeframe === "6h"
          ? t.volume6hUsd
          : t.volume24hUsd

  return (
    <div
      className="flex items-center gap-2.5 border-b border-[var(--border)] px-2.5 py-2.5 transition-colors hover:bg-[var(--surface-hover)]"
      style={active ? { background: "var(--brand-tint)" } : undefined}
    >
      <WatchStar watched={watched} onToggle={onToggleWatch} />
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <TokenAvatar src={t.imageUri} symbol={t.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-bold">{t.symbol}</span>
            {t.name && t.name !== t.symbol && (
              <span className="max-w-[110px] truncate text-[11px] text-[var(--text-muted)]">
                {t.name}
              </span>
            )}
            {t.boosts != null && t.boosts > 0 && (
              <span className="py-0.2 inline-flex items-center gap-0.5 rounded border border-[#febc2e]/30 bg-[#febc2e]/15 px-1.5 text-[9px] font-extrabold text-[#febc2e] shadow-sm">
                ⚡{t.boosts}
              </span>
            )}
            {launchpadLabel(t.launchpad) && (
              <Chip>{launchpadLabel(t.launchpad)}</Chip>
            )}
          </div>
          <div className="cdx-num mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
            {categoryMetric(t, cat) ? (
              <span style={{ color: "var(--brand)" }}>
                {categoryMetric(t, cat)} ·{" "}
              </span>
            ) : null}
            {ago(t.firstSeenAt ?? t.calculatedAt)} old
            {t.traders != null
              ? ` · ${t.traders.toLocaleString()} traders`
              : t.txns24h != null
                ? ` · ${t.txns24h.toLocaleString()} txns`
                : ""}
            {t.holderCount != null
              ? ` · ${t.holderCount.toLocaleString()} holders`
              : ""}
            {vol != null
              ? ` · Vol(${timeframe.toUpperCase()}) ${usd(vol)}`
              : ""}
            {t.liquidityUsd != null ? ` · Liq ${usd(t.liquidityUsd)}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="cdx-num text-right text-[11px]">
            <div className="font-semibold">{usd(t.marketCapUsd)}</div>
            <div
              style={{
                color: (change ?? 0) >= 0 ? "var(--up)" : "var(--down)",
              }}
              className="font-bold"
            >
              {pct(change)}
            </div>
          </div>
          <Sparkline
            changes={{
              priceChange5m: t.priceChange5m,
              priceChange1h: t.priceChange1h,
              priceChange6h: t.priceChange6h,
              priceChange24h: t.priceChange24h,
            }}
            width={40}
            height={24}
          />
          <ScoreBadge score={t.score} size="sm" />
        </div>
      </button>
    </div>
  )
}

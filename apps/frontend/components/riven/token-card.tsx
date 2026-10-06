import Link from "next/link"
import type { TokenSummary } from "@/lib/arc-data"
import { age, change, changeColor, usd } from "@/lib/riven-format"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { WatchButton } from "./watch-button"
import { CopyBadge } from "./copycat"

/** One token, one glance: who it is, what it's worth, and whether it's a setup. */
export function TokenCard({ t, now }: { t: TokenSummary; now: number }) {
  const headline = t.fake
    ? `Hidden as fake: ${t.fakeReasons[0]}`
    : (t.dangers[0] ?? t.verdict.replace(/^[^:]+:\s*/, ""))
  return (
    <div className="rv-card flex items-center pr-1 transition-colors hover:border-[var(--rv-stroke-strong)]">
      <Link
        href={`/token/${t.address}`}
        className="flex min-w-0 flex-1 items-center gap-3 p-3"
      >
        <TokenAvatar
          image={t.image}
          symbol={t.symbol}
          address={t.address}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="rv-body truncate text-[15px] font-semibold text-[var(--rv-ink)]">
              {t.symbol}
            </span>
            <span className="rv-body truncate text-[12px] text-[var(--rv-ink-3)]">
              {t.name}
            </span>
            <CopyBadge copies={t.copies} />
          </div>
          <div className="rv-num mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-[var(--rv-ink-2)]">
            <span>MC {usd(t.marketCap)}</span>
            <span>Liq {usd(t.liquidityUsd)}</span>
            <span style={{ color: changeColor(t.change.h24) }}>
              {change(t.change.h24)}
            </span>
            <span className="text-[var(--rv-ink-3)]">
              {age(t.launchedAt, now)} · {t.launchpad}
            </span>
          </div>
          <p
            className="rv-body mt-1 line-clamp-1 text-[12px]"
            style={{
              color:
                t.fake || t.dangers[0] ? "var(--rv-risk)" : "var(--rv-ink-2)",
            }}
          >
            {headline}
          </p>
        </div>
        <ScoreBadge score={t.score} band={t.band} />
      </Link>
      <WatchButton address={t.address} />
    </div>
  )
}

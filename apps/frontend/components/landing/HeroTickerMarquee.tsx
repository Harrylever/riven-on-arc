"use client"

import { useId } from "react"

interface TickerItem {
  id: string
  symbol?: string
  score?: number
  tone?: "healthy" | "risk" | "caution"
  platform?: string
  signal: string
  isSpecial?: boolean
}

const TICKER_ITEMS: TickerItem[] = [
  {
    id: "1",
    isSpecial: true,
    signal: "ARC MAINNET · CHAIN ID 5042",
  },
  {
    id: "2",
    isSpecial: true,
    signal: "MEMESPAD FACTORY · RAW LOG INDEXER",
  },
  {
    id: "3",
    isSpecial: true,
    signal: "LAUNCH EVENT ABI VERIFICATION PENDING · NO SCORES YET",
  },
]

export function HeroTickerMarquee() {
  const animId = useId().replace(/:/g, "")
  const keyframeName = `marquee-${animId}`

  return (
    <div className="relative w-full overflow-hidden border-y border-[var(--border)] bg-[var(--surface-sunken)]/80 py-2.5 backdrop-blur-md select-none">
      <style>{`
        @keyframes ${keyframeName} {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .${keyframeName}-track {
          display: flex;
          width: max-content;
          animation: ${keyframeName} 42s linear infinite;
        }
        .${keyframeName}-track:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Smooth fade-out edge masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[var(--ground)] to-transparent sm:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[var(--ground)] to-transparent sm:w-24" />

      {/* Continuous marquee track with duplicated list for seamless looping */}
      <div className={`${keyframeName}-track items-center gap-6`}>
        {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, idx) => (
          <TickerPill key={`${item.id}-${idx}`} item={item} />
        ))}
      </div>
    </div>
  )
}

function TickerPill({ item }: { item: TickerItem }) {
  if (item.isSpecial) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-none border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-[var(--brand)]">
        {item.signal}
      </div>
    )
  }

  const isHealthy = item.tone === "healthy"
  const isRisk = item.tone === "risk"

  const scoreColor = isHealthy
    ? "var(--score-healthy)"
    : isRisk
      ? "var(--score-risk)"
      : "var(--score-caution)"

  const scoreBg = isHealthy
    ? "var(--score-healthy-tint)"
    : isRisk
      ? "var(--score-risk-tint)"
      : "var(--score-caution-tint)"

  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-none border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs">
      {/* Token Symbol */}
      <span
        className="font-bold tracking-tight text-[var(--text-primary)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {item.symbol}
      </span>

      {/* Platform Badge */}
      {item.platform && (
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {item.platform}
        </span>
      )}

      {/* Score Pill */}
      {item.score !== undefined && (
        <span
          className="flex items-center gap-1 rounded-none px-1.5 py-0.5 font-mono text-[10px] font-extrabold"
          style={{
            color: scoreColor,
            backgroundColor: scoreBg,
            border: `1px solid ${scoreColor}`,
          }}
        >
          {item.score.toFixed(1)}
        </span>
      )}

      {/* Signal / Verdict */}
      <span
        className={`font-mono text-[11px] ${
          isRisk
            ? "font-medium text-[var(--score-risk)]"
            : "text-[var(--text-secondary)]"
        }`}
      >
        {item.signal}
      </span>

      {/* Subtle Separator Dot */}
      <span className="ml-2 text-[var(--border-strong)]">•</span>
    </div>
  )
}

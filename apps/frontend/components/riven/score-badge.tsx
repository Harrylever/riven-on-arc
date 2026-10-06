import type { ArcBand } from "@clawdex/shared"
import { BAND_META } from "@/lib/riven-format"

/** Flat 1–10 score chip — colour carries the band, no glow. */
export function ScoreBadge({
  score,
  band,
  size = "md",
  word = false,
}: {
  score: number | null
  band: ArcBand
  size?: "sm" | "md"
  /** Show the one-word verdict under the number ("Risky", "Caution"…). */
  word?: boolean
}) {
  const m = BAND_META[band]
  const sm = size === "sm"
  const chip = (
    <span
      className={`rv-num inline-flex shrink-0 items-baseline justify-center gap-0.5 rounded-md font-semibold ${
        sm
          ? "min-w-[46px] px-1.5 py-0.5 text-[12px]"
          : "min-w-[58px] px-2 py-1 text-[15px]"
      }`}
      style={{
        color: m.color,
        background: m.tint,
        boxShadow: `inset 0 0 0 1px ${m.color}33`,
      }}
      title={score === null ? "Not scored yet" : `${score}/10 · ${m.short}`}
      aria-label={
        score === null
          ? "Not scored yet"
          : `Score ${score} out of 10, ${m.short}`
      }
    >
      {score === null ? "…" : score.toFixed(1)}
      {score !== null && <span className="text-[0.7em] opacity-60">/10</span>}
    </span>
  )
  if (!word) return chip
  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-0.5">
      {chip}
      <span
        className="rv-body text-[10px] font-semibold tracking-wide uppercase"
        style={{ color: m.color }}
      >
        {m.short}
      </span>
    </span>
  )
}

/** Ten flat segments for the token page: how much of the 10 is lit. */
export function ScoreMeter({
  score,
  band,
}: {
  score: number | null
  band: ArcBand
}) {
  const m = BAND_META[band]
  const lit = score === null ? 0 : score
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, lit - i))
        return (
          <span
            key={i}
            className="relative h-2.5 flex-1 overflow-hidden rounded-[3px] bg-white/[0.07]"
          >
            <span
              className="absolute inset-y-0 left-0"
              style={{ width: `${fill * 100}%`, background: m.color }}
            />
          </span>
        )
      })}
    </div>
  )
}

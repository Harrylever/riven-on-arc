/** A labelled 0–10 bar (signal conviction). */
import { Progress } from "@/components/ui/progress"
export function MiniBar({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  const v = value ?? 0
  const color =
    value == null
      ? "var(--rv-unscored)"
      : v >= 7
        ? "var(--rv-healthy)"
        : v >= 5
          ? "var(--rv-caution)"
          : "var(--rv-risk)"
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-[var(--rv-ink-3)]">
        <span>{label}</span>
        <span className="font-mono font-semibold text-[var(--rv-ink)]">
          {value != null ? `${value.toFixed(1)}/10` : "not checked"}
        </span>
      </div>
      <Progress
        value={Math.min(100, Math.max(0, v * 10))}
        aria-label={label}
        className="mt-1 block"
        trackClassName="h-1.5 bg-white/[0.06]"
        indicatorStyle={{ background: color }}
      />
    </div>
  )
}

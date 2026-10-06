/** A labelled 0–10 bar (signal conviction). */
export function MiniBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0
  const color = value == null ? "var(--rv-unscored)" : v >= 7 ? "var(--rv-healthy)" : v >= 5 ? "var(--rv-caution)" : "var(--rv-risk)"
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-[var(--rv-ink-3)]">
        <span>{label}</span>
        <span className="font-mono font-semibold text-[var(--rv-ink)]">{value != null ? `${value.toFixed(1)}/10` : "not checked"}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden bg-white/[0.06]">
        <div className="h-full transition-all" style={{ width: `${Math.min(100, Math.max(0, v * 10))}%`, background: color }} />
      </div>
    </div>
  )
}

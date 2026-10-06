"use client"

export function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex gap-1 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-1 text-xs font-semibold">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="rounded-none px-3 py-1.5 transition-colors"
          style={
            value === o.value
              ? {
                  background: "var(--surface-raised)",
                  color: "var(--text-primary)",
                }
              : { color: "var(--text-muted)" }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

import type { ArcBand } from "@clawdex/shared"

export const BAND_META: Record<
  ArcBand,
  { label: string; short: string; color: string; tint: string }
> = {
  healthy: {
    label: "Looks healthy",
    short: "Healthy",
    color: "var(--rv-healthy)",
    tint: "rgba(34, 197, 94, 0.10)",
  },
  caution: {
    label: "Be careful",
    short: "Caution",
    color: "var(--rv-caution)",
    tint: "rgba(234, 179, 8, 0.10)",
  },
  risk: {
    label: "Risky",
    short: "Risky",
    color: "var(--rv-risk)",
    tint: "rgba(239, 68, 68, 0.10)",
  },
  unscored: {
    label: "Scoring…",
    short: "Scoring",
    color: "var(--rv-unscored)",
    tint: "rgba(100, 116, 139, 0.10)",
  },
}

export function usd(
  n: number | null | undefined,
  opts: { precise?: boolean } = {},
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  if (abs >= 1 || !opts.precise) return `$${n.toFixed(abs >= 100 ? 0 : 2)}`
  if (n === 0) return "$0"
  return `$${n.toPrecision(3)}`
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}

export function age(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

export function pct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`
}

/** Signed % change, e.g. +12.4% / −80%. */
export function change(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  const a = Math.abs(n)
  const v =
    a >= 1000
      ? `${Math.round(a / 100) / 10}K`
      : a >= 100
        ? Math.round(a).toString()
        : a.toFixed(1)
  return `${n >= 0 ? "+" : "−"}${v}%`
}

export function changeColor(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0)
    return "var(--rv-ink-3)"
  return n > 0 ? "var(--rv-up)" : "var(--rv-down)"
}

/** Multiple vs launch, e.g. 12.4x or 0.03x. */
export function times(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  if (n >= 100) return `${Math.round(n)}x`
  if (n >= 10) return `${n.toFixed(1)}x`
  return `${n.toFixed(2)}x`
}

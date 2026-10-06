export const usd = (n?: number | null) =>
  n == null
    ? "—"
    : n >= 1e9
      ? `$${(n / 1e9).toFixed(2)}B`
      : n >= 1e6
        ? `$${(n / 1e6).toFixed(2)}M`
        : n >= 1e4
          ? `$${(n / 1e3).toFixed(1)}K`
          : `$${Math.round(n).toLocaleString()}`

export const pct = (n?: number | null) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`

/** Unlike usd(), keeps precision for sub-$1 values (pump.fun tokens, altcoin
 * perps) instead of rounding them all to "$0". */
export const priceUsd = (n?: number | null) => {
  if (n == null) return "—"
  if (n < 0.00001) return `$${n.toExponential(2)}`
  if (n < 0.01) return `$${n.toFixed(6)}`
  if (n < 1) return `$${n.toFixed(4)}`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export const shortAddr = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`

export function ago(iso?: string | Date | null): string {
  if (!iso) return "—"
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) return "—"
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

const DEX_LABELS: Record<string, string> = {
  pumpfun: "pump.fun",
  pumpswap: "PumpSwap",
  raydium: "Raydium",
  meteora: "Meteora",
  orca: "Orca",
  launchlab: "LaunchLab",
  moonshot: "Moonshot",
  fluxbeam: "FluxBeam",
}

/** DexScreener dexId to a display name; unknown ids are shown as returned. */
export function dexLabel(dexId?: string | null): string | null {
  if (!dexId) return null
  const k = dexId.toLowerCase()
  return DEX_LABELS[k] ?? dexId
}

const LAUNCHPAD_LABELS: Record<string, string> = {
  PUMPFUN: "pump.fun",
  LAUNCHLAB: "LaunchLab",
  CLAWPUMP: "ClawPump",
}

/** Launchpad enum to a display name. OTHER and unknown values return null (not a known launchpad). */
export function launchpadLabel(lp?: string | null): string | null {
  if (!lp || lp === "OTHER") return null
  return LAUNCHPAD_LABELS[lp] ?? lp
}

/** Scores are stored and served as 0-100 but shown to users out of 10. */
export const score10 = (s: number | null | undefined): string =>
  s == null || Number.isNaN(s) ? "—" : s >= 100 ? "10" : (s / 10).toFixed(1)

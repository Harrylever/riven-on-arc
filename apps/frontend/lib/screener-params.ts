import type { ArcBand } from "@clawdex/shared"

/** Screener filters ↔ URL query. Shared by the server page and the client UI. */

export type SortKey =
  "trending" | "new" | "gainers" | "losers" | "mcap" | "liquidity" | "safest"
export type BandFilter = "all" | ArcBand
export type AgeFilter = "all" | "1h" | "6h" | "24h" | "7d"
export type PadFilter = "all" | "ARGUS" | "TOLLY" | "OTHER"
/** listed = flagged tokens hidden (default); caught = only flagged ones, with why; all = both. */
export type ViewFilter = "listed" | "caught" | "all"

export interface ScreenerFilters {
  sort: SortKey
  band: BandFilter
  pad: PadFilter
  age: AgeFilter
  minLiq: number
  minMcap: number
  maxMcap: number
  minVol: number
  minScore: number
  view: ViewFilter
  page: number
}

export const PAGE_SIZE = 25

export const DEFAULT_FILTERS: ScreenerFilters = {
  sort: "trending",
  band: "all",
  pad: "all",
  age: "all",
  minLiq: 0,
  minMcap: 0,
  maxMcap: 0,
  minVol: 0,
  minScore: 0,
  view: "listed",
  page: 1,
}

export const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New pairs" },
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "mcap", label: "Market cap" },
  { id: "liquidity", label: "Liquidity" },
  { id: "safest", label: "Safest" },
]

const pick = <T extends string>(
  v: string | undefined,
  allowed: readonly T[],
  d: T,
): T => (allowed.includes(v as T) ? (v as T) : d)
const n = (v: string | undefined) => {
  const x = Number(v)
  return Number.isFinite(x) && x > 0 ? x : 0
}

export function parseFilters(
  sp: Record<string, string | undefined>,
): ScreenerFilters {
  return {
    sort: pick(
      sp.sort,
      SORTS.map((s) => s.id),
      "trending",
    ),
    band: pick(
      sp.band,
      ["all", "healthy", "caution", "risk", "unscored"] as const,
      "all",
    ),
    pad: pick(sp.pad, ["all", "ARGUS", "TOLLY", "OTHER"] as const, "all"),
    age: pick(sp.age, ["all", "1h", "6h", "24h", "7d"] as const, "all"),
    minLiq: n(sp.minLiq),
    minMcap: n(sp.minMcap),
    maxMcap: n(sp.maxMcap),
    minVol: n(sp.minVol),
    minScore: Math.min(10, n(sp.minScore)),
    // `fake=1` is the old "show fake tokens" link: keep it working.
    view:
      sp.fake === "1"
        ? "all"
        : pick(sp.view, ["listed", "caught", "all"] as const, "listed"),
    page: Math.max(1, Math.floor(n(sp.page)) || 1),
  }
}

export function filtersToQuery(f: ScreenerFilters): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(f) as Array<
    [keyof ScreenerFilters, unknown]
  >) {
    if (v === DEFAULT_FILTERS[k]) continue
    q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ""
}

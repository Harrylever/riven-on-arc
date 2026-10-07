import type { Metadata } from "next"
import { getScreener } from "@/lib/arc-data"
import { DEFAULT_FILTERS } from "@/lib/screener-params"
import { MarketBoard, type Panel } from "@/components/riven/market-board"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Markets",
  description: "Arc at a glance: new pairs, top volume, safest tokens and everything Riven caught.",
}

const empty = { tokens: [], total: 0, page: 1, pages: 1 }

export default async function MarketsPage() {
  const q = (patch: Partial<typeof DEFAULT_FILTERS>) =>
    getScreener({ ...DEFAULT_FILTERS, ...patch }, 15).catch((err: Error) => {
      console.error(`[markets] ${err.message}`)
      return empty
    })
  const [fresh, volume, safest, caught] = await Promise.all([
    q({ sort: "new", view: "all" }),
    q({ sort: "trending", view: "all" }),
    q({ sort: "safest" }),
    q({ sort: "new", view: "caught" }),
  ])
  const panels: Panel[] = [
    {
      id: "new",
      title: "New pairs",
      hint: "Just launched",
      accent: "var(--rv-healthy)",
      icon: "M12 5v14M5 12h14",
      href: "/trending?sort=new&view=all",
      tokens: fresh.tokens,
    },
    {
      id: "volume",
      title: "Top volume",
      hint: "Most traded · 24h",
      accent: "var(--rv-blue)",
      icon: "M3 17l6-6 4 4 8-8M15 7h6v6",
      href: "/trending?view=all",
      tokens: volume.tokens,
    },
    {
      id: "safest",
      title: "Safest",
      hint: "Highest Riven score, not flagged",
      accent: "var(--rv-healthy)",
      icon: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z",
      href: "/trending?sort=safest",
      tokens: safest.tokens,
      empty: "No unflagged token has earned a score yet — new launches are still being read. Riven never guesses a score.",
    },
    {
      id: "caught",
      title: "Caught",
      hint: "Flagged, with the evidence",
      accent: "var(--rv-risk)",
      icon: "M12 3 2 20h20L12 3zm0 6v5m0 3h.01",
      href: "/trending?view=caught",
      tokens: caught.tokens,
      showWhy: true,
    },
  ]
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--rv-ink)]">Markets</h1>
        <p className="text-[13px] text-[var(--rv-ink-3)]">Arc at a glance — every list scored by Riven.</p>
      </div>
      <MarketBoard panels={panels} serverNow={now} />
    </div>
  )
}

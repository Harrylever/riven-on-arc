import type { Metadata } from "next"
import { getScreener } from "@/lib/arc-data"
import { DEFAULT_FILTERS } from "@/lib/screener-params"
import { MarketBoard, type Panel } from "@/components/riven/market-board"
import { PageHero } from "@/components/riven/page-hero"
import type { Holo } from "@/components/mascot/mascot"
import { usd } from "@/lib/riven-format"

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
    q({ sort: "volume", view: "all" }),
    q({ sort: "safest", view: "listed" }),
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
  const lead = volume.tokens[0]
  const holos: Holo[] = [
    ...(lead
      ? [{ title: `Top volume · ${lead.symbol}`, value: usd(lead.volume.h24), note: "Traded in the last 24h", tone: "blue" as const }]
      : []),
    { title: "Tokens listed", value: String(fresh.total), note: "Every Arc token with a pool", tone: "green" as const },
    { title: "Caught · recent", value: String(caught.total), note: "Flagged with on-chain evidence", tone: "red" as const },
  ]
  return (
    <div className="flex flex-col gap-4">
      <PageHero
        eyebrow="Arc at a glance"
        title="Markets"
        holos={holos}
        lines={[
          "“Safest” only shows tokens I've scored that aren't flagged.",
          "New pairs land first — I score them as soon as I can.",
          "Tap any row for the full rug check.",
        ]}
      >
        New pairs, top volume, the safest tokens and everything Riven caught — every list scored.
      </PageHero>
      <MarketBoard panels={panels} serverNow={now} />
    </div>
  )
}

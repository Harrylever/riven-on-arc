import Link from "next/link"
import { PERPS_ENABLED } from "@/lib/flags"
import { ArrowIcon } from "@/components/riven/arrow"
import { buildPageMetadata } from "@/lib/site"
import { Card } from "@/components/ui/card"

export const metadata = buildPageMetadata({
  title: "More",
  description:
    "Explore Riven's Arc ecosystem, methodology, accuracy, portfolio tools and paper-trading terminal.",
  path: "/more",
})

const LINKS = [
  {
    href: "/perps",
    label: "Perps terminal",
    hint: "Live perps, TradingView charts, Riven Scanner calls and price alerts",
  },
  {
    href: "/watchlist",
    label: "Watchlist",
    hint: "Tokens you starred, with live scores and rug alerts",
  },
  {
    href: "/portfolio",
    label: "Portfolio check",
    hint: "Paste any wallet to see its holdings scored",
  },
  {
    href: "/ecosystem",
    label: "Ecosystem",
    hint: "Arc launchpads compared, and the serial launchers",
  },
  {
    href: "/methodology",
    label: "How the score works",
    hint: "The 1–10 score, every check and every red flag",
  },
  {
    href: "/accuracy",
    label: "Does the score warn in time?",
    hint: "Riven's own hit rate: how often rated tokens later saw liquidity pulled",
  },
].filter((l) => PERPS_ENABLED || l.href !== "/perps")

export default function MorePage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[28px] font-extrabold text-[var(--rv-ink)]">More</h1>
      <Card
        variant="riven"
        as="ul"
        className="divide-y divide-[var(--rv-stroke)]"
      >
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex items-center gap-3 px-4 py-4 hover:bg-[var(--rv-row-hover)]"
            >
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-[var(--rv-ink)]">
                  {l.label}
                </p>
                <p className="text-[12px] text-[var(--rv-ink-3)]">{l.hint}</p>
              </div>
              <ArrowIcon className="size-4 text-[var(--rv-ink-3)]" />
            </Link>
          </li>
        ))}
      </Card>
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "More" }

const LINKS = [
  { href: "/perps", label: "Perps terminal", hint: "Hyperliquid perps, TradingView chart, sakz-bot signals and price alerts" },
  { href: "/watchlist", label: "Watchlist", hint: "Tokens you starred, with live scores and rug alerts" },
  { href: "/portfolio", label: "Portfolio check", hint: "Paste any wallet to see its holdings scored" },
  { href: "/ecosystem", label: "Ecosystem", hint: "Arc launchpads compared, and the serial launchers" },
  { href: "/methodology", label: "How the score works", hint: "The 1–10 score, every check and every red flag" },
]

export default function MorePage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="rv-display text-[28px] font-extrabold text-[var(--rv-ink)]">More</h1>
      <ul className="rv-card divide-y divide-[var(--rv-stroke)]">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center gap-3 px-4 py-4 hover:bg-[var(--rv-row-hover)]">
              <div className="flex-1">
                <p className="rv-body text-[15px] font-semibold text-[var(--rv-ink)]">{l.label}</p>
                <p className="rv-body text-[12px] text-[var(--rv-ink-3)]">{l.hint}</p>
              </div>
              <span className="text-[var(--rv-ink-3)]" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

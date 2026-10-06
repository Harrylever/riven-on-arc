"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { PERPS_ENABLED } from "@/lib/flags"
import { RugWatcher } from "./rug-watcher"

interface Status {
  lastBlock: string | null
  syncedAt: string | null
}

const NAV = [
  { href: "/", label: "Screener" },
  { href: "/perps", label: "Perps" },
  { href: "/alerts", label: "Rug radar" },
  { href: "/agent", label: "Ask Riven" },
  { href: "/ecosystem", label: "Ecosystem" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/methodology", label: "Score" },
].filter((n) => PERPS_ENABLED || n.href !== "/perps")

const MOBILE = [
  { href: "/", label: "Screener", icon: "M3 5h18M3 12h18M3 19h18" },
  { href: "/search", label: "Search", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3" },
  { href: "/alerts", label: "Rugs", icon: "M12 3 2 20h20L12 3zm0 6v5m0 3h.01" },
  { href: "/agent", label: "Ask", icon: "M4 5h16v11H8l-4 4V5z" },
  { href: "/more", label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
]

function useStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch("/api/arc/status?light=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => alive && s && setStatus(s))
        .catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  return status
}

export function RivenShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const status = useStatus()
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href))
  const stale = status?.syncedAt ? Date.now() - new Date(status.syncedAt).getTime() > 10 * 60_000 : false

  return (
    <div className="flex min-h-dvh flex-col">
      <RugWatcher />
      <header className="sticky top-0 z-30 border-b border-[var(--rv-stroke)] bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Riven home">
            <span className="relative size-8 overflow-hidden rounded-lg ring-1 ring-[var(--rv-stroke-strong)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand art */}
              <img src="/brand/riven-splash.png" alt="" className="absolute top-[-14%] left-[-20%] w-[140%] max-w-none" />
            </span>
            <span className="rv-display rv-brand-text text-[19px] font-extrabold tracking-[0.14em]">
              RIV<b>EN</b>
            </span>
          </Link>
          <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className="rv-body rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors"
                style={{
                  color: active(n.href) ? "#fff" : "var(--rv-ink-3)",
                  background: active(n.href) ? "rgba(30,123,255,0.18)" : "transparent",
                }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/search"
            className="rv-body ml-auto hidden items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-[var(--rv-ink-3)] ring-1 ring-[var(--rv-stroke)] hover:text-[var(--rv-ink)] md:flex"
          >
            Search token or 0x…
          </Link>
          <div
            className="rv-num ml-auto flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-[var(--rv-ink-2)] ring-1 ring-[var(--rv-stroke)] md:ml-2"
            title={status?.lastBlock ? `Last indexed Arc block ${status.lastBlock}` : "Connecting to Arc…"}
          >
            <span className={stale ? "size-2 rounded-full bg-[var(--rv-caution)]" : "rv-live-dot"} />
            {stale ? "CATCHING UP" : "ARC LIVE"}
            {status?.lastBlock && <span className="hidden text-[var(--rv-ink-3)] sm:inline">#{Number(status.lastBlock).toLocaleString()}</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-28 lg:pb-12">{children}</main>

      <footer className="rv-body mx-auto hidden w-full max-w-7xl px-4 pb-8 text-[11px] text-[var(--rv-ink-3)] lg:block">
        Riven reads Arc mainnet directly. Scores are on-chain facts anyone can re-check — never paid placement. Market data via
        DexScreener. Not financial advice. DYOR.
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--rv-stroke)] bg-black/95 lg:hidden" aria-label="Main">
        <div className="flex items-stretch justify-around px-1 pt-1" style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}>
          {MOBILE.map((n) => {
            const on = active(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className="flex min-h-[50px] flex-1 flex-col items-center justify-center gap-1"
              >
                <svg
                  viewBox="0 0 24 24"
                  width={21}
                  height={21}
                  fill="none"
                  stroke={on ? "var(--rv-blue)" : "var(--rv-ink-3)"}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={n.icon} />
                </svg>
                <span className="rv-body text-[10.5px] font-semibold" style={{ color: on ? "var(--rv-ink)" : "var(--rv-ink-3)" }}>
                  {n.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

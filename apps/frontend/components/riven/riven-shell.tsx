"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { PERPS_ENABLED } from "@/lib/flags"
import { RugWatcher } from "./rug-watcher"
import { TickerStrip } from "./ticker-strip"
import { Companion } from "@/components/mascot/companion"
import { RivenProvider } from "@/components/mascot/riven-context"
import { visibleInterval } from "@/lib/visible-interval"
import { Button } from "@/components/ui/button"

interface Status {
  lastBlock: string | null
  syncedAt: string | null
}

const NAV = [
  { href: "/", label: "Home" },
  { href: "/trending", label: "Trending" },
  { href: "/markets", label: "Markets" },
  { href: "/alerts", label: "Rug radar" },
  { href: "/perps", label: "Perps" },
  { href: "/agent", label: "Ask Riven" },
].filter((n) => PERPS_ENABLED || n.href !== "/perps")

const MOBILE = [
  {
    href: "/",
    label: "Home",
    icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  },
  { href: "/trending", label: "Trending", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  {
    href: "/markets",
    label: "Markets",
    icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  },
  { href: "/alerts", label: "Rugs", icon: "M12 3 2 20h20L12 3zm0 6v5m0 3h.01" },
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
    const stop = visibleInterval(load, 120_000)
    return () => {
      alive = false
      stop()
    }
  }, [])
  return status
}

function Logo() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2"
      aria-label="Riven home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand art */}
      <img
        src="/brand/riven-mark.png"
        alt=""
        className="size-7 object-contain"
      />
      <span className="text-[17px] font-extrabold tracking-[0.12em] text-[var(--rv-ink)]">
        RIVEN
      </span>
    </Link>
  )
}

export function RivenShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const status = useStatus()
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 15_000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])
  const lagMin =
    status?.syncedAt && now !== null
      ? Math.round((now - new Date(status.syncedAt).getTime()) / 60_000)
      : null
  const stale = lagMin !== null && lagMin > 10

  return (
    <RivenProvider>
      <div className="flex min-h-dvh flex-col">
        <RugWatcher />
        <Companion />
        <header className="sticky top-0 z-30 border-b border-[var(--rv-stroke)] bg-[rgba(15,15,18,0.92)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4">
            <Logo />
            <nav
              className="ml-5 hidden items-center gap-0.5 lg:flex"
              aria-label="Main"
            >
              {NAV.map((n) => {
                const on = active(n.href)
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={on ? "page" : undefined}
                    className="rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors hover:text-[var(--rv-ink)]"
                    style={{
                      color: on ? "var(--rv-blue)" : "var(--rv-ink-2)",
                      background: on ? "rgba(124,196,232,0.10)" : "transparent",
                    }}
                  >
                    {n.label}
                  </Link>
                )
              })}
            </nav>
            <Link
              href="/search"
              className="ml-auto hidden h-9 w-64 items-center gap-2 rounded-md border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 text-[13px] text-[var(--rv-ink-3)] hover:border-[var(--rv-stroke-strong)] md:flex"
            >
              <svg
                viewBox="0 0 24 24"
                width={15}
                height={15}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3" />
              </svg>
              Search token or 0x…
            </Link>
            <Link
              href="/search"
              className="ml-auto rounded-md p-2 text-[var(--rv-ink-2)] md:hidden"
              aria-label="Search"
            >
              <svg
                viewBox="0 0 24 24"
                width={19}
                height={19}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3" />
              </svg>
            </Link>
            <Button
              nativeButton={false}
              variant="riven"
              size="rv"
              render={<Link href="/portfolio" />}
              className="h-9 px-3.5"
            >
              Portfolio
            </Button>
          </div>
          <TickerStrip />
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 pb-28 lg:pb-16">
          {children}
        </main>

        {/* Desktop status bar */}
        <footer className="fixed inset-x-0 bottom-0 z-30 hidden h-8 items-center gap-4 border-t border-[var(--rv-stroke)] bg-[rgba(10,10,12,0.95)] px-4 text-[11.5px] text-[var(--rv-ink-3)] lg:flex">
          <span className="flex items-center gap-2 font-semibold text-[var(--rv-ink-2)]">
            {stale && (
              <span className="size-1.5 rounded-full bg-[var(--rv-caution)]" />
            )}
            {stale
              ? `Catching up · ${lagMin} min behind`
              : "Arc mainnet · live"}
          </span>
          {status?.lastBlock && (
            <span className="rv-num">
              Block #{Number(status.lastBlock).toLocaleString()}
            </span>
          )}
          <span className="ml-auto flex items-center gap-4">
            <Link href="/methodology" className="hover:text-[var(--rv-ink)]">
              How scoring works
            </Link>
            <Link href="/watchlist" className="hover:text-[var(--rv-ink)]">
              Watchlist
            </Link>
            <Link href="/ecosystem" className="hover:text-[var(--rv-ink)]">
              Ecosystem
            </Link>
            <Link href="/terms" className="hover:text-[var(--rv-ink)]">
              Terms
            </Link>
            <Link href="/disclaimer" className="hover:text-[var(--rv-ink)]">
              Disclaimer
            </Link>
            <span>Not financial advice · DYOR</span>
          </span>
        </footer>

        {/* Mobile tab bar */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--rv-stroke)] bg-[rgba(10,10,12,0.96)] lg:hidden"
          aria-label="Main"
        >
          <div
            className="flex items-stretch justify-around px-1 pt-1"
            style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}
          >
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
                    width={20}
                    height={20}
                    fill="none"
                    stroke={on ? "var(--rv-blue)" : "var(--rv-ink-3)"}
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d={n.icon} />
                  </svg>
                  <span
                    className="text-[10.5px] font-semibold"
                    style={{ color: on ? "var(--rv-ink)" : "var(--rv-ink-3)" }}
                  >
                    {n.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </RivenProvider>
  )
}

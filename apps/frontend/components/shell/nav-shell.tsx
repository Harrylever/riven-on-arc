"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ReactNode, useEffect, useRef, useState, FormEvent } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { LEGACY_SOLANA_FEATURES_ENABLED, PERPS_ENABLED } from "@/lib/flags"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Home01Icon,
  Robot01Icon,
  Search01Icon,
  TerminalIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"

interface NavShellProps {
  children: ReactNode
}

export function NavShell({ children }: NavShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const auth = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [dropdownResults, setDropdownResults] = useState<{
    tokens: Array<{
      mint: string
      name: string
      symbol: string
      imageUri: string | null
      marketCapUsd: number | null
      priceChange24h: number | null
    }>
    perps?: Array<{
      id: string
      exchange: string
      symbol: string
      bias: "LONG" | "SHORT"
      confidence: number
      entryPrice: number
    }>
    people: Array<{ name: string; handle?: string | null }>
    news: Array<{ id: string; title: string }>
  } | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        if (searchRef.current && searchRef.current.offsetParent !== null)
          searchRef.current.focus()
        else router.push("/search")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router])

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      // Clear stale dropdown results as soon as the query drops below the
      // search threshold — a reset tied to searchQuery changing.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDropdownResults(null)
      setIsDropdownOpen(false)
      return
    }

    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res) {
            setDropdownResults({
              tokens: (res.tokens ?? []).slice(0, 4),
              perps: (res.perps ?? []).slice(0, 3),
              people: (res.people ?? []).slice(0, 2),
              news: (res.news ?? []).slice(0, 2),
            })
            setIsDropdownOpen(true)
          }
        })
        .catch(() => {})
    }, 150)

    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    setIsDropdownOpen(false)
    const q = searchQuery.trim()
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
      router.push(`/token/${q}`)
    } else if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
    } else {
      router.push("/search")
    }
  }

  const navItems = [
    {
      label: "Home",
      href: "/",
      icon: (active: boolean) => (
        <HugeiconsIcon
          icon={Home01Icon}
          className={cn(
            "size-5 transition-colors",
            active ? "text-[var(--sol2)]" : "text-muted-foreground",
          )}
          strokeWidth={2}
        />
      ),
    },
    {
      label: "Terminal",
      href: "/terminal",
      icon: (active: boolean) => (
        <HugeiconsIcon
          icon={TerminalIcon}
          className={cn(
            "size-5 transition-colors",
            active ? "text-[var(--sol2)]" : "text-muted-foreground",
          )}
          strokeWidth={2}
        />
      ),
    },
    {
      // No ⌘K on mobile (no keyboard) and the header search bar is
      // `hidden md:flex` — this is the only mobile entry point to /search.
      label: "Search",
      href: "/search",
      icon: (active: boolean) => (
        <HugeiconsIcon
          icon={Search01Icon}
          className={cn(
            "size-5 transition-colors",
            active ? "text-[var(--sol2)]" : "text-muted-foreground",
          )}
          strokeWidth={2}
        />
      ),
    },
    {
      label: "AI Agent",
      href: "/agent",
      icon: (active: boolean) => (
        <HugeiconsIcon
          icon={Robot01Icon}
          className={cn(
            "size-5 transition-colors",
            active ? "text-[var(--sol2)]" : "text-muted-foreground",
          )}
          strokeWidth={2}
        />
      ),
    },
    ...(LEGACY_SOLANA_FEATURES_ENABLED
      ? [
          {
            label: "Portfolio",
            href: "/portfolio",
            icon: (active: boolean) => (
              <HugeiconsIcon
                icon={Wallet01Icon}
                className={cn(
                  "size-5 transition-colors",
                  active ? "text-[var(--sol2)]" : "text-muted-foreground",
                )}
                strokeWidth={2}
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="flex min-h-screen flex-col bg-transparent text-[var(--txt)]">
      {/* New Desktop Header from HTML Shell */}
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(7,8,12,0.78)] backdrop-blur-md">
        <div className="mx-auto flex h-[66px] max-w-[1280px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight"
          >
            <span>ClawDex</span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1.5 lg:flex">
            <Link
              href="/terminal"
              className={cn(
                "rounded-none px-3 py-2 text-sm font-semibold transition-colors",
                pathname === "/terminal"
                  ? "bg-white/[0.05] text-[var(--txt)]"
                  : "text-[var(--mut)] hover:bg-white/[0.04] hover:text-[var(--txt)]",
              )}
            >
              Terminal
            </Link>
            {LEGACY_SOLANA_FEATURES_ENABLED && (
              <Link
                href="/portfolio"
                className={cn(
                  "rounded-none px-3 py-2 text-sm font-semibold transition-colors",
                  pathname === "/portfolio"
                    ? "bg-white/[0.05] text-[var(--txt)]"
                    : "text-[var(--mut)] hover:bg-white/[0.04] hover:text-[var(--txt)]",
                )}
              >
                Portfolio
              </Link>
            )}
            <Link
              href="/watchlist"
              className={cn(
                "rounded-none px-3 py-2 text-sm font-semibold transition-colors",
                pathname === "/watchlist"
                  ? "bg-white/[0.05] text-[var(--txt)]"
                  : "text-[var(--mut)] hover:bg-white/[0.04] hover:text-[var(--txt)]",
              )}
            >
              Watchlist
            </Link>
            {PERPS_ENABLED && (
              <Link
                href="/perps"
                className={cn(
                  "rounded-none px-3 py-2 text-sm font-semibold transition-colors",
                  pathname === "/perps"
                    ? "bg-white/[0.05] text-[var(--txt)]"
                    : "text-[var(--mut)] hover:bg-white/[0.04] hover:text-[var(--txt)]",
                )}
              >
                Perps
              </Link>
            )}
          </nav>

          {/* Nav Search Box */}
          <div className="relative ml-auto hidden max-w-[420px] flex-1 md:flex">
            <form
              onSubmit={handleSearch}
              className="flex w-full items-center gap-2 rounded-none border border-[var(--line2)] bg-white/[0.03] px-3.5 py-2 font-mono text-xs text-[var(--mut)] transition-colors focus-within:border-[var(--brand)]"
            >
              <span>🔍</span>
              <input
                type="text"
                ref={searchRef}
                placeholder="Search token names, tickers, or 0x address…"
                value={searchQuery}
                onFocus={() => {
                  if (dropdownResults) setIsDropdownOpen(true)
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border-none bg-transparent text-xs text-[var(--txt)] outline-none placeholder:text-[var(--mut2)]"
              />
              <Link
                href="/search"
                className="ml-auto rounded border border-[var(--line2)] px-1.5 py-0.5 text-[11px] text-[var(--mut2)] hover:text-[var(--txt)]"
              >
                ⌘K
              </Link>
            </form>

            {/* Live Autocomplete Dropdown */}
            {isDropdownOpen && dropdownResults && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 z-50 mt-1.5 w-full overflow-hidden rounded-none border border-[var(--border)] bg-[#0c0e14] p-2 shadow-2xl backdrop-blur-xl"
              >
                {/* Perpetual Futures Signals */}
                {dropdownResults.perps && dropdownResults.perps.length > 0 && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold tracking-wider text-[var(--brand)] uppercase">
                      <span>Perpetual Signals</span>
                      <span className="text-[9px] text-[var(--mut)]">
                        sakz-bot-main
                      </span>
                    </div>
                    {dropdownResults.perps.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false)
                          router.push(`/terminal?tab=perps`)
                        }}
                        className="flex w-full items-center justify-between rounded-none px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.06]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 text-[9px] font-bold uppercase",
                              p.bias === "LONG"
                                ? "bg-[var(--up)]/15 text-[var(--up)]"
                                : "bg-[var(--down)]/15 text-[var(--down)]",
                            )}
                          >
                            {p.bias}
                          </span>
                          <span className="truncate font-bold text-[var(--txt)]">
                            {p.symbol}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--mut)]">
                            {p.exchange}
                          </span>
                        </div>
                        <div className="text-right font-mono text-[11px] text-[var(--txt)]">
                          ${p.entryPrice.toLocaleString()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Tokens */}
                {dropdownResults.tokens.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-[var(--brand)] uppercase">
                      Memecoins & Tokens
                    </div>
                    {dropdownResults.tokens.map((t) => (
                      <button
                        key={t.mint}
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false)
                          router.push(`/terminal?mint=${t.mint}`)
                        }}
                        className="flex w-full items-center justify-between rounded-none px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.06]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[10px] font-bold">
                            {t.imageUri ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={t.imageUri}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              t.symbol.slice(0, 2)
                            )}
                          </div>
                          <span className="truncate font-bold text-[var(--txt)]">
                            {t.name}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--mut)]">
                            ${t.symbol}
                          </span>
                        </div>
                        <div className="text-right font-mono text-[11px]">
                          {t.priceChange24h != null && (
                            <span
                              style={{
                                color:
                                  t.priceChange24h >= 0
                                    ? "var(--up)"
                                    : "var(--down)",
                              }}
                            >
                              {t.priceChange24h >= 0 ? "+" : ""}
                              {t.priceChange24h.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* People */}
                {dropdownResults.people.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-[var(--brand)] uppercase">
                      People & KOLs
                    </div>
                    {dropdownResults.people.map((p, idx) => (
                      <button
                        key={p.name + idx}
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false)
                          router.push(`/search?q=${encodeURIComponent(p.name)}`)
                        }}
                        className="flex w-full items-center justify-between rounded-none px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.06]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-xs">👤</span>
                          <span className="truncate font-bold text-[var(--txt)]">
                            {p.name}
                          </span>
                          {p.handle && (
                            <span className="font-mono text-[11px] text-[var(--mut)]">
                              {p.handle}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* News & Signals */}
                {dropdownResults.news.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-[var(--brand)] uppercase">
                      News & Signals
                    </div>
                    {dropdownResults.news.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false)
                          router.push(
                            `/search?q=${encodeURIComponent(searchQuery)}`,
                          )
                        }}
                        className="flex w-full items-center gap-2 truncate rounded-none px-2 py-1 text-left text-xs text-[var(--mut)] transition-colors hover:bg-white/[0.06] hover:text-[var(--txt)]"
                      >
                        <span className="text-[10px]">📡</span>
                        <span className="truncate">{n.title}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Bottom link to view all results */}
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false)
                    router.push(`/search?q=${encodeURIComponent(searchQuery)}`)
                  }}
                  className="mt-1 flex w-full items-center justify-between border-t border-[var(--border)] px-2 pt-2 text-[11px] font-semibold text-[var(--brand)] hover:underline"
                >
                  <span>View all results for &ldquo;{searchQuery}&rdquo;</span>
                  <span>↵</span>
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="ml-auto flex items-center gap-2 sm:gap-2.5 md:ml-0">
            <Link
              href="/search"
              className="hidden cursor-pointer items-center gap-2 rounded-none border border-[var(--line2)] bg-white/[0.02] px-4 py-2 text-xs font-bold text-[var(--txt)] transition-all hover:bg-white/[0.06] sm:inline-flex"
            >
              Inspect CA
            </Link>
            {auth.configured ? (
              auth.authenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex max-w-[110px] items-center truncate rounded-none border border-[var(--line2)] bg-white/[0.02] px-2.5 py-1.5 text-xs font-bold text-[var(--txt)] transition-all hover:bg-white/[0.06] sm:max-w-[150px] sm:px-3 sm:py-2">
                    <span className="truncate">{auth.label}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="border border-[var(--line2)] bg-black text-[var(--txt)]"
                  >
                    {LEGACY_SOLANA_FEATURES_ENABLED && (
                      <DropdownMenuItem
                        render={<Link href="/portfolio">Portfolio</Link>}
                      />
                    )}
                    <DropdownMenuItem
                      onClick={() => auth.setOnboardingOpen(true)}
                    >
                      Edit profile
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void auth.logout()}
                    >
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  type="button"
                  onClick={auth.login}
                  className="inline-flex items-center rounded-none border border-[var(--line2)] bg-white/[0.02] px-2.5 py-1.5 text-xs font-bold text-[var(--txt)] transition-all hover:bg-white/[0.06] sm:px-4 sm:py-2"
                >
                  Connect
                </button>
              )
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center rounded-none border border-[var(--line2)] bg-white/[0.02] px-2.5 py-1.5 text-xs font-bold text-[var(--txt)] transition-all hover:bg-white/[0.06] sm:px-4 sm:py-2"
              >
                Sign in
              </Link>
            )}
            <Link
              href="/agent"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-none bg-gradient-to-r from-[var(--sol2)] to-[var(--cyan)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-on-brand)] shadow-[0_8px_30px_rgba(22,140,255,0.28)] transition-all hover:shadow-[0_12px_38px_rgba(22,140,255,0.4)] sm:gap-2 sm:px-4 sm:py-2"
            >
              Ask Agent
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">{children}</main>

      {/* Footer from HTML template */}
      <footer className="border-t border-[var(--line)] bg-[var(--bg2)]/60 py-10">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div>
              <Link
                href="/"
                className="flex items-center gap-2 text-lg font-extrabold"
              >
                <span>ClawDex</span>
              </Link>
              <p className="mt-2 max-w-[280px] text-xs text-[var(--mut2)]">
                Arc launch intelligence with transparent, on-chain analysis.
              </p>
            </div>

            <div className="flex flex-wrap gap-10 text-xs">
              <div className="flex flex-col gap-2">
                <span className="font-bold tracking-wider text-[var(--mut2)] uppercase">
                  PRODUCT
                </span>
                <Link
                  href="/terminal"
                  className="text-[var(--mut)] hover:text-[var(--txt)]"
                >
                  Terminal
                </Link>
                {LEGACY_SOLANA_FEATURES_ENABLED && (
                  <Link
                    href="/portfolio"
                    className="text-[var(--mut)] hover:text-[var(--txt)]"
                  >
                    Portfolio
                  </Link>
                )}
                <Link
                  href="/watchlist"
                  className="text-[var(--mut)] hover:text-[var(--txt)]"
                >
                  Watchlist
                </Link>
                {PERPS_ENABLED && (
                  <Link
                    href="/perps"
                    className="text-[var(--mut)] hover:text-[var(--txt)]"
                  >
                    Perps
                  </Link>
                )}
                <Link
                  href="/agent"
                  className="text-[var(--mut)] hover:text-[var(--txt)]"
                >
                  AI Agent
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-bold tracking-wider text-[var(--mut2)] uppercase">
                  INTEL
                </span>
                {LEGACY_SOLANA_FEATURES_ENABLED && (
                  <Link
                    href="/terminal?tab=kol"
                    className="text-[var(--mut)] hover:text-[var(--txt)]"
                  >
                    KOL Intel
                  </Link>
                )}
                <Link
                  href="/ecosystem"
                  className="text-[var(--mut)] hover:text-[var(--txt)]"
                >
                  Ecosystem
                </Link>
                <Link
                  href="/search"
                  className="text-[var(--mut)] hover:text-[var(--txt)]"
                >
                  Contract Search
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-bold tracking-wider text-[var(--mut2)] uppercase">
                  COMMUNITY
                </span>
                <a
                  href="https://explorer.arc.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--mut)] hover:text-[var(--txt)]"
                >
                  Arc Explorer
                </a>
                <a
                  href="https://www.circle.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--mut)] hover:text-[var(--txt)]"
                >
                  Circle
                </a>
                <a
                  href="https://www.circle.com/en/usdc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--mut)] hover:text-[var(--txt)]"
                >
                  USDC
                </a>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[var(--line)] pt-5 text-xs text-[var(--mut2)]">
            <span>© 2026 ClawDex · Arc mainnet</span>
            <span>
              Not financial advice. Scores are signals, not guarantees.
            </span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation (thumb-reach) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed right-0 bottom-0 left-0 z-50 flex h-16 items-center justify-around border-t border-[var(--line2)] bg-[rgba(7,8,12,0.92)] px-2 backdrop-blur-md md:hidden"
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors",
                isActive
                  ? "font-semibold text-[var(--sol2)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.icon(isActive)}
              <span className="mt-1 text-[10px] tracking-wider uppercase">
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

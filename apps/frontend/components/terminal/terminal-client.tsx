"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, MotionConfig, motion } from "framer-motion"
import { useRouter, useSearchParams } from "next/navigation"
import { Placeholder } from "@/components/token/TokenPanels"
import { useWatchlist } from "@/hooks/use-watchlist"
import { Segmented } from "@/components/terminal/segmented"
import { Freshness } from "@/components/terminal/freshness"
import { TokenList } from "@/components/terminal/token-list"
import { DetailPanel } from "@/components/terminal/detail-panel"
import { KolPanel } from "@/components/terminal/kol-panel"
import { SignalsPanel } from "@/components/terminal/signals-panel"
import { MajorsPanel } from "@/components/terminal/majors-panel"
import { PerpsPanel } from "@/components/terminal/perps-panel"
import {
  ARC_PORT_MODE,
  LEGACY_SOLANA_FEATURES_ENABLED,
  PERPS_ENABLED,
} from "@/lib/flags"
import {
  CATEGORIES,
  REFRESH_MS,
  type Cat,
  type View,
} from "@/components/terminal/types"
import type { LeaderboardTokenItem } from "@/lib/mock"

export function TerminalClient() {
  const router = useRouter()
  const params = useSearchParams()
  const tabParam = params.get("tab")

  const [view, setView] = useState<View>(
    LEGACY_SOLANA_FEATURES_ENABLED && tabParam === "kol"
      ? "kol"
      : LEGACY_SOLANA_FEATURES_ENABLED && tabParam === "signals"
        ? "signals"
        : PERPS_ENABLED && tabParam === "perps"
          ? "perps"
          : "tokens",
  )
  const [cat, setCat] = useState<Cat>("trending")
  const [timeframe, setTimeframe] = useState<"5m" | "1h" | "6h" | "24h">("24h")
  const [filter, setFilter] = useState("")
  const [socialsOnly, setSocialsOnly] = useState(false)
  const [minLiq, setMinLiq] = useState(0)
  // The watchlist is a top-level view over the same feed, not a separate fetch.
  const watchedOnly = view === "watchlist"
  const showsList = watchedOnly || (view === "tokens" && cat !== "crypto")
  const [tokens, setTokens] = useState<LeaderboardTokenItem[] | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  /** Bumped on every poll so the open detail pane reloads alongside the list. */
  const [tick, setTick] = useState(0)
  const [selected, setSelected] = useState<string | null>(params.get("mint"))
  const { mints: watched, toggle, isWatched } = useWatchlist()

  // A silent reload keeps the current rows on screen and swaps the values in;
  // only a category change clears to skeletons.
  const load = useCallback(
    async (silent: boolean) => {
      if (cat === "crypto") return
      if (!silent) setTokens(null)
      setRefreshing(true)
      try {
        const res = await fetch(`/api/feed?cat=${cat}&timeframe=${timeframe}`, {
          cache: "no-store",
        })
        const json = await res.json()
        setTokens(json.tokens ?? [])
        setSource(json.source ?? null)
        setUpdatedAt(Date.now())
      } catch {
        if (!silent) setTokens([])
      } finally {
        setRefreshing(false)
      }
    },
    [cat, timeframe],
  )

  useEffect(() => {
    // Fire-and-forget: load() is async, its setState calls happen after its
    // own awaits, not synchronously within this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false)
  }, [load])

  // Poll while the tab is actually being looked at; a backgrounded terminal
  // should not keep hitting the chain and the price feeds.
  useEffect(() => {
    if (cat === "crypto") return
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        setTick((n) => n + 1)
        void load(true)
      }
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load, cat])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let list = tokens ?? []
    if (watchedOnly) list = list.filter((t) => watched.includes(t.mint))
    if (socialsOnly)
      list = list.filter((t) => Boolean(t.twitter || t.website || t.telegram))
    if (minLiq > 0) list = list.filter((t) => (t.liquidityUsd ?? 0) >= minLiq)
    if (q) {
      list = list.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.mint.toLowerCase().startsWith(q),
      )
    }
    return list
  }, [tokens, filter, watchedOnly, watched, socialsOnly, minLiq])

  // `selected` is the explicit tap, which drives the mobile drill-down; `active`
  // is what the detail pane renders and falls back to the first row on desktop.
  const active = selected ?? visible[0]?.mint ?? null

  const select = useCallback(
    (mint: string) => {
      setSelected(mint)
      setView("tokens")
      router.replace(`/terminal?mint=${mint}`, { scroll: false })
    },
    [router],
  )

  const back = useCallback(() => {
    setSelected(null)
    router.replace("/terminal", { scroll: false })
  }, [router])

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-5">
      {!ARC_PORT_MODE && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v as View)
              setSelected(null)
            }}
            options={[
              { value: "tokens", label: "Tokens" },
              ...(PERPS_ENABLED ? [{ value: "perps", label: "Perps" }] : []),
              {
                value: "watchlist",
                label: `Watchlist${watched.length ? ` (${watched.length})` : ""}`,
              },
              ...(LEGACY_SOLANA_FEATURES_ENABLED
                ? [
                    { value: "kol", label: "KOL Intel" },
                    { value: "signals", label: "Signals" },
                  ]
                : []),
            ]}
          />
          {showsList && (
            <>
              <Freshness
                updatedAt={updatedAt}
                refreshing={refreshing}
                onRefresh={() => void load(true)}
              />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by ticker, name or token address"
                className="w-full rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2 text-xs outline-none focus:border-[var(--brand)] sm:w-auto sm:max-w-[260px]"
              />
            </>
          )}
        </div>
      )}

      {ARC_PORT_MODE && view === "tokens" && <ArcWorkbench />}

      {view === "tokens" && !ARC_PORT_MODE && (
        <CategoryBar
          cat={cat}
          timeframe={timeframe}
          socialsOnly={socialsOnly}
          minLiq={minLiq}
          onCatChange={(c) => {
            setCat(c)
            setSelected(null)
          }}
          onTimeframeChange={setTimeframe}
          onSocialsOnlyChange={setSocialsOnly}
          onMinLiqChange={setMinLiq}
        />
      )}

      {view === "tokens" && !ARC_PORT_MODE && (
        <p className="mb-3 text-[11px] text-[var(--text-muted)]">
          {CATEGORIES.find((c) => c.value === cat)?.blurb}
        </p>
      )}

      {showsList && !ARC_PORT_MODE && source === "dexscreener" && (
        <p className="mb-3 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
          Showing real-time DexScreener boosted & high-volume Solana pairs.
        </p>
      )}

      {showsList && !ARC_PORT_MODE && source === "arc-indexing" && (
        <p className="mb-3 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
          Arc launch indexing is in progress. Launches and scores will appear
          only after factory events are verified and decoded.
        </p>
      )}

      {PERPS_ENABLED && view === "perps" && <PerpsPanel />}
      {!ARC_PORT_MODE && view === "tokens" && cat === "crypto" && (
        <MajorsPanel />
      )}

      {showsList && (!ARC_PORT_MODE || view !== "tokens") && (
        <div className="gap-4 lg:grid lg:grid-cols-[360px_1fr] xl:grid-cols-[400px_1fr]">
          <div className={selected ? "hidden lg:block" : "block"}>
            <TokenList
              tokens={visible}
              loading={tokens === null}
              active={active}
              watchedOnly={watchedOnly}
              cat={cat}
              timeframe={timeframe}
              isWatched={isWatched}
              onToggleWatch={toggle}
              onSelect={select}
            />
          </div>
          <div className={selected ? "block" : "hidden lg:block"}>
            {active ? (
              <DetailPanel
                key={active}
                mint={active}
                refreshKey={tick}
                onBack={back}
                isWatched={isWatched(active)}
                onToggleWatch={() => toggle(active)}
              />
            ) : (
              <Placeholder>
                {ARC_PORT_MODE
                  ? "Arc launch data will appear here after factory events are verified and indexed."
                  : "Select a token to see its chart, safety checks and holders."}
              </Placeholder>
            )}
          </div>
        </div>
      )}

      {LEGACY_SOLANA_FEATURES_ENABLED && view === "kol" && (
        <KolPanel onOpen={select} />
      )}
      {LEGACY_SOLANA_FEATURES_ENABLED && view === "signals" && (
        <SignalsPanel onOpen={select} />
      )}
    </div>
  )
}

const ARC_WORK_ITEMS = [
  {
    id: "launchpad",
    categories: ["New", "Bonding"],
    title: "Launchpad indexing",
    status: "RAW LOG SCANNER",
    detail:
      "Memespad factory logs can be scanned. Launch decoding is waiting on verified event details.",
    href: "/ecosystem",
    action: "View index status",
    tone: "active",
  },
  {
    id: "new-launches",
    categories: ["New", "Graduated"],
    title: "New launches",
    status: "WAITING FOR DECODER",
    detail:
      "Launch records will appear here after factory events are verified and decoded.",
    href: null,
    action: null,
    tone: "pending",
  },
  {
    id: "markets",
    categories: ["Trending", "Gainers"],
    title: "Trending & gainers",
    status: "MARKET DATA NOT WIRED",
    detail:
      "Arc prices, volume, liquidity, and rankings are not being inferred from another chain or provider.",
    href: null,
    action: null,
    tone: "pending",
  },
  {
    id: "inspection",
    categories: ["Safety"],
    title: "Contract inspection",
    status: "AVAILABLE",
    detail:
      "Read ERC-20 metadata, contract bytecode, and limited ownership indicators. Heuristics are not safety guarantees.",
    href: "/search",
    action: "Inspect an address",
    tone: "available",
  },
  {
    id: "score",
    categories: ["Safety"],
    title: "Risk score",
    status: "PAUSED · NO SCORES",
    detail:
      "The Arc score methodology is proposed, but scoring stays off until launch formats and every input are verified.",
    href: "/#score",
    action: "View proposed methodology",
    tone: "pending",
  },
  {
    id: "token-safety",
    categories: ["Safety"],
    title: "Token safety",
    status: "INPUTS INCOMPLETE",
    detail:
      "Mint controls, pool ownership, and liquidity-lock checks need Arc-specific verified integrations.",
    href: null,
    action: null,
    tone: "pending",
  },
  {
    id: "holders",
    categories: ["Safety", "Most held"],
    title: "Holders & concentration",
    status: "NOT CONNECTED",
    detail:
      "Holder enumeration and top-holder concentration are not yet available for Arc launches.",
    href: null,
    action: null,
    tone: "pending",
  },
  {
    id: "agent",
    categories: ["Agent"],
    title: "Agent analysis",
    status: "PAUSED",
    detail:
      "The agent will not explain a token or invent an assessment without verified Arc launch signals.",
    href: "/agent",
    action: "Open agent status",
    tone: "pending",
  },
  {
    id: "monitoring",
    categories: ["Alerts"],
    title: "Watchlist & alerts",
    status: "WATCHLIST UI AVAILABLE",
    detail:
      "Saved addresses work in this browser. Arc event-based monitoring and alert delivery are not connected yet.",
    href: "/watchlist",
    action: "Open watchlist",
    tone: "available",
  },
  {
    id: "wallets",
    categories: ["Wallets", "Community"],
    title: "Wallet intelligence",
    status: "NOT CONNECTED",
    detail:
      "Wallet labels, activity summaries, and Arc-specific tracking are still to be built.",
    href: null,
    action: null,
    tone: "pending",
  },
  {
    id: "kol",
    categories: ["KOL", "Community"],
    title: "KOL intelligence",
    status: "NO ARC PROVIDER",
    detail:
      "The existing KOL feed is not an Arc data source and is intentionally not shown as Arc activity.",
    href: null,
    action: null,
    tone: "pending",
  },
] satisfies {
  id: string
  categories: readonly string[]
  title: string
  status: string
  detail: string
  href: string | null
  action: string | null
  tone: "active" | "available" | "pending"
}[]

function ArcWorkbench() {
  const categories = [
    "Overview",
    "New",
    "Trending",
    "Gainers",
    "Most held",
    "Graduated",
    "Bonding",
    "Community",
    "Safety",
    "Agent",
    "Wallets",
    "KOL",
    "Alerts",
  ] as const
  const [category, setCategory] =
    useState<(typeof categories)[number]>("Overview")
  const [selectedId, setSelectedId] = useState("launchpad")
  const [query, setQuery] = useState("")
  const filteredItems = ARC_WORK_ITEMS.filter((item) => {
    const inCategory =
      category === "Overview" || item.categories.includes(category)
    const normalized = query.trim().toLowerCase()
    return (
      inCategory &&
      (!normalized ||
        `${item.title} ${item.status} ${item.detail}`
          .toLowerCase()
          .includes(normalized))
    )
  })
  const selectedItem =
    filteredItems.find((item) => item.id === selectedId) ??
    filteredItems[0] ??
    ARC_WORK_ITEMS[0]
  const readyCount = ARC_WORK_ITEMS.filter(
    (item) => item.tone === "available",
  ).length
  const activeCount = ARC_WORK_ITEMS.filter(
    (item) => item.tone === "active",
  ).length
  const plannedCount = ARC_WORK_ITEMS.length - readyCount - activeCount

  const selectCategory = (next: (typeof categories)[number]) => {
    setCategory(next)
    setQuery("")
    const nextFirst =
      next === "Overview"
        ? ARC_WORK_ITEMS[0]
        : ARC_WORK_ITEMS.find((item) => item.categories.includes(next))
    if (nextFirst) setSelectedId(nextFirst.id)
  }

  return (
    <MotionConfig reducedMotion="user">
      <section className="mb-8 overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-raised)]">
        <header className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-5 sm:px-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(22,140,255,0.14),transparent_55%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.15em] text-[var(--brand-bright)] uppercase">
                <span className="size-2 animate-pulse rounded-full bg-[var(--brand-bright)] shadow-[0_0_12px_var(--brand)]" />
                Arc mainnet{" "}
                <span className="text-[var(--text-disabled)]">/</span> Chain
                5042
              </div>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                Market terminal
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
                Explore the Arc intelligence workspaces. Live data and
                verification status are separated from planned features.
              </p>
            </div>
            <Link
              href="/search"
              className="inline-flex min-h-10 items-center gap-2 border border-[var(--brand)]/40 bg-[var(--brand-tint)] px-3 text-xs font-bold text-[var(--brand-bright)] transition-colors hover:bg-[var(--brand)]/20"
            >
              Inspect contract <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-px border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
            <TerminalStatus
              label="Network"
              value="RPC connected"
              tone="active"
            />
            <TerminalStatus
              label="Launch events"
              value="ABI unverified"
              tone="warning"
            />
            <TerminalStatus label="Scoring" value="Paused" tone="blocked" />
            <TerminalStatus
              label="Build coverage"
              value={`${readyCount} live · ${activeCount} active · ${plannedCount} planned`}
              tone="neutral"
            />
          </div>
        </header>

        <div className="grid min-h-[620px] lg:grid-cols-[190px_minmax(0,1fr)_290px]">
          <nav
            aria-label="Terminal categories"
            className="border-b border-[var(--border)] bg-[var(--surface-sunken)] p-2 lg:border-r lg:border-b-0"
          >
            <p className="px-3 py-2 font-mono text-[9px] font-bold tracking-[0.14em] text-[var(--text-disabled)] uppercase">
              Workspaces
            </p>
            <div className="scrollbar-hidden flex gap-1 overflow-x-auto lg:flex-col">
              {categories.map((item) => {
                const count =
                  item === "Overview"
                    ? ARC_WORK_ITEMS.length
                    : ARC_WORK_ITEMS.filter((workItem) =>
                        workItem.categories.includes(item),
                      ).length
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => selectCategory(item)}
                    className={`relative flex min-h-9 shrink-0 items-center justify-between gap-3 px-3 text-left text-xs font-semibold transition-colors ${
                      category === item
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {category === item && (
                      <motion.span
                        layoutId="arc-terminal-category"
                        className="absolute inset-0 border border-[var(--brand)]/30 bg-[var(--brand-tint)]"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 36,
                        }}
                      />
                    )}
                    <span className="relative">{item}</span>
                    <span className="relative font-mono text-[9px] text-[var(--text-disabled)]">
                      {count.toString().padStart(2, "0")}
                    </span>
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="min-w-0 border-b border-[var(--border)] lg:border-r lg:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <h2 className="text-xs font-bold text-[var(--text-primary)]">
                  {category === "Overview" ? "Arc build overview" : category}
                </h2>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {filteredItems.length} workspace
                  {filteredItems.length === 1 ? "" : "s"} · select one to
                  inspect
                </p>
              </div>
              <label className="flex min-h-9 w-full items-center gap-2 border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 sm:w-52">
                <span className="text-xs text-[var(--text-muted)]">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter workspaces"
                  className="w-full bg-transparent text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)]"
                />
              </label>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  No workspaces match this filter.
                </div>
              ) : (
                filteredItems.map((item) => (
                  <motion.button
                    layout
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`relative flex w-full items-start gap-3 px-4 py-4 text-left transition-colors ${
                      selectedItem.id === item.id
                        ? "bg-[var(--brand-tint)]"
                        : "hover:bg-[var(--surface-hover)]"
                    }`}
                    whileTap={{ scale: 0.995 }}
                    transition={{ layout: { duration: 0.2 } }}
                  >
                    {selectedItem.id === item.id && (
                      <motion.span
                        layoutId="arc-terminal-selected"
                        className="absolute inset-y-0 left-0 w-0.5 bg-[var(--brand-bright)]"
                      />
                    )}
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        item.tone === "active"
                          ? "bg-[var(--brand-bright)] shadow-[0_0_10px_var(--brand)]"
                          : item.tone === "available"
                            ? "bg-[var(--score-healthy)]"
                            : "bg-[var(--text-disabled)]"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {item.title}
                        </span>
                        <span className="font-mono text-[8px] text-[var(--text-muted)]">
                          {item.categories[0]}
                        </span>
                      </span>
                      <span className="mt-1.5 block font-mono text-[9px] tracking-wide text-[var(--text-muted)]">
                        {item.status}
                      </span>
                      <span className="mt-2 block text-[11px] leading-relaxed text-[var(--text-disabled)]">
                        {item.detail}
                      </span>
                    </span>
                    <span className="pt-0.5 text-sm text-[var(--text-disabled)]">
                      ›
                    </span>
                  </motion.button>
                ))
              )}
            </div>
          </div>

          <aside className="min-w-0 bg-[var(--surface-sunken)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="font-mono text-[9px] font-bold tracking-[0.14em] text-[var(--text-disabled)] uppercase">
                Workspace inspector
              </p>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selectedItem.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] font-bold tracking-wider text-[var(--brand-bright)] uppercase">
                      {selectedItem.categories[0]}
                    </p>
                    <h3 className="mt-1.5 text-base leading-snug font-bold text-[var(--text-primary)]">
                      {selectedItem.title}
                    </h3>
                  </div>
                  <span
                    className={`mt-0.5 size-2.5 shrink-0 rounded-full ${
                      selectedItem.tone === "active"
                        ? "bg-[var(--brand-bright)] shadow-[0_0_10px_var(--brand)]"
                        : selectedItem.tone === "available"
                          ? "bg-[var(--score-healthy)]"
                          : "bg-[var(--text-disabled)]"
                    }`}
                  />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {selectedItem.detail}
                </p>

                <div className="mt-5 border border-[var(--border)] bg-[var(--surface)]">
                  <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                    <span className="text-[9px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
                      Implementation
                    </span>
                    <span
                      className={`font-mono text-[8px] font-bold ${
                        selectedItem.tone === "available"
                          ? "text-[var(--score-healthy)]"
                          : selectedItem.tone === "active"
                            ? "text-[var(--brand-bright)]"
                            : "text-[var(--text-muted)]"
                      }`}
                    >
                      {selectedItem.tone === "available"
                        ? "AVAILABLE"
                        : selectedItem.tone === "active"
                          ? "IN PROGRESS"
                          : "PLANNED"}
                    </span>
                  </div>
                  <div className="space-y-3 p-3">
                    <InspectorRow
                      label="Data"
                      value={
                        selectedItem.tone === "available"
                          ? "Connected"
                          : selectedItem.tone === "active"
                            ? "Partially connected"
                            : "Not connected"
                      }
                    />
                    <InspectorRow
                      label="Output"
                      value={
                        selectedItem.tone === "available"
                          ? "Live interface"
                          : "No Arc results yet"
                      }
                    />
                    <InspectorRow
                      label="Next step"
                      value={
                        selectedItem.tone === "active"
                          ? "Verify factory event format"
                          : selectedItem.tone === "available"
                            ? "Open the available tool"
                            : "Connect and verify Arc inputs"
                      }
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-[9px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
                    Related categories
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedItem.categories.map((related) => (
                      <span
                        key={related}
                        className="border border-[var(--border)] px-2 py-1 font-mono text-[9px] text-[var(--text-muted)]"
                      >
                        {related}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedItem.href && selectedItem.action && (
                  <Link
                    href={selectedItem.href}
                    className="mt-5 flex min-h-10 w-full items-center justify-center border border-[var(--brand)]/40 bg-[var(--brand-tint)] px-3 text-xs font-bold text-[var(--brand-bright)] transition-colors hover:bg-[var(--brand)]/20"
                  >
                    {selectedItem.action} →
                  </Link>
                )}
              </motion.div>
            </AnimatePresence>
          </aside>
        </div>
      </section>
    </MotionConfig>
  )
}

function TerminalStatus({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "active" | "warning" | "blocked" | "neutral"
}) {
  const color =
    tone === "active"
      ? "var(--brand-bright)"
      : tone === "warning"
        ? "var(--score-caution)"
        : tone === "blocked"
          ? "var(--score-risk)"
          : "var(--text-secondary)"

  return (
    <div className="bg-[var(--surface)] px-3 py-2.5 sm:px-4">
      <p className="text-[9px] font-semibold tracking-wider text-[var(--text-disabled)] uppercase">
        {label}
      </p>
      <p
        className="mt-1 font-mono text-[10px] font-bold sm:text-[11px]"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  )
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="max-w-[65%] text-right text-[10px] font-semibold text-[var(--text-secondary)]">
        {value}
      </span>
    </div>
  )
}

function CategoryBar({
  cat,
  timeframe,
  socialsOnly,
  minLiq,
  onCatChange,
  onTimeframeChange,
  onSocialsOnlyChange,
  onMinLiqChange,
}: {
  cat: Cat
  timeframe: "5m" | "1h" | "6h" | "24h"
  socialsOnly: boolean
  minLiq: number
  onCatChange: (c: Cat) => void
  onTimeframeChange: (tf: "5m" | "1h" | "6h" | "24h") => void
  onSocialsOnlyChange: (v: boolean) => void
  onMinLiqChange: (v: number) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1 overflow-x-auto pb-1 text-xs font-semibold">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => onCatChange(c.value)}
            className="shrink-0 rounded-none border px-3 py-1.5 transition-colors"
            style={
              cat === c.value
                ? {
                    borderColor: "var(--brand)",
                    background: "var(--brand-tint)",
                    color: "var(--text-primary)",
                  }
                : { borderColor: "var(--border)", color: "var(--text-muted)" }
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* DexScreener style timeframe toggle */}
      <div className="flex items-center gap-1 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-0.5 text-[11px] font-bold">
        <span className="px-2 font-mono text-[10px] tracking-wider text-[var(--text-muted)] uppercase">
          TF:
        </span>
        {(["5m", "1h", "6h", "24h"] as const).map((tf) => (
          <button
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            className="rounded-none px-2.5 py-1 uppercase transition-all"
            style={
              timeframe === tf
                ? { background: "var(--brand)", color: "#000", fontWeight: 800 }
                : { color: "var(--text-muted)" }
            }
          >
            {tf}
          </button>
        ))}
      </div>

      {/* DexScreener Filters */}
      <div className="flex items-center gap-1.5 text-xs">
        <button
          onClick={() => onSocialsOnlyChange(!socialsOnly)}
          className={`rounded-none border px-2.5 py-1 text-[11px] font-bold transition-all ${
            socialsOnly
              ? "border-[var(--brand)] bg-[var(--brand-tint)] text-[var(--brand-bright)]"
              : "border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-white"
          }`}
        >
          {socialsOnly ? "✓ With Socials" : "+ Socials"}
        </button>
        <button
          onClick={() =>
            onMinLiqChange(minLiq === 0 ? 10000 : minLiq === 10000 ? 50000 : 0)
          }
          className={`rounded-none border px-2.5 py-1 text-[11px] font-bold transition-all ${
            minLiq > 0
              ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
              : "border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-white"
          }`}
        >
          {minLiq > 0 ? `✓ Liq >$${minLiq / 1000}k` : "+ Min Liq"}
        </button>
      </div>
    </div>
  )
}

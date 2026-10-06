"use client"

import { useEffect, useState } from "react"
import { Placeholder } from "@/components/token/TokenPanels"
import type { KolPayload } from "@/components/terminal/types"
import { ago, shortAddr } from "@/lib/format"

export function KolPanel({ onOpen }: { onOpen: (m: string) => void }) {
  const [data, setData] = useState<KolPayload | null>(null)

  useEffect(() => {
    fetch("/api/kol")
      .then((r) => r.json())
      .then(setData)
      .catch(() =>
        setData({
          trades: [],
          leaderboard: [],
          coordination: [],
          delay: null,
          asOf: null,
          available: false,
        }),
      )
  }, [])

  if (!data) return <Placeholder>Loading KOL data…</Placeholder>
  if (!data.available)
    return (
      <Placeholder>
        KOL data is unavailable right now (feed unreachable or MADEONSOL_API_KEY
        not set).
      </Placeholder>
    )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <CoordinationCard coordination={data.coordination} onOpen={onOpen} />
        <LeaderboardCard leaderboard={data.leaderboard} />
      </div>
      <LiveFeedCard
        trades={data.trades}
        delay={data.delay}
        asOf={data.asOf}
        onOpen={onOpen}
      />
    </div>
  )
}

function CoordinationCard({
  coordination,
  onOpen,
}: {
  coordination: KolPayload["coordination"]
  onOpen: (m: string) => void
}) {
  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-2 text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
        Coordination · 3+ KOLs bought the same token in the last hour
      </div>
      {coordination.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          No coordinated buying right now.
        </p>
      ) : (
        coordination.map((c) => (
          <button
            key={c.mint}
            onClick={() => onOpen(c.mint)}
            className="mb-2 block w-full rounded-none border p-3 text-left text-xs"
            style={{
              borderColor: "var(--score-caution)",
              background: "var(--score-caution-tint)",
            }}
          >
            <strong>{c.kols.length} KOLs</strong> bought{" "}
            <strong>${c.symbol}</strong> ({c.totalSol.toFixed(1)} SOL total,
            latest {ago(c.latestAt)} ago)
            <div className="mt-1 text-[var(--text-muted)]">
              {c.kols.join(", ")}
            </div>
          </button>
        ))
      )}
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        A KOL buy is not a safety signal. Not financial advice.
      </p>
    </div>
  )
}

function LeaderboardCard({
  leaderboard,
}: {
  leaderboard: KolPayload["leaderboard"]
}) {
  return (
    <div className="overflow-x-auto rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-2 text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
        KOL leaderboard · by 7d win rate (MadeOnSol)
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-[10px] text-[var(--text-muted)] uppercase">
          <tr>
            <th className="py-1">KOL</th>
            <th className="text-right">7d</th>
            <th className="text-right">30d</th>
            <th className="text-right">Trades</th>
            <th className="text-right">Bought / sold</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((k) => (
            <tr key={k.wallet} className="border-t border-[var(--border)]">
              <td className="py-1.5 font-semibold">{k.name}</td>
              <td className="cdx-num text-right">
                {k.winrate7d != null ? `${Math.round(k.winrate7d)}%` : "—"}
              </td>
              <td className="cdx-num text-right">
                {k.winrate30d != null ? `${Math.round(k.winrate30d)}%` : "—"}
              </td>
              <td className="cdx-num text-right">{k.trades}</td>
              <td className="cdx-num text-right">
                {k.buySol.toFixed(1)} / {k.sellSol.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        Win rates are MadeOnSol&apos;s. Volume counts only trades in the recent
        feed; realised PnL is not available.
      </p>
    </div>
  )
}

function LiveFeedCard({
  trades,
  delay,
  asOf,
  onOpen,
}: {
  trades: KolPayload["trades"]
  delay: string | null
  asOf: string | null
  onOpen: (m: string) => void
}) {
  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap justify-between gap-2 text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
        <span>Live KOL feed</span>
        <span>
          {delay ? `delayed ${delay}` : ""}
          {asOf ? ` · as of ${new Date(asOf).toLocaleTimeString()}` : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {trades.map((t, i) => (
          <button
            key={t.tx_signature ?? i}
            onClick={() => onOpen(t.token_mint)}
            className="cdx-num flex items-center gap-3 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-[var(--surface-hover)]"
          >
            <span
              className="w-9 font-bold"
              style={{
                color: t.action === "buy" ? "var(--up)" : "var(--down)",
              }}
            >
              {t.action.toUpperCase()}
            </span>
            <span className="w-24 truncate font-sans font-semibold">
              {t.kol_name ?? shortAddr(t.wallet_address)}
            </span>
            <span className="flex-1 truncate font-sans">
              ${t.token_symbol ?? shortAddr(t.token_mint)}
            </span>
            <span>{t.sol_amount.toFixed(2)} SOL</span>
            <span className="w-8 text-right text-[var(--text-muted)]">
              {ago(t.traded_at)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

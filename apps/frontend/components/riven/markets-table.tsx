"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { age, change, changeColor, usd } from "@/lib/riven-format"
import { FlagChip, Why } from "./screener"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"

type SortKey = "age" | "mcap" | "change" | "volume" | "liquidity" | "score"

const VALUE: Record<SortKey, (t: TokenSummary) => number | null> = {
  age: (t) => new Date(t.launchedAt).getTime(),
  mcap: (t) => t.marketCap,
  change: (t) => t.change.h24,
  volume: (t) => t.volume.h24,
  liquidity: (t) => t.liquidityUsd,
  score: (t) => t.score,
}

/** Score cell: an unscored token says so, instead of a bare "…" that looks like a loading glitch. */
function ScoreCell({ t }: { t: TokenSummary }) {
  if (t.score === null)
    return (
      <span className="inline-block max-w-[64px] text-right text-[11px] leading-tight text-[var(--rv-ink-3)]" title="Not scored yet. Open the token and Riven scores it right there. It never guesses a score.">
        Open to score
      </span>
    )
  return <ScoreBadge score={t.score} band={t.band} size="sm" />
}

function TokenCell({ t, now, showWhy }: { t: TokenSummary; now: number; showWhy: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TokenAvatar image={t.image} symbol={t.symbol} address={t.address} size={36} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/token/${t.address}`}
            className="truncate text-[13.5px] font-bold text-[var(--rv-ink)] after:absolute after:inset-0 after:content-[''] hover:underline"
          >
            {t.symbol}
          </Link>
          {t.fake && <FlagChip />}
        </div>
        <p className="truncate text-[11.5px] text-[var(--rv-ink-3)]">
          {t.name}
          <span className="md:hidden"> · {age(t.launchedAt, now)}</span>
        </p>
        {showWhy && <Why t={t} />}
      </div>
    </div>
  )
}

const num = "rv-num text-right text-[13px] text-[var(--rv-ink)]"
const dash = <span className="text-[var(--rv-ink-3)]">—</span>

/**
 * The markets list. A sortable table from md up (click a column to sort the rows shown), compact cards on a phone.
 * Whole rows are links; nothing interactive is nested inside them.
 */
export function MarketsTable({ tokens, serverNow, showWhy = false }: { tokens: TokenSummary[]; serverNow: number; showWhy?: boolean }) {
  const [now, setNow] = useState(serverNow)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo(() => {
    if (!sort) return tokens
    const val = VALUE[sort.key]
    // empty values always sort last, whichever way you sort
    return [...tokens].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      if (x === null && y === null) return 0
      if (x === null) return 1
      if (y === null) return -1
      return (x - y) * sort.dir
    })
  }, [tokens, sort])

  const toggle = (key: SortKey) => setSort((s) => (s?.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }))
  const th = (key: SortKey, label: string, right = true) => {
    const active = sort?.key === key
    return (
      <th scope="col" aria-sort={active ? (sort!.dir === -1 ? "descending" : "ascending") : "none"} className={`px-3 py-2 font-semibold ${right ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => toggle(key)}
          className={`inline-flex items-center gap-1 text-[11px] tracking-wide uppercase hover:text-[var(--rv-ink)] ${active ? "text-[var(--rv-ink)]" : "text-[var(--rv-ink-3)]"}`}
        >
          <span aria-hidden className="w-2 text-[9px]">
            {active ? (sort!.dir === -1 ? "▼" : "▲") : ""}
          </span>
          {label}
        </button>
      </th>
    )
  }

  return (
    <>
      {/* desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[740px] border-collapse">
          <thead className="border-b border-[var(--rv-stroke)]">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-[var(--rv-ink-3)] uppercase">
                Token
              </th>
              {th("age", "Age")}
              {th("mcap", "Mkt cap")}
              {th("change", "24h")}
              {th("volume", "Volume 24h")}
              {th("liquidity", "Liquidity")}
              {th("score", "Score")}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.address} className="relative border-b border-[var(--rv-stroke)] last:border-0 hover:bg-[var(--rv-row-hover)]">
                <td className="max-w-[300px] px-3 py-2.5">
                  <TokenCell t={t} now={now} showWhy={showWhy} />
                </td>
                <td className={`${num} text-[12px] !text-[var(--rv-ink-2)]`}>{age(t.launchedAt, now)}</td>
                <td className={num}>{t.marketCap === null ? dash : usd(t.marketCap)}</td>
                <td className="rv-num px-3 text-right text-[13px] font-semibold" style={{ color: changeColor(t.change.h24) }}>
                  {t.change.h24 === null ? dash : change(t.change.h24)}
                </td>
                <td className={num}>{t.volume.h24 === null ? dash : usd(t.volume.h24)}</td>
                <td className={num}>{t.liquidityUsd === null ? dash : usd(t.liquidityUsd)}</td>
                <td className="px-3 text-right">
                  <ScoreCell t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* phone */}
      <ol className="divide-y divide-[var(--rv-stroke)] md:hidden">
        {rows.map((t) => (
          <li key={t.address} className="relative flex items-center gap-3 px-3 py-2.5 active:bg-[var(--rv-row-hover)]">
            <div className="min-w-0 flex-1">
              <TokenCell t={t} now={now} showWhy={showWhy} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="rv-num text-[13px] font-bold text-[var(--rv-ink)]">{t.marketCap === null ? dash : usd(t.marketCap)}</span>
              <span className="rv-num text-[11.5px] font-semibold" style={{ color: changeColor(t.change.h24) }}>
                {t.change.h24 === null ? "—" : change(t.change.h24)}
              </span>
            </div>
            <div className="flex w-[58px] shrink-0 justify-end">
              <ScoreCell t={t} />
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

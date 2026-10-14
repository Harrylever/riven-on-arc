"use client"

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
  type Column,
  type SortingState,
} from "@tanstack/react-table"
import Link from "next/link"
import { createContext, useContext, useEffect, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { age, change, changeColor, usd } from "@/lib/riven-format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FlagChip, Why } from "./screener"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { Button } from "@/components/ui/button"
import { Hint } from "@/components/riven/hint"

/** What the cells need from the table's owner: the clock (ages tick) and whether to show the evidence line. */
const View = createContext<{ now: number; showWhy: boolean }>({
  now: 0,
  showWhy: false,
})

// Sorting is the only table feature used, so only it is registered. A missing value (undefined) always sorts last.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
})
const col = createColumnHelper<typeof features, TokenSummary>()

const orUndefined = (v: number | null) => v ?? undefined
const sortable = {
  sortFn: "basic",
  sortUndefined: "last",
  sortDescFirst: true,
} as const

/** Score cell: an unscored token says so, instead of a bare "…" that looks like a loading glitch. */
function ScoreCell({ t }: { t: TokenSummary }) {
  if (t.score === null)
    return (
      <Hint text="Not scored yet. Open the token and Riven scores it right there. It never guesses a score.">
        <span className="inline-block max-w-[64px] text-right text-[11px] leading-tight text-[var(--rv-ink-3)]">
          Open to score
        </span>
      </Hint>
    )
  return <ScoreBadge score={t.score} band={t.band} size="sm" />
}

function TokenCell({ t }: { t: TokenSummary }) {
  const { now, showWhy } = useContext(View)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TokenAvatar
        image={t.image}
        symbol={t.symbol}
        address={t.address}
        size={36}
      />
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
          <span className="lg:hidden"> · {age(t.launchedAt, now)}</span>
        </p>
        {showWhy && <Why t={t} />}
      </div>
    </div>
  )
}

const Dash = () => <span className="text-[var(--rv-ink-3)]">—</span>
const num = "rv-num text-[13px] text-[var(--rv-ink)]"

/** A column header that sorts: click for highest first, again for lowest first, again to clear. */
// The header only toggles sorting, so it does not care what type of value the column holds (number, or number | undefined).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SortHeader({
  column,
  label,
}: {
  column: Column<typeof features, TokenSummary, any>
  label: string
}) {
  const sorted = column.getIsSorted()
  return (
    <Button
      variant="plain"
      size="bare"
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={`inline-flex items-center gap-1 text-[11px] tracking-wide uppercase hover:text-[var(--rv-ink)] ${
        sorted ? "text-[var(--rv-ink)]" : "text-[var(--rv-ink-3)]"
      }`}
    >
      <span aria-hidden className="w-2 text-[9px]">
        {sorted === "desc" ? "▼" : sorted === "asc" ? "▲" : ""}
      </span>
      {label}
    </Button>
  )
}

const columns = col.columns([
  col.display({
    id: "token",
    header: "Token",
    cell: ({ row }) => <TokenCell t={row.original} />,
  }),
  col.accessor((t) => new Date(t.launchedAt).getTime(), {
    id: "age",
    ...sortable,
    header: ({ column }) => <SortHeader column={column} label="Age" />,
    cell: function AgeCell({ row }) {
      return <AgeText iso={row.original.launchedAt} />
    },
  }),
  col.accessor((t) => orUndefined(t.marketCap), {
    id: "mcap",
    ...sortable,
    header: ({ column }) => <SortHeader column={column} label="Mkt cap" />,
    cell: ({ row }) =>
      row.original.marketCap === null ? (
        <Dash />
      ) : (
        <span className={num}>{usd(row.original.marketCap)}</span>
      ),
  }),
  col.accessor((t) => orUndefined(t.change.h24), {
    id: "change",
    ...sortable,
    header: ({ column }) => <SortHeader column={column} label="24h" />,
    cell: ({ row }) =>
      row.original.change.h24 === null ? (
        <Dash />
      ) : (
        <span
          className="rv-num text-[13px] font-semibold"
          style={{ color: changeColor(row.original.change.h24) }}
        >
          {change(row.original.change.h24)}
        </span>
      ),
  }),
  col.accessor((t) => orUndefined(t.volume.h24), {
    id: "volume",
    ...sortable,
    header: ({ column }) => <SortHeader column={column} label="Volume 24h" />,
    cell: ({ row }) =>
      row.original.volume.h24 === null ? (
        <Dash />
      ) : (
        <span className={num}>{usd(row.original.volume.h24)}</span>
      ),
  }),
  col.accessor((t) => orUndefined(t.liquidityUsd), {
    id: "liquidity",
    ...sortable,
    header: ({ column }) => <SortHeader column={column} label="Liquidity" />,
    cell: ({ row }) =>
      row.original.liquidityUsd === null ? (
        <Dash />
      ) : (
        <span className={num}>{usd(row.original.liquidityUsd)}</span>
      ),
  }),
  col.accessor((t) => orUndefined(t.score), {
    id: "score",
    ...sortable,
    header: ({ column }) => <SortHeader column={column} label="Score" />,
    cell: ({ row }) => <ScoreCell t={row.original} />,
  }),
])

function AgeText({ iso }: { iso: string }) {
  const { now } = useContext(View)
  return (
    <span className="rv-num text-[12px] text-[var(--rv-ink-2)]">
      {age(iso, now)}
    </span>
  )
}

/**
 * The markets list: market data and the Riven score. From 1024px up it is a sortable table (click a column to sort the
 * rows shown); below that, compact rows. Whole rows are links and nothing interactive is nested inside them.
 */
export function MarketsTable({
  tokens,
  serverNow,
  showWhy = false,
}: {
  tokens: TokenSummary[]
  serverNow: number
  showWhy?: boolean
}) {
  const [now, setNow] = useState(serverNow)
  const [sorting, setSorting] = useState<SortingState>([])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  const table = useTable({
    features,
    columns,
    data: tokens,
    state: { sorting },
    onSortingChange: setSorting,
  })
  const rows = table.getRowModel().rows

  return (
    <View.Provider value={{ now, showWhy }}>
      {/* desktop */}
      <div className="hidden lg:block">
        <Table className="min-w-[760px] text-[13px]">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow
                key={group.id}
                className="border-b border-[var(--rv-stroke)] hover:bg-transparent"
              >
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "desc"
                          ? "descending"
                          : sorted === "asc"
                            ? "ascending"
                            : header.column.getCanSort()
                              ? "none"
                              : undefined
                      }
                      className={`h-auto px-3 py-2 ${header.id === "token" ? "text-left text-[11px] font-semibold tracking-wide text-[var(--rv-ink-3)]" : "text-right"}`}
                    >
                      {header.isPlaceholder ? null : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className="relative border-b border-[var(--rv-stroke)] last:border-0 hover:bg-[var(--rv-row-hover)]"
              >
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={`px-3 py-2.5 ${cell.column.id === "token" ? "max-w-[300px] whitespace-normal" : "text-right"}`}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* phone and tablet */}
      <ol className="divide-y divide-[var(--rv-stroke)] lg:hidden">
        {tokens.map((t) => (
          <li
            key={t.address}
            className="relative flex items-center gap-3 px-3 py-2.5 active:bg-[var(--rv-row-hover)]"
          >
            <div className="min-w-0 flex-1">
              <TokenCell t={t} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="rv-num text-[13px] font-bold text-[var(--rv-ink)]">
                {t.marketCap === null ? <Dash /> : usd(t.marketCap)}
              </span>
              <span
                className="rv-num text-[11.5px] font-semibold"
                style={{ color: changeColor(t.change.h24) }}
              >
                {t.change.h24 === null ? "—" : change(t.change.h24)}
              </span>
            </div>
            <div className="flex w-[58px] shrink-0 justify-end">
              <ScoreCell t={t} />
            </div>
          </li>
        ))}
      </ol>
    </View.Provider>
  )
}

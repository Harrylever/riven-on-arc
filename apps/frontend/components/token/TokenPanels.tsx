"use client"

import { useState } from "react"
import type { HolderRow, HoldersPayload } from "@/app/api/terminal/[mint]/route"
import { shortAddr } from "@/lib/format"
import { HugeiconsIcon } from "@hugeicons/react"
import { StarIcon } from "@hugeicons/core-free-icons"

const SOL_MINT = "So11111111111111111111111111111111111111112"

/** Price chart. DexScreener only has a pair once the token trades, so this is
 * rendered from the pair address rather than the mint. */
export function TokenChart({ pairAddress }: { pairAddress?: string | null }) {
  if (!pairAddress) {
    return (
      <Placeholder>
        No chart yet. DexScreener lists a pair once the token has traded — new
        bonding-curve launches can take a few minutes to appear.
      </Placeholder>
    )
  }
  return (
    <div
      className="overflow-hidden rounded-none border border-[var(--border)]"
      style={{ height: 420 }}
    >
      <iframe
        key={pairAddress}
        src={`https://dexscreener.com/solana/${pairAddress}?embed=1&theme=dark&info=0&trades=0`}
        title="Price chart"
        loading="lazy"
        className="h-full w-full"
        style={{ border: 0 }}
      />
    </div>
  )
}

/** Bubblemaps holder-cluster view. Without a partner id the embed runs in its
 * own demo mode, which covers only some tokens — so failure is expected and
 * surfaced rather than hidden. */
export function BubbleMap({ mint }: { mint: string }) {
  const partnerId = process.env.NEXT_PUBLIC_BUBBLEMAPS_PARTNER_ID
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <Placeholder>
        Bubblemaps has no cluster map for this token yet.{" "}
        <a
          href={`https://app.bubblemaps.io/sol/token/${mint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--brand)] hover:underline"
        >
          Open on Bubblemaps
        </a>
      </Placeholder>
    )
  }

  const src = `https://iframe.bubblemaps.io/map?address=${mint}&chain=solana${partnerId ? `&partnerId=${partnerId}` : ""}`
  return (
    <div
      className="overflow-hidden rounded-none border border-[var(--border)]"
      style={{ height: 360 }}
    >
      <iframe
        key={mint}
        src={src}
        title="Holder cluster map"
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full"
        style={{ border: 0 }}
      />
    </div>
  )
}

export function HoldersPanel({
  holders,
  mint,
}: {
  holders: HoldersPayload | null
  mint: string
}) {
  if (!holders) {
    return (
      <Placeholder>
        ClawDex has not read this token&apos;s holders yet.
      </Placeholder>
    )
  }

  const counted = holders.rows.filter((r) => !r.excluded)
  const excluded = holders.rows.filter((r) => r.excluded)
  // Absolute shares are often a fraction of a percent, which would render every
  // bar at the same hairline width. Bars are scaled to the largest holder and
  // that scale is stated; the true percentage stays on every row.
  const domain = Math.max(...counted.slice(0, 10).map((h) => h.pct), 0.0001)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
            Top 10 hold
          </div>
          <div
            className="cdx-num text-2xl font-extrabold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {(holders.top10Pct * 100).toFixed(1)}%
          </div>
        </div>
        <div className="text-right text-[11px] text-[var(--text-muted)]">
          of circulating supply
          <br />
          as of {new Date(holders.checkedAt).toLocaleTimeString()}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {counted.slice(0, 10).map((h, i) => (
          <HolderBar key={h.address} rank={i + 1} holder={h} domain={domain} />
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-muted)]">
        Bars are scaled to the largest holder ({(domain * 100).toFixed(1)}%) so
        the spread is readable; the figure on each row is the true share of
        supply.
      </p>

      {excluded.length > 0 && (
        <details className="rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-[var(--text-muted)]">
            {excluded.length} account{excluded.length === 1 ? "" : "s"} excluded
            from concentration
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Bonding-curve, pool and incinerator accounts hold supply that no
            person controls. Counting them would make every healthy launch look
            concentrated, so they are excluded from the top-10 figure.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {excluded.map((h) => (
              <div
                key={h.address}
                className="cdx-num flex justify-between text-[11px] text-[var(--text-muted)]"
              >
                <span>{shortAddr(h.address)}</span>
                <span>{(h.pct * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <BubbleMap mint={mint} />
    </div>
  )
}

function HolderBar({
  rank,
  holder,
  domain,
}: {
  rank: number
  holder: HolderRow
  domain: number
}) {
  const pct = holder.pct * 100
  // A single wallet over 10% of supply can move the price on its own.
  const heavy = pct >= 10
  const width = Math.min(100, Math.max(2, (holder.pct / domain) * 100))
  return (
    <div className="flex items-center gap-3">
      <span className="cdx-num w-4 text-right text-[10px] text-[var(--text-muted)]">
        {rank}
      </span>
      <a
        href={`https://solscan.io/account/${holder.owner ?? holder.address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="cdx-num w-[104px] shrink-0 text-[11px] text-[var(--text-secondary)] hover:text-[var(--brand)]"
      >
        {shortAddr(holder.owner ?? holder.address)}
      </a>
      <div className="h-2 flex-1 overflow-hidden rounded-none bg-[var(--surface-sunken)]">
        <div
          className="h-full rounded-none"
          style={{
            width: `${width}%`,
            background: heavy ? "var(--score-caution)" : "var(--brand)",
          }}
        />
      </div>
      <span className="cdx-num w-12 text-right text-[11px] font-semibold">
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

/** Outbound trade links. ClawDex has no swap of its own yet, so these hand the
 * user to a venue rather than pretending to execute. */
export function TradeLinks({
  mint,
  launchpad,
}: {
  mint: string
  launchpad?: string | null
}) {
  const links = [
    ...(launchpad === "PUMPFUN" || launchpad === "CLAWPUMP"
      ? [{ label: "pump.fun", href: `https://pump.fun/coin/${mint}` }]
      : []),
    { label: "Jupiter", href: `https://jup.ag/swap/${SOL_MINT}-${mint}` },
    { label: "DexScreener", href: `https://dexscreener.com/solana/${mint}` },
    { label: "Solscan", href: `https://solscan.io/token/${mint}` },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l, i) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-none px-3 py-1.5 text-xs font-bold transition-colors"
          style={
            i === 0
              ? { background: "var(--brand)", color: "var(--text-on-brand)" }
              : {
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-primary)",
                }
          }
        >
          {l.label} ↗
        </a>
      ))}
    </div>
  )
}

export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-6 text-center text-xs leading-relaxed text-[var(--text-muted)]">
      {children}
    </div>
  )
}

export function WatchStar({
  watched,
  onToggle,
}: {
  watched: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
      aria-pressed={watched}
      className="grid size-7 shrink-0 place-items-center rounded-none transition-colors hover:bg-[var(--surface-hover)]"
      style={{ color: watched ? "var(--score-caution)" : "var(--text-muted)" }}
    >
      <HugeiconsIcon
        icon={StarIcon}
        size={15}
        fill={watched ? "currentColor" : "none"}
        color="currentColor"
        strokeWidth={2}
      />
    </button>
  )
}

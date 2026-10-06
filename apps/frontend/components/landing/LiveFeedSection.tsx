import Link from "next/link"
import type { LeaderboardResponse, LeaderboardTokenItem } from "@/lib/api"
import { ago, dexLabel, launchpadLabel, pct, usd } from "@/lib/format"
import { FeedTokenCard } from "@/components/landing/FeedTokenCard"

export function LiveFeedSection({
  tab,
  displayTokens,
  source,
}: {
  tab: string
  displayTokens: LeaderboardTokenItem[]
  source: LeaderboardResponse["source"]
}) {
  return (
    <section id="terminal" className="border-t border-[var(--border)] py-20">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--brand)] uppercase">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--brand)",
                  display: "block",
                }}
              />
              Live now
            </div>
            <h2
              className="text-[24px] font-bold tracking-tight sm:text-[30px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              The terminal
            </h2>
          </div>
          <div className="flex gap-1 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-1 text-xs font-semibold">
            <Link
              href="/?tab=trending#terminal"
              className="rounded-none px-3 py-1.5"
              style={
                tab === "trending"
                  ? {
                      background: "var(--surface-raised)",
                      color: "var(--text-primary)",
                    }
                  : { color: "var(--text-muted)" }
              }
            >
              Trending
            </Link>
            <Link
              href="/?tab=new#terminal"
              className="rounded-none px-3 py-1.5"
              style={
                tab === "new"
                  ? {
                      background: "var(--surface-raised)",
                      color: "var(--text-primary)",
                    }
                  : { color: "var(--text-muted)" }
              }
            >
              New
            </Link>
          </div>
        </div>

        {source === "dexscreener" && (
          <p className="mt-4 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
            ClawDex&apos;s own index has no scored launches yet. Showing
            DexScreener&apos;s latest listed tokens, unscored and not ranked by
            ClawDex.
          </p>
        )}

        {source === "arc-indexing" && (
          <p className="mt-4 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
            Arc indexing is pending factory event verification. No launch
            records or token scores are available yet.
          </p>
        )}

        {displayTokens.length === 0 ? (
          <div className="mt-8 rounded-none border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
            {source === "arc-indexing"
              ? "No Arc launch records are available yet. ClawDex will show launches after factory events are verified and indexed."
              : "No tokens available right now. Data sources are unreachable, so nothing is shown rather than placeholder data."}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayTokens.slice(0, 9).map((t) => (
              <TokenCardLink key={t.tokenId || t.mint} token={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function TokenCardLink({ token }: { token: LeaderboardTokenItem }) {
  const stats = [
    { label: "MC", value: usd(token.marketCapUsd) },
    { label: "LIQ", value: usd(token.liquidityUsd) },
    { label: "VOL", value: usd(token.volume24hUsd) },
    {
      label: "24H",
      value: pct(token.priceChange24h),
      tone:
        token.priceChange24h != null
          ? token.priceChange24h >= 0
            ? ("up" as const)
            : ("down" as const)
          : undefined,
    },
  ]
  const launchpad = launchpadLabel(token.launchpad)
  const dex = dexLabel(token.dex)
  const badges = [
    ...(launchpad ? [{ label: launchpad, tone: "neutral" as const }] : []),
    ...(dex ? [{ label: dex, tone: "neutral" as const }] : []),
  ]
  return (
    <FeedTokenCard
      mint={token.mint}
      symbol={token.symbol}
      name={token.name}
      imageUri={token.imageUri}
      score={token.score}
      changes={{
        priceChange5m: token.priceChange5m,
        priceChange1h: token.priceChange1h,
        priceChange6h: token.priceChange6h,
        priceChange24h: token.priceChange24h,
      }}
      stats={stats}
      badges={badges}
      age={token.firstSeenAt ? ago(token.firstSeenAt) : undefined}
    />
  )
}

export function LiveFeedSkeleton({ tab = "trending" }: { tab?: string }) {
  return (
    <section id="terminal" className="border-t border-[var(--border)] py-20">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--brand)] uppercase">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--brand)",
                  display: "block",
                }}
              />
              Live now
            </div>
            <h2
              className="text-[24px] font-bold tracking-tight sm:text-[30px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              The terminal
            </h2>
          </div>
          <div className="flex gap-1 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-1 text-xs font-semibold">
            <span
              className="rounded-none px-3 py-1.5"
              style={
                tab === "trending"
                  ? {
                      background: "var(--surface-raised)",
                      color: "var(--text-primary)",
                    }
                  : { color: "var(--text-muted)" }
              }
            >
              Trending
            </span>
            <span
              className="rounded-none px-3 py-1.5"
              style={
                tab === "new"
                  ? {
                      background: "var(--surface-raised)",
                      color: "var(--text-primary)",
                    }
                  : { color: "var(--text-muted)" }
              }
            >
              New
            </span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[148px] animate-pulse rounded-none border border-[var(--border)] bg-[var(--surface)] p-4"
            />
          ))}
        </div>
      </div>
    </section>
  )
}

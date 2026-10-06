import Link from "next/link"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  AlertDiamondIcon,
  ArrowUpRight01Icon,
} from "@hugeicons/core-free-icons"
import {
  ScoreBadge,
  VerdictLine,
  SignalRow,
  StatRow,
  scoreBand,
} from "@/components/ds"
import { usd, pct, launchpadLabel } from "@/lib/format"
import type { TokenFacts } from "@/lib/agent"
import type { DeployerProfile } from "@/lib/deployer"
import type { LeaderboardTokenItem } from "@/lib/api"
import type { KolCoordinationGroup } from "@/lib/screen"

const BAND_COLOR: Record<string, string> = {
  healthy: "var(--score-healthy)",
  caution: "var(--score-caution)",
  risk: "var(--score-risk)",
  unknown: "var(--score-unknown)",
}

const BAND_TINT: Record<string, string> = {
  healthy: "var(--score-healthy-tint)",
  caution: "var(--score-caution-tint)",
  risk: "var(--score-risk-tint)",
  unknown: "var(--score-unknown-tint)",
}

/** A 0-10 sub-score rendered as a labelled progress bar instead of a bare number. */
export function MiniBar({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  const band = scoreBand(value != null ? value * 10 : null)
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-[var(--text-muted)]">
        <span>{label}</span>
        <span className="font-mono font-semibold text-[var(--text-primary)]">
          {value != null ? `${value.toFixed(1)}/10` : "not checked"}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-none bg-[var(--surface)]">
        <div
          className="h-full rounded-none transition-all"
          style={{
            width: `${Math.min(100, Math.max(0, (value ?? 0) * 10))}%`,
            background: BAND_COLOR[band],
          }}
        />
      </div>
    </div>
  )
}

const REPUTATION_META: Record<
  DeployerProfile["reputation"],
  { label: string; band: "healthy" | "caution" | "risk" }
> = {
  VERIFIED_SAFE: { label: "Verified track record", band: "healthy" },
  CAUTION: { label: "Caution — limited history", band: "caution" },
  FLAGGED_SCAMMER: { label: "Flagged — serial rugs", band: "risk" },
}

export function DeployerStrip({ deployer }: { deployer: DeployerProfile }) {
  const meta = REPUTATION_META[deployer.reputation]
  return (
    <div className="flex flex-col gap-2.5 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
          Deployer track record
        </span>
        <span
          className="rounded-none border px-2 py-0.5 text-[10px] font-bold"
          style={{
            borderColor: BAND_COLOR[meta.band],
            color: BAND_COLOR[meta.band],
            background: BAND_TINT[meta.band],
          }}
        >
          {meta.label}
        </span>
      </div>
      <StatRow
        size="sm"
        items={[
          { label: "Launches", value: deployer.totalLaunches },
          { label: "Graduated", value: `${deployer.graduationRate}%` },
          {
            label: "Rugs",
            value: deployer.rugCount,
            tone: deployer.rugCount > 0 ? "down" : undefined,
          },
          { label: "Avg return", value: `${deployer.averageReturn}x` },
          { label: "Max return", value: `${deployer.maxReturn}x` },
        ]}
      />
      {deployer.isFreshWallet && deployer.funderAddress ? (
        <p
          className="text-[11px] leading-relaxed"
          style={{
            color: deployer.funderIsFlagged
              ? "var(--score-risk)"
              : "var(--text-muted)",
          }}
        >
          Fresh wallet, funded by {deployer.funderAddress.slice(0, 4)}…
          {deployer.funderAddress.slice(-4)}
          {deployer.funderClusterNote ? ` — ${deployer.funderClusterNote}` : ""}
          {deployer.funderIsFlagged ? " (flagged cluster)" : ""}
        </p>
      ) : null}
    </div>
  )
}

/** Renders a grounded token analysis (score gauge, sub-score bars, authority
 * chips, market stats, deployer record) instead of the equivalent numbers as
 * prose — the numeric facts are graphical, the model's own text (when there
 * is one) is kept short and shown separately below. */
export function AgentAnswerCard({
  facts,
  narrative,
  mode,
  className,
}: {
  facts: TokenFacts
  narrative?: string
  mode?: "llm" | "facts"
  className?: string
}) {
  const isRealToken = facts.token.symbol !== "DEV"
  const scoreOutOf100 = facts.score ? facts.score.score * 10 : null

  return (
    <div className={cn("flex w-full flex-col gap-3 text-xs", className)}>
      {isRealToken && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/token/${facts.token.mint}`}
              className="inline-flex items-baseline gap-1 font-heading text-sm font-bold text-[var(--text-primary)] hover:text-[var(--brand)]"
            >
              ${facts.token.symbol}
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                className="size-3"
                strokeWidth={2}
              />
            </Link>
            <div className="truncate text-[11px] text-[var(--text-muted)]">
              {facts.token.name}
              {launchpadLabel(facts.token.launchpad)
                ? ` · ${launchpadLabel(facts.token.launchpad)}`
                : ""}
            </div>
          </div>
          <ScoreBadge score={scoreOutOf100} size="md" showMax />
        </div>
      )}

      {facts.score ? (
        <>
          <VerdictLine
            score={scoreOutOf100}
            verdict={facts.score.verdict.replace(/_/g, " ").toLowerCase()}
            size="sm"
          />
          <div className="flex flex-col gap-2.5 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
            <MiniBar
              label="Holder distribution"
              value={facts.score.concentration}
            />
            <MiniBar label="Attributed burns" value={facts.score.burns} />
            <MiniBar label="Liquidity health" value={facts.score.liquidity} />
          </div>
        </>
      ) : isRealToken ? (
        <p className="text-[11px] text-[var(--text-muted)]">
          Not scored yet — ClawDex has not collected enough on-chain data for
          this token.
        </p>
      ) : null}

      {facts.authority && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <SignalRow
            icon={
              facts.authority.mintAuthorityRevoked
                ? CheckmarkCircle02Icon
                : AlertDiamondIcon
            }
            state={facts.authority.mintAuthorityRevoked ? "healthy" : "risk"}
            label="Mint authority"
            value={facts.authority.mintAuthorityRevoked ? "Revoked" : "Active"}
          />
          <SignalRow
            icon={
              facts.authority.freezeAuthorityRevoked
                ? CheckmarkCircle02Icon
                : AlertDiamondIcon
            }
            state={facts.authority.freezeAuthorityRevoked ? "healthy" : "risk"}
            label="Freeze authority"
            value={
              facts.authority.freezeAuthorityRevoked ? "Revoked" : "Active"
            }
          />
          <SignalRow
            icon={
              facts.authority.lpLockedOrBurned
                ? CheckmarkCircle02Icon
                : AlertDiamondIcon
            }
            state={facts.authority.lpLockedOrBurned ? "healthy" : "risk"}
            label="LP lock"
            value={facts.authority.lpLockedOrBurned ? "Locked" : "Unlocked"}
          />
        </div>
      )}

      {facts.market && (
        <StatRow
          size="sm"
          items={[
            { label: "Market cap", value: usd(facts.market.marketCapUsd) },
            { label: "Liquidity", value: usd(facts.market.liquidityUsd) },
            { label: "24h volume", value: usd(facts.market.volume24hUsd) },
            {
              label: "24h change",
              value: pct(facts.market.priceChange24h),
              tone:
                facts.market.priceChange24h == null
                  ? undefined
                  : facts.market.priceChange24h >= 0
                    ? "up"
                    : "down",
            },
          ]}
        />
      )}

      {facts.deployer && <DeployerStrip deployer={facts.deployer} />}

      {mode === "llm" && narrative ? (
        <p className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
          {narrative}
        </p>
      ) : null}

      <p className="text-[10px] text-[var(--text-muted)]">
        Not financial advice. DYOR.
      </p>
    </div>
  )
}

/** A market-question answer: token list rendered as score-badge cards, not a
 * dashed list of numbers in prose. */
export function AgentTokenList({ tokens }: { tokens: LeaderboardTokenItem[] }) {
  if (!tokens.length) {
    return (
      <p className="text-[11px] text-[var(--text-muted)]">
        No token in the current feed matches those filters.
      </p>
    )
  }
  return (
    <div className="flex w-full flex-col gap-2">
      {tokens.map((t) => (
        <Link
          key={t.mint}
          href={`/token/${t.mint}`}
          className="flex items-center gap-3 rounded-none border border-[var(--border)] bg-[var(--surface)] p-2.5 transition-colors hover:border-[var(--brand)]"
        >
          <ScoreBadge score={t.score} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-heading text-xs font-bold text-[var(--text-primary)]">
                ${t.symbol}
              </span>
              <span className="truncate text-[11px] text-[var(--text-muted)]">
                {t.name}
              </span>
            </div>
            <StatRow
              size="sm"
              items={[
                { label: "MCAP", value: usd(t.marketCapUsd) },
                { label: "LIQ", value: usd(t.liquidityUsd) },
                {
                  label: "24H",
                  value: pct(t.priceChange24h),
                  tone:
                    t.priceChange24h == null
                      ? undefined
                      : t.priceChange24h >= 0
                        ? "up"
                        : "down",
                },
              ]}
            />
          </div>
        </Link>
      ))}
    </div>
  )
}

/** KOL coordination result as chips instead of a dashed text list. */
export function AgentKolList({ groups }: { groups: KolCoordinationGroup[] }) {
  if (!groups.length) {
    return (
      <p className="text-[11px] text-[var(--text-muted)]">
        No token has 3 or more tracked KOL wallets buying in the last hour.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => (
        <div
          key={g.symbol}
          className="rounded-none border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px]"
        >
          <span className="font-heading font-bold text-[var(--text-primary)]">
            ${g.symbol}
          </span>
          <span className="ml-1.5 text-[var(--text-muted)]">
            {g.kolCount} KOLs · {g.totalSol.toFixed(1)} SOL
          </span>
        </div>
      ))}
    </div>
  )
}

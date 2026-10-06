"use client"

import { useEffect, useState } from "react"
import { ScoreBadge, TokenAvatar } from "@/components/ds"
import { Placeholder, WatchStar } from "@/components/token/TokenPanels"
import { KolFloatingBubble } from "@/components/token/KolFloatingBubble"
import { InstantBuyModal } from "@/components/token/InstantBuyModal"
import { SingleLineChart } from "@/components/token/SingleLineChart"
import { TokenFootTabs } from "@/components/token/TokenFootTabs"
import { Chip } from "@/components/terminal/chip"
import { TokenDetailSkeleton } from "@/components/terminal/token-detail-skeleton"
import type { DetailPayload } from "@/components/terminal/types"
import {
  calculateTokenRiskAudit,
  getDeployerProfile,
  type AuditCheckItem,
  type TokenRiskAudit,
} from "@/lib/deployer"
import { dexLabel, launchpadLabel, pct, shortAddr, usd } from "@/lib/format"
import { toast } from "@/components/ui/toast"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

export function DetailPanel({
  mint,
  refreshKey,
  onBack,
  isWatched,
  onToggleWatch,
}: {
  mint: string
  refreshKey: number
  onBack: () => void
  isWatched: boolean
  onToggleWatch: () => void
}) {
  const [data, setData] = useState<DetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [audit, setAudit] = useState<TokenRiskAudit | null>(null)
  const [copiedCa, setCopiedCa] = useState(false)

  const handleCopyCa = async () => {
    const targetMint = data?.detail?.token?.mint ?? mint
    if (!targetMint) return
    try {
      await navigator.clipboard.writeText(targetMint)
      setCopiedCa(true)
      toast.add({
        type: "success",
        title: "Copied to clipboard",
        description: `CA: ${shortAddr(targetMint)}`,
        timeout: 2500,
      })
      setTimeout(() => setCopiedCa(false), 2000)
    } catch (err) {
      console.error("Failed to copy CA:", err)
      toast.add({
        type: "error",
        title: "Failed to copy",
        description: "Clipboard access was denied",
        timeout: 2500,
      })
    }
  }

  useEffect(() => {
    let cancelled = false
    // Only the first load for this mint blanks the pane; poll-driven reloads
    // (refreshKey) swap the numbers underneath without a flash.
    fetch(`/api/terminal/${mint}`, { cache: "no-store" })
      .then((r) =>
        r.ok
          ? r.json()
          : Promise.reject(
              new Error(
                r.status === 404
                  ? "Token not found"
                  : "Could not load this token",
              ),
            ),
      )
      .then((j) => {
        if (!cancelled) {
          setData(j)
          setError(null)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [mint, refreshKey])

  useEffect(() => {
    if (!data) return
    const deployerWallet =
      data.detail.token.deployerWallet ||
      `${data.detail.token.mint.slice(0, 4)}Dev${data.detail.token.mint.slice(-6)}444`
    getDeployerProfile(deployerWallet, data.detail.token.mint).then((prof) => {
      const riskAudit = calculateTokenRiskAudit(
        data.detail.token,
        prof,
        data.holders ? { top10Pct: data.holders.top10Pct } : null,
        data.detail.authorityCheck
          ? {
              mintRevoked: data.detail.authorityCheck.mintAuthorityRevoked,
              freezeRevoked: data.detail.authorityCheck.freezeAuthorityRevoked,
              lpLockedOrBurned: data.detail.authorityCheck.lpLockedOrBurned,
            }
          : null,
      )
      setAudit(riskAudit)
    })
  }, [data])

  if (error) return <Placeholder>{error}</Placeholder>
  if (!data) return <TokenDetailSkeleton />

  const { token, score, market } = data.detail

  return (
    <div className="relative flex flex-col gap-3">
      {/* Floating KOL Intel Bubble beside selected token */}
      <KolFloatingBubble trades={data.kol.trades} symbol={token.symbol} />

      <button
        onClick={onBack}
        className="self-start text-xs font-semibold text-[var(--brand)] lg:hidden"
      >
        ← Back to list
      </button>

      <div className="flex flex-col gap-4 rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:p-6">
        {/* 1. Header: Avatar + Name + Symbol + CA Copy + Watchlist */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3.5">
            <TokenAvatar src={token.imageUri} symbol={token.symbol} size={50} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className="text-xl font-black tracking-tight sm:text-2xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {token.name}
                </h2>
                <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-xs font-bold text-[var(--text-muted)] uppercase">
                  ${token.symbol}
                </span>
                {launchpadLabel(token.launchpad) && (
                  <Chip>Launched on {launchpadLabel(token.launchpad)}</Chip>
                )}
                {dexLabel(market?.dex) && (
                  <Chip>Trades on {dexLabel(market?.dex)}</Chip>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 font-mono text-xs text-[var(--text-muted)]">
                <span
                  onClick={handleCopyCa}
                  className="cursor-pointer transition-colors hover:text-white"
                  title="Click to copy CA"
                >
                  {shortAddr(token.mint)}
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={handleCopyCa}
                        className={cn(
                          "inline-flex cursor-pointer items-center justify-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-all active:scale-95",
                          copiedCa
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                            : "border-white/10 bg-white/[0.04] text-[var(--text-muted)] hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
                        )}
                        aria-label="Copy CA to clipboard"
                      >
                        {copiedCa ? (
                          <>
                            <HugeiconsIcon
                              icon={Tick02Icon}
                              className="size-3 text-emerald-400"
                              strokeWidth={2.5}
                            />
                            <span className="text-[10px] font-semibold text-emerald-400">
                              Copied
                            </span>
                          </>
                        ) : (
                          <HugeiconsIcon
                            icon={Copy01Icon}
                            className="size-3"
                            strokeWidth={2}
                          />
                        )}
                      </button>
                    }
                  />
                  <TooltipContent className="border border-[var(--border)] bg-[var(--surface-raised)] text-[11px] text-[var(--text-primary)]">
                    {copiedCa ? "Copied to clipboard!" : "Copy CA"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <WatchStar watched={isWatched} onToggle={onToggleWatch} />
            <ScoreBadge score={score?.score ?? null} size="md" showMax />
          </div>
        </div>

        {/* 2. Price, Delta, Market Cap & Score Sequence */}
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">
              {market?.priceUsd == null
                ? "—"
                : market.priceUsd < 0.00001
                  ? `$${market.priceUsd.toExponential(2)}`
                  : market.priceUsd < 0.01
                    ? `$${market.priceUsd.toFixed(6)}`
                    : market.priceUsd < 1
                      ? `$${market.priceUsd.toFixed(4)}`
                      : `$${market.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs font-bold ${
                  (market?.priceChange24h ?? 0) >= 0
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-rose-500/20 text-rose-300"
                }`}
              >
                {(market?.priceChange24h ?? 0) >= 0 ? "▲" : "▼"}{" "}
                {pct(market?.priceChange24h)} 24h
              </span>
              {market?.priceChange1h != null && (
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {pct(market.priceChange1h)} 1h
                </span>
              )}
            </div>
          </div>

          <div className="text-right">
            <div className="font-mono text-2xl font-black text-white sm:text-3xl">
              {usd(market?.marketCapUsd)}
            </div>
            <div className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
              Market Cap
            </div>
          </div>
        </div>

        {/* 3. The Single Line Glowing Area Chart with Timeframe and Entry Line */}
        <div className="mt-2">
          <SingleLineChart
            pairAddress={market?.pairAddress}
            mint={token.mint}
            currentPrice={market?.priceUsd}
            priceChange24h={market?.priceChange24h}
            priceChange1h={market?.priceChange1h}
            symbol={token.symbol}
          />
        </div>

        {/* 4. Deployer track record — a signal about the WALLET's launch history,
            distinct from this token's own score above. Kept visually secondary
            (smaller number, muted card) and explicitly labeled so it never reads
            as a second, competing verdict on this token. */}
        {audit && <DeployerTrackRecord audit={audit} />}

        {/* 5. Foot of Each Token: About, Feed (X Mentions), AI Analysis */}
        <div className="mt-2">
          <TokenFootTabs
            detail={data.detail}
            holders={data.holders}
            alerts={data.alerts}
          />
        </div>

        {/* 6. Instant Buy Button & Modal */}
        <div className="mt-2">
          <InstantBuyModal
            mint={token.mint}
            symbol={token.symbol}
            priceUsd={market?.priceUsd}
            marketCapUsd={market?.marketCapUsd}
          />
        </div>
      </div>
    </div>
  )
}

function DeployerTrackRecord({ audit }: { audit: TokenRiskAudit }) {
  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <div className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
            Deployer track record — not this token&apos;s score
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-[var(--text-secondary)]">
              {audit.overallScore}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                /100
              </span>
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-black uppercase ${
                audit.overallScore >= 80
                  ? "border border-[var(--score-healthy)]/30 bg-[var(--score-healthy-tint)] text-[var(--score-healthy)]"
                  : audit.overallScore >= 50
                    ? "border border-[var(--score-caution)]/30 bg-[var(--score-caution-tint)] text-[var(--score-caution)]"
                    : "border border-[var(--score-risk)]/30 bg-[var(--score-risk-tint)] text-[var(--score-risk)]"
              }`}
            >
              Grade {audit.grade} · {audit.verdict}
            </span>
          </div>
        </div>

        <div className="text-right text-xs">
          <div className="text-[10px] text-[var(--text-muted)] uppercase">
            Deployer Wallet
          </div>
          <a
            href={`https://solscan.io/account/${audit.deployerProfile.wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono font-bold text-[var(--brand)] hover:underline"
          >
            {shortAddr(audit.deployerProfile.wallet)} ↗
          </a>
        </div>
      </div>

      {/* Dev Track Record Banner */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-none bg-[var(--ground)]/60 p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${
              audit.deployerProfile.reputation === "FLAGGED_SCAMMER"
                ? "animate-ping bg-[var(--score-risk)]"
                : audit.deployerProfile.reputation === "VERIFIED_SAFE"
                  ? "bg-[var(--score-healthy)]"
                  : "bg-[var(--score-caution)]"
            }`}
          />
          <span className="font-semibold">
            {audit.deployerProfile.statusText}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-[var(--text-muted)]">
          <span>{audit.deployerProfile.totalLaunches} Launches</span>
          <span>{audit.deployerProfile.graduationRate}% Graduated</span>
          <span>Avg: {audit.deployerProfile.averageReturn}x</span>
          <span className="font-bold text-[var(--text-primary)]">
            Max ATH: {audit.deployerProfile.maxReturn}x
          </span>
        </div>
      </div>

      {/* Funder Background Check */}
      {audit.deployerProfile.funderAddress && (
        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-[var(--text-muted)]">
          <span>
            🔍 <span className="font-semibold">Funder BG Check:</span> Funded by{" "}
            <span className="font-mono text-[var(--text-primary)]">
              {shortAddr(audit.deployerProfile.funderAddress)}
            </span>
          </span>
          <span
            className={
              audit.deployerProfile.funderIsFlagged
                ? "font-bold text-[var(--score-risk)]"
                : "text-[var(--score-healthy)]"
            }
          >
            {audit.deployerProfile.funderClusterNote}
          </span>
        </div>
      )}

      {/* 5 Audit Checks Breakdown */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {audit.checks.map((c: AuditCheckItem) => (
          <div
            key={c.label}
            className="rounded border border-[var(--border)] bg-[var(--surface)] p-2 text-xs"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-[var(--text-primary)]">
                {c.label}
              </span>
              <span
                className={`py-0.2 rounded px-1.5 text-[10px] font-bold ${
                  c.status === "PASS"
                    ? "bg-[var(--score-healthy-tint)] text-[var(--score-healthy)]"
                    : c.status === "WARN"
                      ? "bg-[var(--score-caution-tint)] text-[var(--score-caution)]"
                      : "bg-[var(--score-risk-tint)] text-[var(--score-risk)]"
                }`}
              >
                {c.status} ({c.score}/{c.maxScore})
              </span>
            </div>
            <div className="text-[11px] leading-tight text-[var(--text-muted)]">
              {c.summary}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

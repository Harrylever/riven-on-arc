"use client"

import { computeAuthorityGate } from "@clawdex/shared/score"
import { score10 } from "@/lib/format"
import { getVerdictMeta } from "@/lib/verdict"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { TokenAuthorityDetail, TokenScoreDetail } from "@/lib/api"

interface ScoreBreakdownProps {
  score: TokenScoreDetail | null
  authorityCheck: TokenAuthorityDetail | null
}

export function ScoreBreakdown({ score, authorityCheck }: ScoreBreakdownProps) {
  const verdict = getVerdictMeta(score?.score, score?.partial)

  // Authority gate computation using pure logic from @clawdex/shared/score
  const gateResult = authorityCheck
    ? computeAuthorityGate({
        mintAuthorityActive: !authorityCheck.mintAuthorityRevoked,
        freezeAuthorityActive: !authorityCheck.freezeAuthorityRevoked,
        lpLocked: authorityCheck.lpLockedOrBurned,
      })
    : null

  const gateMultiplier = gateResult
    ? gateResult.gate
    : (score?.gateMultiplier ?? null)

  const concentration = score?.concentrationScore ?? null
  const burnScore = score?.burnScore ?? null
  const liquidityScore = score?.liquidityScore ?? null

  return (
    <div className="flex flex-col gap-4">
      {/* Big Score Card */}
      <div className="rounded-none border border-[var(--line)] bg-gradient-to-b from-[var(--panel2)] to-[var(--panel)] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            {/* Conic Gauge from HTML template */}
            <div
              className="grid size-20 flex-shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(${
                  verdict.band === "green"
                    ? "var(--green)"
                    : verdict.band === "yellow"
                      ? "var(--amber)"
                      : "var(--red)"
                } ${score?.score ?? 0}%, rgba(255,255,255,0.08) 0)`,
              }}
            >
              <div className="grid size-16 place-items-center rounded-full bg-[var(--panel)] text-center">
                <span className="text-xl leading-none font-extrabold text-[var(--txt)]">
                  {score ? score10(score.score) : "—"}
                </span>
                <span className="mt-0.5 text-[9px] leading-none text-[var(--mut2)]">
                  / 10
                </span>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold tracking-wider text-[var(--mut2)] uppercase">
                AI Trust Score & Verdict
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xl font-extrabold">
                <span
                  className={
                    verdict.band === "green"
                      ? "text-[var(--green)]"
                      : verdict.band === "yellow"
                        ? "text-[var(--amber)]"
                        : "text-[var(--red)]"
                  }
                >
                  {verdict.label}{" "}
                  {verdict.band === "green"
                    ? "✓"
                    : verdict.band === "yellow"
                      ? "⚠"
                      : "✕"}
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--mut)]">
                {score?.partial
                  ? "Scoring in progress — partial data. Background signals are still compiling."
                  : verdict.band === "green"
                    ? "Security gates passed; active liquidity reserves."
                    : verdict.band === "yellow"
                      ? "Mixed risk indicators; verify holder concentration."
                      : "Elevated risk detected; security gates tripped or low reserves."}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-[var(--line2)] bg-white/[0.02] text-xs text-[var(--mut)] hover:text-[var(--txt)]"
                  >
                    Methodology & Rug Gate ↗
                  </Button>
                }
              />
              <SheetContent
                side="bottom"
                className="sm:side-right max-h-[85vh] overflow-y-auto border-[var(--line2)] bg-[var(--panel)] text-[var(--txt)] sm:max-w-lg"
              >
                <SheetHeader>
                  <SheetTitle className="text-foreground">
                    Scoring Methodology
                  </SheetTitle>
                  <SheetDescription className="text-[var(--mut)]">
                    How ClawDex evaluates Solana tokens
                  </SheetDescription>
                </SheetHeader>

                <div className="flex flex-col gap-4 px-6 pb-8 text-xs leading-relaxed text-[var(--mut)]">
                  <p>
                    ClawDex scores tokens from{" "}
                    <strong className="text-foreground">0 to 10</strong> using a
                    rug-gated formula that prioritizes contract safety before
                    market performance:
                  </p>

                  <div className="rounded-none border border-[var(--line)] bg-black/40 p-3 font-mono text-[11px] text-[var(--sol2)]">
                    SCORE = gate(mint, freeze, lp) × (40·C + 35·B_attr + 25·L)
                  </div>

                  <div className="flex flex-col gap-2">
                    <h4 className="text-foreground font-heading font-semibold uppercase">
                      1. Authority & LP Gate
                    </h4>
                    <p>
                      Checks whether mint authority is revoked, freeze authority
                      is revoked, and liquidity is locked or burned:
                    </p>
                    <ul className="list-disc space-y-1 pl-4">
                      <li>
                        <strong className="text-foreground">
                          Gate 1.0 (Pass)
                        </strong>
                        : All 3 security conditions met.
                      </li>
                      <li>
                        <strong className="text-foreground">
                          Gate 0.5 (Half Penalty)
                        </strong>
                        : Exactly one check fails; total score is halved.
                      </li>
                      <li>
                        <strong className="text-foreground">
                          Gate 0.0 (Hard Red)
                        </strong>
                        : Two or more checks fail. Total score is strictly
                        capped at 2 out of 10 regardless of liquidity or holder
                        distribution.
                      </li>
                    </ul>
                  </div>

                  <div className="flex flex-col gap-2">
                    <h4 className="text-foreground font-heading font-semibold uppercase">
                      2. Weighted Components
                    </h4>
                    <ul className="list-disc space-y-1 pl-4">
                      <li>
                        <strong className="text-foreground">
                          Concentration (40%)
                        </strong>
                        : Measures top-10 holder concentration (0–10). High
                        whale concentration lowers the score.
                      </li>
                      <li>
                        <strong className="text-foreground">
                          Attributed Burns (35%)
                        </strong>
                        : Derived solely from burns initiated by deployer or
                        treasury wallets (0–10). Dust burns from unrelated
                        wallets are ignored.
                      </li>
                      <li>
                        <strong className="text-foreground">
                          Liquidity Health (25%)
                        </strong>
                        : Evaluates liquidity-to-market-cap ratio and reserve
                        stability (0–10).
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-none border border-amber-500/20 bg-amber-500/10 p-3 text-amber-400">
                    <strong>Note:</strong> This scoring formula is an
                    algorithmic risk heuristic and has not yet been backtested
                    or validated against historical launch outcomes.
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Gate Checklist Strip */}
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-[var(--mut2)] uppercase">
            <span>Rug Security Gate Multiplier</span>
            <span className="text-foreground font-mono font-bold">
              {gateMultiplier !== null ? `${gateMultiplier}x` : "—"}
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {/* Mint Authority */}
            <div className="flex items-center gap-2.5 rounded-none border border-[var(--line)] bg-black/20 p-2.5 text-xs">
              {authorityCheck ? (
                authorityCheck.mintAuthorityRevoked ? (
                  <span className="text-sm font-bold text-[var(--green)]">
                    ✓
                  </span>
                ) : (
                  <span className="text-sm font-bold text-[var(--red)]">✕</span>
                )
              ) : (
                <span className="text-[var(--mut)]">—</span>
              )}
              <div>
                <div className="text-[11px] font-bold">Mint Authority</div>
                <div className="text-[10px] text-[var(--mut2)]">
                  {authorityCheck
                    ? authorityCheck.mintAuthorityRevoked
                      ? "Revoked (Safe)"
                      : "Active (Risk)"
                    : "Unchecked"}
                </div>
              </div>
            </div>

            {/* Freeze Authority */}
            <div className="flex items-center gap-2.5 rounded-none border border-[var(--line)] bg-black/20 p-2.5 text-xs">
              {authorityCheck ? (
                authorityCheck.freezeAuthorityRevoked ? (
                  <span className="text-sm font-bold text-[var(--green)]">
                    ✓
                  </span>
                ) : (
                  <span className="text-sm font-bold text-[var(--red)]">✕</span>
                )
              ) : (
                <span className="text-[var(--mut)]">—</span>
              )}
              <div>
                <div className="text-[11px] font-bold">Freeze Authority</div>
                <div className="text-[10px] text-[var(--mut2)]">
                  {authorityCheck
                    ? authorityCheck.freezeAuthorityRevoked
                      ? "Revoked (Safe)"
                      : "Active (Risk)"
                    : "Unchecked"}
                </div>
              </div>
            </div>

            {/* LP Lock/Burn */}
            <div className="flex items-center gap-2.5 rounded-none border border-[var(--line)] bg-black/20 p-2.5 text-xs">
              {authorityCheck ? (
                authorityCheck.lpLockedOrBurned ? (
                  <span className="text-sm font-bold text-[var(--green)]">
                    ✓
                  </span>
                ) : (
                  <span className="text-sm font-bold text-[var(--red)]">✕</span>
                )
              ) : (
                <span className="text-[var(--mut)]">—</span>
              )}
              <div>
                <div className="text-[11px] font-bold">LP Liquidity</div>
                <div className="text-[10px] text-[var(--mut2)]">
                  {authorityCheck
                    ? authorityCheck.lpLockedOrBurned
                      ? "Locked / Burned"
                      : "Unlocked (Risk)"
                    : "Unchecked"}
                </div>
              </div>
            </div>
          </div>

          {/* Gate failure banner */}
          {gateMultiplier !== null && gateMultiplier < 1.0 && (
            <div className="mt-2.5 rounded-none border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
              {gateMultiplier === 0.0 ? (
                <span>
                  <strong>Security Warning:</strong> Two or more authority/LP
                  checks failed. The token score has been hard-capped at 2 out
                  of 10.
                </span>
              ) : (
                <span>
                  <strong>Caution:</strong> One security check failed. The
                  overall score has been penalized by 50%.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sub-score Breakdown Bars */}
      <div className="rounded-none border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="mb-4 text-xs font-bold tracking-wider text-[var(--mut2)] uppercase">
          Sub-score Breakdown (0–10)
        </div>
        <div className="flex flex-col gap-4">
          {/* Concentration */}
          <div>
            <div className="flex justify-between text-xs font-medium">
              <span>Holder Distribution</span>
              <span className="text-foreground font-mono font-bold">
                {concentration !== null
                  ? `${concentration.toFixed(1)} / 10`
                  : "—"}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-none bg-white/[0.04]">
              <div
                className="h-full rounded-none bg-gradient-to-r from-[var(--sol2)] to-[var(--cyan)] transition-all"
                style={{
                  width: `${Math.min(Math.max((concentration ?? 0) * 10, 0), 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-[11px] text-[var(--mut2)]">
              Evaluates top-10 wallet concentration. Higher scores represent
              broader distribution.
            </p>
          </div>

          {/* Attributed Burns */}
          <div>
            <div className="flex justify-between text-xs font-medium">
              <span>Attributed Burns</span>
              <span className="text-foreground font-mono font-bold">
                {burnScore !== null ? `${burnScore.toFixed(1)} / 10` : "—"}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-none bg-white/[0.04]">
              <div
                className="h-full rounded-none bg-gradient-to-r from-[var(--sol1)] to-[var(--cyan)] transition-all"
                style={{
                  width: `${Math.min(Math.max((burnScore ?? 0) * 10, 0), 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-[11px] text-[var(--mut2)]">
              Measures supply burned directly by deployer and treasury wallets.
            </p>
          </div>

          {/* Liquidity */}
          <div>
            <div className="flex justify-between text-xs font-medium">
              <span>Liquidity Health</span>
              <span className="text-foreground font-mono font-bold">
                {liquidityScore !== null
                  ? `${liquidityScore.toFixed(1)} / 10`
                  : "—"}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-none bg-white/[0.04]">
              <div
                className="h-full rounded-none bg-gradient-to-r from-[var(--sol2)] to-[var(--green)] transition-all"
                style={{
                  width: `${Math.min(Math.max((liquidityScore ?? 0) * 10, 0), 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-[11px] text-[var(--mut2)]">
              Ratio of pool reserves to market cap. Higher scores reflect deeper
              trading liquidity.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

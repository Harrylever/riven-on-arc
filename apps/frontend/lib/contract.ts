import { scoreBand } from "@clawdex/shared/score"
import type {
  TokenAuthorityDetail,
  TokenBurnDetail,
  TokenIdentity,
  TokenScoreDetail,
} from "./mock"

// Maps raw Prisma rows (packages/shared/prisma/schema.prisma) onto the response
// contract in docs/BLUEPRINT.md section 4, which the UI types in ./mock.ts follow.
// Without this the UI read e.g. `mintAuthorityRevoked` off a row that only has
// `mintAuthorityActive`, so a fully revoked token rendered as "authority live".

type Num = { toString(): string } | number | string | null | undefined

export function num(v: Num, fallback = 0): number {
  if (v === null || v === undefined) return fallback
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : fallback
}

export function verdictFor(score: number): "LOOKS_HEALTHY" | "MIXED" | "RISKY" {
  const band = scoreBand(score)
  return band === "green"
    ? "LOOKS_HEALTHY"
    : band === "yellow"
      ? "MIXED"
      : "RISKY"
}

export function toTokenIdentity(t: {
  id: string
  mint: string
  name: string
  symbol: string
  decimals: number | null
  imageUri: string | null
  metadataUri: string | null
  launchpad: string
  discoveredVia: string
  launchTime: Date
}): TokenIdentity {
  return {
    id: t.id,
    mint: t.mint,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals ?? 6,
    imageUri: t.imageUri,
    metadataUri: t.metadataUri,
    launchpad: t.launchpad,
    discoveredVia: t.discoveredVia,
    firstSeenAt: t.launchTime.toISOString(),
  }
}

export function toScoreDetail(s: {
  id: string
  tokenId: string
  score: Num
  gate: Num
  concentration: Num
  burnScore: Num
  liquidityScore: Num
  calculatedAt: Date
  partial?: boolean | null
  confidence?: string | null
}): TokenScoreDetail {
  const score = num(s.score)
  const isPartial = Boolean(s.partial)
  return {
    id: s.id,
    tokenId: s.tokenId,
    score,
    gateMultiplier: num(s.gate),
    concentrationScore: num(s.concentration),
    burnScore: num(s.burnScore),
    liquidityScore: num(s.liquidityScore),
    verdict: isPartial
      ? "Scoring in progress — partial data"
      : verdictFor(score),
    calculatedAt: s.calculatedAt.toISOString(),
    partial: isPartial,
    confidence: s.confidence ?? (isPartial ? "low" : "high"),
  }
}

export function toAuthorityDetail(a: {
  id: string
  tokenId: string
  mintAuthorityActive: boolean
  freezeAuthorityActive: boolean
  lpLocked: boolean
  checkedAt: Date
}): TokenAuthorityDetail {
  const mintAuthorityRevoked = !a.mintAuthorityActive
  const freezeAuthorityRevoked = !a.freezeAuthorityActive
  return {
    id: a.id,
    tokenId: a.tokenId,
    mintAuthorityRevoked,
    freezeAuthorityRevoked,
    lpLockedOrBurned: a.lpLocked,
    passCount: [
      mintAuthorityRevoked,
      freezeAuthorityRevoked,
      a.lpLocked,
    ].filter(Boolean).length,
    checkedAt: a.checkedAt.toISOString(),
  }
}

export function toBurnDetail(b: {
  id: string
  tokenId: string
  txHash: string
  wallet: string
  amount: Num
  attributed: boolean
  burnedAt: Date
}): TokenBurnDetail {
  return {
    id: b.id,
    tokenId: b.tokenId,
    signature: b.txHash,
    burnerWallet: b.wallet,
    amount: num(b.amount),
    isDeployerOrTreasury: b.attributed,
    burnedAt: b.burnedAt.toISOString(),
  }
}

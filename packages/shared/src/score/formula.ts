import {
  AuthorityGateInput,
  ScoreBreakdown,
  ScoreInput,
} from "./types.js";

/**
 * Weights, gate penalties (1.0 / 0.5 / 0.0) and the burn bonus are the Phase 0
 * starting point, not yet validated against real launches. Re-tune after the
 * Phase 0 backtest, not before.
 *
 * Concentration and liquidity form the base score (renormalized to 0-100 over
 * whichever of the two is available). Attributed burns are a BONUS of up to
 * BURN_BONUS_MAX points on top, not a required component: most tokens never
 * have an attributed burn, and treating "no burn" as a zero in a 35-point slot
 * capped every such token at 65, so none could ever reach green.
 *
 * z500 was dropped as a score input (was 10 pts) — see AGENTS.md's phase 6
 * entry: the ansem.io endpoint sits behind a Cloudflare JS challenge that
 * blocks scripted access, and the team decided not to depend a scoring input
 * on an unreliable third-party fetch.
 */
const WEIGHTS = {
  concentration: 40,
  liquidity: 25,
};
const BURN_BONUS_MAX = 15;
/** Base score used when neither concentration nor liquidity could be measured. */
const NEUTRAL_BASE = 50;
/** Gate-0 tokens can show their component scores but never exceed this. */
const GATE_ZERO_CAP = 20;

export function computeAuthorityGate(input: AuthorityGateInput): {
  gate: number;
  redFlags: string[];
} {
  const failures: string[] = [];
  if (input.mintAuthorityActive) failures.push("mint authority still active");
  if (input.freezeAuthorityActive) failures.push("freeze authority still active");
  if (!input.lpLocked) failures.push("LP not locked or burned");

  if (failures.length === 0) return { gate: 1.0, redFlags: [] };
  if (failures.length === 1) return { gate: 0.5, redFlags: failures };
  return { gate: 0.0, redFlags: failures };
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const { gate, redFlags } = input.authorityGate
    ? computeAuthorityGate(input.authorityGate)
    : { gate: 1.0, redFlags: [] as string[] };

  let availableWeight = 0;
  let weighted = 0;
  if (input.concentrationScore !== null) {
    availableWeight += WEIGHTS.concentration;
    weighted += WEIGHTS.concentration * (input.concentrationScore / 10);
  }
  if (input.liquidityScore !== null) {
    availableWeight += WEIGHTS.liquidity;
    weighted += WEIGHTS.liquidity * (input.liquidityScore / 10);
  }

  const base = availableWeight > 0 ? (weighted / availableWeight) * 100 : NEUTRAL_BASE;
  const burnBonus = ((input.burnScore ?? 0) / 10) * BURN_BONUS_MAX;
  const raw = Math.min(100, base + burnBonus);

  // Gate 0 (two or more authority/LP checks failed) is a hard red: the component
  // score still shows through but can never exceed the cap. Multiplying by a gate
  // of 0 would always give 0 and make the cap dead code.
  const score = gate === 0 ? Math.min(raw, GATE_ZERO_CAP) : gate * raw;

  const partial =
    input.authorityGate === null ||
    input.concentrationScore === null ||
    input.liquidityScore === null;

  return {
    score: Math.round(score),
    gate,
    concentration: input.concentrationScore ?? 0,
    burnScore: input.burnScore ?? 0,
    liquidityScore: input.liquidityScore ?? 0,
    redFlags,
    partial,
    confidence: partial ? "low" : "high",
  };
}

export function scoreBand(score: number): "green" | "yellow" | "red" {
  if (score >= 70) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

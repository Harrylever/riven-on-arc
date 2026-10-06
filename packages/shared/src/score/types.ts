export interface AuthorityGateInput {
  mintAuthorityActive: boolean;
  freezeAuthorityActive: boolean;
  lpLocked: boolean;
}

/**
 * Every signal is nullable: null means "could not be measured", which is not
 * the same as a measured zero. computeScore() renormalizes over what it has
 * and flags the result partial instead of scoring missing data as bad data.
 */
export interface ScoreInput {
  /** null = authority check hasn't run yet (gate defaults to 1.0, result is flagged partial) */
  authorityGate: AuthorityGateInput | null;
  /** 0-10, from 1 - (top10 balance / total supply held by whoever concentration is measured over) */
  concentrationScore: number | null;
  /** 0-10, from attributed burns only (deployer/treasury wallet), never aggregate supply burn. null or 0 = no attributed burns, which is not penalized. */
  burnScore: number | null;
  /** 0-10, from liquidity / market cap ratio */
  liquidityScore: number | null;
}

export type ScoreConfidence = "high" | "low";

export interface ScoreBreakdown {
  score: number;
  gate: number;
  concentration: number;
  burnScore: number;
  liquidityScore: number;
  redFlags: string[];
  /** true when authority, concentration or liquidity was missing. Burns never make a score partial. */
  partial: boolean;
  confidence: ScoreConfidence;
}

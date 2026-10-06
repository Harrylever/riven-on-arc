/**
 * Converts raw on-chain signals into the 0-10 sub-scores computeScore()
 * expects. These scaling choices (10% burn = full score, 15% liquidity
 * ratio = full score) come from the original research doc's "5-15% healthy
 * liquidity ratio" note — reasonable, documented, but NOT validated against
 * real launch outcomes. Re-tune after a backtest, same caveat as the
 * formula's weights themselves (see formula.ts).
 */

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** top10Pct: fraction (0-1) of current supply held by the top 10 holders. Lower = better. */
export function deriveConcentrationScore(top10Pct: number): number {
  return clamp((1 - top10Pct) * 10, 0, 10);
}

/** attributedBurnRatio: attributed burns / current supply, as a fraction (0-1). */
export function deriveBurnScore(attributedBurnRatio: number): number {
  return clamp(attributedBurnRatio * 100, 0, 10); // 10% burned -> full score
}

/** liquidityRatio: pool SOL balance / market cap, both in SOL — a ratio, so no USD conversion needed. */
export function deriveLiquidityScore(liquidityRatio: number): number {
  return clamp((liquidityRatio / 0.15) * 10, 0, 10); // 15%+ -> full score
}

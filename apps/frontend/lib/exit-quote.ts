/**
 * "Can I get out?" for a USDC-quoted pool.
 *
 * Models the pool as constant-product with `poolUsdc` of real USDC on one side
 * (full-range liquidity). Selling `sellUsd` worth of tokens at the current
 * price then returns  out = R·V / (R + V),  so the haircut is V / (R + V).
 * Concentrated liquidity moves price MORE for the same size, so this is a best
 * case, never a promise. It uses only numbers Riven already measures.
 */
export interface ExitQuote {
  /** USDC received, best case. */
  receive: number
  /** Share of the sale value lost to price impact, 0–1. */
  impact: number
  /** True when the sale is bigger than every USDC the pool holds. */
  exceedsPool: boolean
}

export function exitQuote(poolUsdc: number | null, sellUsd: number): ExitQuote | null {
  if (poolUsdc === null || !Number.isFinite(poolUsdc) || poolUsdc < 0) return null
  if (!Number.isFinite(sellUsd) || sellUsd <= 0) return null
  if (poolUsdc === 0) return { receive: 0, impact: 1, exceedsPool: true }
  const receive = (poolUsdc * sellUsd) / (poolUsdc + sellUsd)
  return { receive, impact: 1 - receive / sellUsd, exceedsPool: sellUsd > poolUsdc }
}

/** Largest sale (USD) that keeps best-case impact at or under `maxImpact` (e.g. 0.05). */
export function maxSellForImpact(poolUsdc: number | null, maxImpact: number): number | null {
  if (poolUsdc === null || !Number.isFinite(poolUsdc) || poolUsdc <= 0) return null
  if (maxImpact <= 0 || maxImpact >= 1) return null
  // impact = V / (R + V)  =>  V = R·i / (1 − i)
  return (poolUsdc * maxImpact) / (1 - maxImpact)
}

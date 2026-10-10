/**
 * Pre-flight checks on a quoted swap, before any transaction is offered to the
 * user's wallet. Pure functions over numbers the quoter already returned.
 *
 * What they catch: trades too big for the pool, quotes that would move the price a
 * lot, and tokens that can be bought but not sold back at a sane price (empty or
 * one-sided pools, hooks that revert on the reverse swap).
 * What they cannot catch: transfer taxes or blacklists inside the token itself; the
 * pool quote does not see those. Riven's contract score covers them as flags.
 */

/** Hard stop: a single trade larger than this (USD) is refused. */
export const DEFAULT_MAX_TRADE_USD = 250
/** Above this estimated price impact the user must acknowledge a warning. */
export const IMPACT_WARN = 0.05
/** Above this the trade is refused outright. */
export const IMPACT_BLOCK = 0.3
/** A pool charging more than this per swap is refused; more than FEE_WARN is flagged. */
export const FEE_BLOCK = 0.25
export const FEE_WARN = 0.05
/** A buy whose quoted sell-back returns less than this share of the cost is refused. */
export const ROUND_TRIP_BLOCK_LOSS = 0.6
/** Extra round-trip loss, beyond fees and impact, that triggers a warning. */
export const ROUND_TRIP_SLACK = 0.05

export interface GuardInput {
  side: "buy" | "sell"
  /** Size of the trade's USDC leg, in USD. */
  usdLeg: number
  /** The quoted trade: input and output amounts in their own token units. */
  amountIn: number
  amountOut: number
  /** A tiny quote on the same pool and direction, for the marginal price. */
  smallIn: number | null
  smallOut: number | null
  /** Buys only: what selling the quoted output straight back would return (USDC). */
  backOut: number | null
  /** Pool fee as a fraction (1% = 0.01). */
  feeFraction: number
  maxUsd?: number
}

export interface GuardResult {
  /** Set when the trade must not be offered. */
  error?: string
  /** Shown to the user; any warning needs an explicit acknowledgement. */
  warnings: string[]
  /** 0–1, or null when it could not be estimated. */
  priceImpact: number | null
  /** Buys only, 0–1: how much of the cost a straight sell-back would lose. */
  roundTripLoss: number | null
}

const pct = (x: number) => `${Math.round(x * 100)}%`

export function evaluateGuards(g: GuardInput): GuardResult {
  const warnings: string[] = []
  const maxUsd = g.maxUsd ?? DEFAULT_MAX_TRADE_USD
  const fail = (error: string, extra: Partial<GuardResult> = {}): GuardResult => ({
    error,
    warnings,
    priceImpact: null,
    roundTripLoss: null,
    ...extra,
  })

  if (g.usdLeg > maxUsd) {
    return fail(`Riven caps a single trade at $${maxUsd} in this build. Try a smaller amount.`)
  }

  // Launch pools can carry a huge swap fee (anti-snipe decay, or a plain trap).
  if (g.feeFraction >= FEE_BLOCK) {
    return fail(
      `This pool charges a ${pct(g.feeFraction)} fee on every swap, so most of any trade is lost to fees. Not offering this trade.`,
    )
  }
  if (g.feeFraction > FEE_WARN) {
    warnings.push(`This pool charges a ${pct(g.feeFraction)} fee on every swap, much higher than the usual 0.3–1%.`)
  }

  // Marginal price from the tiny quote vs the average price of the real one.
  let priceImpact: number | null = null
  if (g.smallIn && g.smallOut && g.smallIn > 0 && g.smallOut > 0 && g.amountIn > 0) {
    const marginal = g.smallOut / g.smallIn
    const average = g.amountOut / g.amountIn
    priceImpact = Math.min(1, Math.max(0, 1 - average / marginal))
  }
  if (priceImpact !== null && priceImpact > IMPACT_BLOCK) {
    return fail(
      `This trade would move the price by about ${pct(priceImpact)}, which is more than the pool can absorb. Try a much smaller amount.`,
      { priceImpact },
    )
  }
  if (priceImpact !== null && priceImpact > IMPACT_WARN) {
    warnings.push(`Large price impact: about ${pct(priceImpact)} of this trade is lost to the pool's thin liquidity.`)
  }

  let roundTripLoss: number | null = null
  if (g.side === "buy") {
    if (g.backOut === null || g.backOut <= 0) {
      return fail(
        "Riven could not get a quote to sell this token back, so it may not be sellable. Not offering the buy.",
        { priceImpact },
      )
    }
    roundTripLoss = Math.min(1, Math.max(0, 1 - g.backOut / g.amountIn))
    if (roundTripLoss > ROUND_TRIP_BLOCK_LOSS) {
      return fail(
        `Buying and immediately selling back would lose about ${pct(roundTripLoss)}. Not offering the buy.`,
        { priceImpact, roundTripLoss },
      )
    }
    // Two swaps' worth of fee and impact is normal; losing clearly more is not.
    const keep = (1 - g.feeFraction) ** 2 * (1 - (priceImpact ?? 0)) ** 2
    const expectedLoss = 1 - keep
    if (roundTripLoss > expectedLoss + ROUND_TRIP_SLACK) {
      warnings.push(
        `Selling this back right away would lose about ${pct(roundTripLoss)}, more than the pool fee and price impact explain (about ${pct(expectedLoss)}).`,
      )
    }
  }

  return { warnings, priceImpact, roundTripLoss }
}

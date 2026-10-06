/**
 * Pure helpers for the one-click "Trade setup" on the perps terminal.
 * Everything here is paper-trading maths: no order is routed anywhere.
 */

export type PerpSide = "LONG" | "SHORT"

export interface TradeSetup {
  side: PerpSide
  entry: number
  stopLoss: number
  /** One to three take-profit targets, nearest first */
  tps: number[]
}

/** Signal levels (from the scanner) a setup can be seeded with. */
export interface SignalLevels {
  bias: PerpSide
  entryPrice: number
  stopLoss: number
  t1: number
  t2: number
  t3: number
}

// Fallback risk when a coin has no scanner signal: 1.5% stop, targets at 1R/2R/3R.
const DEFAULT_RISK_PCT = 0.015

/**
 * Build entry / SL / TP1-3 for a side. A scanner signal wins when it agrees with
 * the chosen side; otherwise (no signal, or the user flipped side) levels are
 * derived from the entry price with the default risk.
 */
export function buildTradeSetup(
  side: PerpSide,
  markPrice: number,
  orderType: "LIMIT" | "MARKET",
  signal?: SignalLevels | null,
): TradeSetup {
  if (signal && signal.bias === side) {
    return {
      side,
      entry: orderType === "LIMIT" ? signal.entryPrice : markPrice,
      stopLoss: signal.stopLoss,
      tps: [signal.t1, signal.t2, signal.t3],
    }
  }

  const entry = markPrice
  const risk = entry * DEFAULT_RISK_PCT
  const dir = side === "LONG" ? 1 : -1
  return {
    side,
    entry,
    stopLoss: entry - dir * risk,
    tps: [entry + dir * risk, entry + dir * risk * 2, entry + dir * risk * 3],
  }
}

/** A setup is only placeable if SL and every TP sit on the correct side of entry. */
export function validateSetup(setup: TradeSetup): string | null {
  const dir = setup.side === "LONG" ? 1 : -1
  if (!Number.isFinite(setup.entry) || setup.entry <= 0) {
    return "Entry price must be above zero."
  }
  if (!Number.isFinite(setup.stopLoss) || setup.stopLoss <= 0) {
    return "Enter a stop loss."
  }
  if ((setup.entry - setup.stopLoss) * dir <= 0) {
    return "Stop loss must be on the losing side of entry."
  }
  if (setup.tps.length === 0) return "Enter at least one take-profit."
  if (
    setup.tps.some(
      (tp) => !Number.isFinite(tp) || (tp - setup.entry) * dir <= 0,
    )
  ) {
    return "Take-profit targets must be on the winning side of entry."
  }
  return null
}

/**
 * Map a Hyperliquid coin name to a TradingView perp symbol. Hyperliquid prefixes
 * 1000x-quoted coins with "k" (kPEPE); Bybit lists them as 1000PEPE.
 */
export function tradingViewSymbol(coin: string): string {
  const base = /^k[A-Z]{2,}$/.test(coin) ? `1000${coin.slice(1)}` : coin
  return `BYBIT:${base.toUpperCase()}USDT.P`
}

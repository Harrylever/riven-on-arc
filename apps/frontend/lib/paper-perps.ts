/**
 * Paper-perp accounting, kept pure so it can be tested: mark a position to the
 * live price, and decide whether its stop, a take-profit level or liquidation
 * has been hit. Fees match the open fee (0.045% of notional).
 */

export const TAKER_FEE = 0.00045

export interface MarkablePosition {
  side: "LONG" | "SHORT"
  size: number
  entryPrice: number
  margin: number
  liqPrice: number
  sl: number | null
  tp: number | null
  tps?: number[]
  /** Size when opened; TP levels each close an equal share of it. */
  initialSize?: number
  /** How many TP levels have already been taken. */
  tpsHit?: number
}

const dir = (p: { side: "LONG" | "SHORT" }) => (p.side === "LONG" ? 1 : -1)

export function unrealizedPnl(p: MarkablePosition, mark: number) {
  return p.size * (mark - p.entryPrice) * dir(p)
}

/** Mark-to-market fields for display. */
export function marked<T extends MarkablePosition>(p: T, mark: number): T & { markPrice: number; pnl: number; roe: number; positionValue: number } {
  const pnl = unrealizedPnl(p, mark)
  return { ...p, markPrice: mark, pnl, roe: p.margin > 0 ? (pnl / p.margin) * 100 : 0, positionValue: p.size * mark }
}

export type Trigger =
  | { kind: "liquidated"; price: number }
  | { kind: "sl"; price: number }
  | { kind: "tp"; price: number; level: number; closeSize: number }

/**
 * What the mark price triggers, worst first: liquidation beats the stop, the
 * stop beats a take-profit. With TP1–3 each level closes an equal share.
 */
export function triggerFor(p: MarkablePosition, mark: number): Trigger | null {
  const long = p.side === "LONG"
  if (long ? mark <= p.liqPrice : mark >= p.liqPrice) return { kind: "liquidated", price: p.liqPrice }
  if (p.sl !== null && (long ? mark <= p.sl : mark >= p.sl)) return { kind: "sl", price: p.sl }
  const levels = p.tps && p.tps.length > 0 ? p.tps : p.tp !== null ? [p.tp] : []
  const hit = p.tpsHit ?? 0
  const next = levels[hit]
  if (next !== undefined && (long ? mark >= next : mark <= next)) {
    const last = hit === levels.length - 1
    const share = (p.initialSize ?? p.size) / levels.length
    return { kind: "tp", price: next, level: hit + 1, closeSize: last ? p.size : Math.min(p.size, share) }
  }
  return null
}

/**
 * Cash returned when closing `closeSize` at `price`: that slice's margin plus
 * its PnL minus the closing fee, floored at 0 (losses can't exceed margin).
 */
export function closeProceeds(p: MarkablePosition, closeSize: number, price: number) {
  const frac = p.size > 0 ? closeSize / p.size : 0
  const pnl = closeSize * (price - p.entryPrice) * dir(p)
  const fee = closeSize * price * TAKER_FEE
  return { pnl, fee, returned: Math.max(0, p.margin * frac + pnl - fee), marginReleased: p.margin * frac }
}

import { describe, expect, test } from "bun:test"
import { closeProceeds, marked, triggerFor, type MarkablePosition } from "./paper-perps"

// 1 BTC long at 60k, 10x: margin 6k, liq at 60k * (1 - 0.09) = 54.6k.
const LONG: MarkablePosition = {
  side: "LONG",
  size: 1,
  entryPrice: 60_000,
  margin: 6_000,
  liqPrice: 54_600,
  sl: 57_000,
  tp: null,
  tps: [63_000, 66_000, 69_000],
  initialSize: 1,
  tpsHit: 0,
}

describe("marked", () => {
  test("PnL and ROE follow the mark price", () => {
    const m = marked(LONG, 66_000)
    expect(m.pnl).toBe(6_000)
    expect(m.roe).toBe(100)
    expect(m.markPrice).toBe(66_000)
  })
  test("shorts gain when price falls", () => {
    expect(marked({ ...LONG, side: "SHORT", liqPrice: 65_400, sl: 63_000 }, 57_000).pnl).toBe(3_000)
  })
})

describe("triggerFor", () => {
  test("nothing fires inside the range", () => {
    expect(triggerFor(LONG, 61_000)).toBeNull()
  })
  test("stop loss", () => {
    expect(triggerFor(LONG, 56_900)).toEqual({ kind: "sl", price: 57_000 })
  })
  test("liquidation beats the stop", () => {
    expect(triggerFor({ ...LONG, sl: 50_000 }, 54_000)).toEqual({ kind: "liquidated", price: 54_600 })
  })
  test("TP1 closes a third, the last TP closes the rest", () => {
    expect(triggerFor(LONG, 63_500)).toMatchObject({ kind: "tp", level: 1, closeSize: 1 / 3 })
    expect(triggerFor({ ...LONG, size: 1 / 3, tpsHit: 2 }, 69_100)).toMatchObject({ kind: "tp", level: 3, closeSize: 1 / 3 })
  })
  test("a single tp closes everything", () => {
    expect(triggerFor({ ...LONG, tps: undefined, tp: 62_000 }, 62_000)).toMatchObject({ kind: "tp", closeSize: 1 })
  })
})

describe("closeProceeds", () => {
  test("returns margin + PnL minus the closing fee", () => {
    const r = closeProceeds(LONG, 1, 66_000)
    expect(r.pnl).toBe(6_000)
    expect(r.fee).toBeCloseTo(29.7, 6)
    expect(r.returned).toBeCloseTo(6_000 + 6_000 - 29.7, 6)
  })
  test("losses never return less than zero", () => {
    expect(closeProceeds(LONG, 1, 50_000).returned).toBe(0)
  })
})

import { describe, expect, test } from "bun:test"
import { evaluateGuards, type GuardInput } from "./trade-guards"

// Buy $10 of USDC into a healthy 1%-fee pool: 100 tokens at $0.10, tiny impact.
const base: GuardInput = {
  side: "buy",
  usdLeg: 10,
  amountIn: 10,
  amountOut: 98,
  smallIn: 0.2,
  smallOut: 1.97,
  backOut: 9.6,
  feeFraction: 0.01,
}

describe("evaluateGuards", () => {
  test("a normal small buy passes with no warnings", () => {
    const r = evaluateGuards(base)
    expect(r.error).toBeUndefined()
    expect(r.warnings).toEqual([])
    expect(r.priceImpact).toBeLessThan(0.02)
    expect(r.roundTripLoss).toBeCloseTo(0.04)
  })

  test("refuses a trade above the size cap", () => {
    expect(evaluateGuards({ ...base, usdLeg: 251 }).error).toContain("caps a single trade")
    expect(evaluateGuards({ ...base, usdLeg: 251, maxUsd: 500 }).error).toBeUndefined()
  })

  test("warns on a large price impact and refuses an extreme one", () => {
    const warn = evaluateGuards({ ...base, amountOut: 90, smallOut: 1.97 * 1, backOut: 8.5 })
    expect(warn.priceImpact).toBeGreaterThan(0.05)
    expect(warn.warnings.some((w) => w.includes("price impact"))).toBe(true)
    const block = evaluateGuards({ ...base, amountOut: 50, backOut: 4 })
    expect(block.error).toContain("move the price")
  })

  test("refuses a buy whose sell-back quote failed", () => {
    expect(evaluateGuards({ ...base, backOut: null }).error).toContain("not be sellable")
    expect(evaluateGuards({ ...base, backOut: 0 }).error).toContain("not be sellable")
  })

  test("refuses a buy that would lose most of its value on the way back", () => {
    expect(evaluateGuards({ ...base, backOut: 3 }).error).toContain("selling back would lose")
  })

  test("warns when the round trip loses more than fees and impact explain", () => {
    const r = evaluateGuards({ ...base, backOut: 7.5 })
    expect(r.error).toBeUndefined()
    expect(r.warnings.some((w) => w.includes("more than the pool fee"))).toBe(true)
  })

  test("refuses a pool with a huge swap fee and warns on a high one", () => {
    expect(evaluateGuards({ ...base, feeFraction: 0.97 }).error).toContain("97% fee")
    const hi = evaluateGuards({ ...base, feeFraction: 0.1, backOut: 7.9 })
    expect(hi.warnings.some((w) => w.includes("10% fee"))).toBe(true)
  })

  test("sells skip the sell-back check", () => {
    const r = evaluateGuards({
      side: "sell",
      usdLeg: 10,
      amountIn: 100,
      amountOut: 9.8,
      smallIn: 2,
      smallOut: 0.197,
      backOut: null,
      feeFraction: 0.01,
    })
    expect(r.error).toBeUndefined()
    expect(r.roundTripLoss).toBeNull()
  })

  test("unknown impact does not block", () => {
    const r = evaluateGuards({ ...base, smallIn: null, smallOut: null })
    expect(r.priceImpact).toBeNull()
    expect(r.error).toBeUndefined()
  })
})

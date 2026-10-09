import { describe, expect, test } from "bun:test"
import { exitQuote, maxSellForImpact } from "./exit-quote"

describe("exitQuote", () => {
  test("selling a sliver of a deep pool costs almost nothing", () => {
    const q = exitQuote(1_000_000, 100)!
    expect(q.impact).toBeLessThan(0.001)
    expect(q.exceedsPool).toBe(false)
  })

  test("selling the pool's own size halves the proceeds", () => {
    const q = exitQuote(1_000, 1_000)!
    expect(q.receive).toBeCloseTo(500)
    expect(q.impact).toBeCloseTo(0.5)
  })

  test("a sale larger than the pool can never be fully paid", () => {
    const q = exitQuote(2, 5_000)!
    expect(q.exceedsPool).toBe(true)
    expect(q.receive).toBeLessThan(2)
  })

  test("a pool with no USDC pays nothing", () => {
    expect(exitQuote(0, 100)).toEqual({ receive: 0, impact: 1, exceedsPool: true })
  })

  test("unknown or invalid inputs give no quote", () => {
    expect(exitQuote(null, 100)).toBeNull()
    expect(exitQuote(1000, 0)).toBeNull()
    expect(exitQuote(1000, Number.NaN)).toBeNull()
  })
})

describe("maxSellForImpact", () => {
  test("round-trips with exitQuote", () => {
    const v = maxSellForImpact(10_000, 0.05)!
    expect(exitQuote(10_000, v)!.impact).toBeCloseTo(0.05)
  })
  test("no pool, no safe size", () => {
    expect(maxSellForImpact(0, 0.05)).toBeNull()
    expect(maxSellForImpact(null, 0.05)).toBeNull()
  })
})

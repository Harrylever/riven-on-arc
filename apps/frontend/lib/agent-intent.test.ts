import { describe, expect, test } from "bun:test"
import { comparePair, explainConcept, parseAmount, parseScreenerQuery } from "./agent-intent"

describe("parseAmount", () => {
  test("units", () => {
    expect(parseAmount("$5M")).toBe(5e6)
    expect(parseAmount("500k")).toBe(5e5)
    expect(parseAmount("2.5 billion")).toBe(2.5e9)
    expect(parseAmount("1,200")).toBe(1200)
  })
})

describe("parseScreenerQuery", () => {
  test("market cap ceiling + socials", () => {
    const p = parseScreenerQuery("find tokens under $50k market cap with socials")!
    expect(p.filters.maxMcap).toBe(50_000)
    expect(p.filters.has).toBe("community")
  })
  test("mcap floor phrased after", () => {
    expect(parseScreenerQuery("show coins with mcap over 1m")!.filters.minMcap).toBe(1e6)
  })
  test("gainers in the last hour", () => {
    const p = parseScreenerQuery("biggest gainers in the last hour")!
    expect(p.filters.sort).toBe("gainers")
    expect(p.filters.tf).toBe("1h")
  })
  test("safest new launches on argus", () => {
    const p = parseScreenerQuery("safest new launches on argus")!
    expect(p.filters.band).toBe("healthy")
    expect(p.filters.pad).toBe("ARGUS")
  })
  test("boosted", () => {
    expect(parseScreenerQuery("which tokens have boosts?")!.filters.has).toBe("boosted")
  })
  test("score floor", () => {
    expect(parseScreenerQuery("tokens with score above 6")!.filters.minScore).toBe(6)
  })
  test("riskiest", () => {
    expect(parseScreenerQuery("show me the riskiest tokens")!.riskiest).toBe(true)
  })
  test("not a list question", () => {
    expect(parseScreenerQuery("hello there")).toBeNull()
  })
})

describe("comparePair", () => {
  test("tickers", () => expect(comparePair("compare $FLY vs $ZRO")).toEqual(["FLY", "ZRO"]))
  test("bare caps", () => expect(comparePair("WINDMILL or FLY, which is better?")).toEqual(["WINDMILL", "FLY"]))
  test("no comparison", () => expect(comparePair("is $FLY safe")).toBeNull())
})

describe("explainConcept", () => {
  test("definitions", () => {
    expect(explainConcept("what is a rug pull?")).toContain("take the money out")
    expect(explainConcept("how is the score calculated")).toContain("1 to 10")
    expect(explainConcept("what does funding mean")).toContain("longs")
  })
  test("token questions aren't definitions", () => {
    expect(explainConcept("what is $FLY")).toBeNull()
  })
})

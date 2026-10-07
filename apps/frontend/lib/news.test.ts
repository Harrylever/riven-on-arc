import { describe, expect, test } from "bun:test"
import { coinsIn, sentimentOf } from "./news"

const known = new Set(["BTC", "ETH", "SOL", "HYPE", "NEAR"])

describe("coinsIn", () => {
  test("finds coins by name and by ticker", () => {
    expect(coinsIn("Solana ETF approved as Bitcoin hits a record", known).sort()).toEqual(["BTC", "SOL"])
    expect(coinsIn("$HYPE and NEAR rally", known).sort()).toEqual(["HYPE", "NEAR"])
  })
  test("ignores caps words that aren't tickers", () => {
    expect(coinsIn("SEC CEO says the ETF is NEW", known)).toEqual([])
  })
})

describe("sentimentOf", () => {
  test("reads the direction of a headline", () => {
    expect(sentimentOf("Ethereum surges to record high after ETF approval")).toBe("bullish")
    expect(sentimentOf("Exchange hacked, tokens plunge as users rush out")).toBe("bearish")
    expect(sentimentOf("Developers meet in Lisbon")).toBe("neutral")
  })
})

import { describe, expect, test } from "bun:test"
import { DEFAULT_FILTERS, filtersToQuery, parseFilters, type ScreenerFilters } from "./screener-params"

const fromQuery = (q: string) => parseFilters(Object.fromEntries(new URLSearchParams(q.replace(/^\?/, ""))))

describe("screener params", () => {
  test("defaults produce an empty query", () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("")
  })
  test("non-default filters round-trip through the URL", () => {
    const f: ScreenerFilters = { ...DEFAULT_FILTERS, sort: "new", band: "risk", view: "caught", minLiq: 500, page: 3 }
    expect(fromQuery(filtersToQuery(f))).toEqual(f)
  })
  test("junk input is clamped to safe values", () => {
    const f = parseFilters({ page: "-3", minScore: "99", sort: "hacked", view: "nope" })
    expect(f.page).toBe(1)
    expect(f.minScore).toBe(10)
    expect(f.sort).toBe("trending")
    expect(f.view).toBe("listed")
  })
  test("old ?fake=1 links still show everything", () => {
    expect(parseFilters({ fake: "1" }).view).toBe("all")
  })
})

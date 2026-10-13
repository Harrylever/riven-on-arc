import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ListError, LIMITS, TABS, TabContent, parseLimit, parseTab } from "@/components/riven/markets-sections"

const ok = (tokens: unknown[]) => (async () => ({ tokens, total: tokens.length, page: 1, pages: 1 })) as never
const fails = (async () => {
  throw new Error("Query read timeout")
}) as never

describe("markets tabs", () => {
  test("an unknown tab or page size falls back to the defaults", () => {
    expect(parseTab("nope")).toBe("new")
    expect(parseTab(undefined)).toBe("new")
    expect(parseTab("flagged")).toBe("flagged")
    expect(parseLimit("7")).toBe(LIMITS[0])
    expect(parseLimit("50")).toBe(50)
  })
  test("every list says what it is and what it cannot promise", () => {
    expect(TABS.map((t) => t.id)).toEqual(["new", "volume", "safest", "flagged", "watchlist"])
    for (const t of TABS) expect(t.hint.length).toBeGreaterThan(20)
    expect(TABS.find((t) => t.id === "flagged")!.label).toBe("Flagged")
  })
})

describe("a list that cannot load", () => {
  test("says so instead of showing an empty all-clear", async () => {
    const html = renderToStaticMarkup(await TabContent({ tab: "flagged", limit: 25, serverNow: Date.now(), load: fails }))
    expect(html).toContain("Couldn&#x27;t load flagged just now")
    expect(html).toContain("not an all-clear")
    expect(html).toContain("Try again")
    expect(html).not.toContain("flagged nothing")
  })
  test("the retry link returns to the same tab", () => {
    expect(renderToStaticMarkup(<ListError tab="safest" />)).toContain('href="/markets?tab=safest"')
    expect(renderToStaticMarkup(<ListError tab="new" />)).toContain('href="/markets"')
  })
})

describe("a list that loaded but is empty", () => {
  test("flagged says it is not a guarantee", async () => {
    const html = renderToStaticMarkup(await TabContent({ tab: "flagged", limit: 25, serverNow: Date.now(), load: ok([]) }))
    expect(html).toContain("not a guarantee")
    expect(html).not.toContain("not an all-clear")
  })
  test("safest says it never guesses a score", async () => {
    const html = renderToStaticMarkup(await TabContent({ tab: "safest", limit: 25, serverNow: Date.now(), load: ok([]) }))
    expect(html).toContain("never guesses a score")
  })
})

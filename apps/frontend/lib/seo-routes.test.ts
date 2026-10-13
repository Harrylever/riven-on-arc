import { describe, expect, test } from "bun:test"
import type { Metadata } from "next"
import { metadata as accuracy } from "../app/accuracy/page"
import { metadata as agent } from "../app/agent/page"
import { metadata as alerts } from "../app/alerts/page"
import { metadata as ecosystem } from "../app/ecosystem/page"
import { metadata as markets } from "../app/markets/page"
import { metadata as methodology } from "../app/methodology/page"
import { metadata as more } from "../app/more/page"
import { metadata as perps } from "../app/perps/page"
import { metadata as trending } from "../app/trending/page"
import { metadata as portfolio } from "../app/portfolio/page"
import { metadata as search } from "../app/search/page"
import { metadata as watchlist } from "../app/watchlist/page"
import robots from "../app/robots"
import sitemap from "../app/sitemap"
import { generateMetadata as creatorMetadata } from "../app/creator/[wallet]/page"
import { generateMetadata as perpMetadata } from "../app/perps/[coin]/page"

function canonical(metadata: Metadata): string | null | URL | undefined {
  return metadata.alternates && "canonical" in metadata.alternates
    ? metadata.alternates.canonical
    : undefined
}

function openGraphUrl(metadata: Metadata): string | URL | undefined {
  return metadata.openGraph && "url" in metadata.openGraph
    ? metadata.openGraph.url
    : undefined
}

describe("route SEO", () => {
  test.each([
    ["/accuracy", accuracy],
    ["/agent", agent],
    ["/alerts", alerts],
    ["/ecosystem", ecosystem],
    ["/markets", markets],
    ["/methodology", methodology],
    ["/more", more],
    ["/perps", perps],
    ["/trending", trending],
  ])("%s owns its canonical and Open Graph URL", (path, metadata) => {
    expect(canonical(metadata)).toBe(path)
    expect(openGraphUrl(metadata)).toBe(path)
  })

  test.each([
    ["/portfolio", portfolio],
    ["/search", search],
    ["/watchlist", watchlist],
  ])("%s is crawlable but not indexable", (path, metadata) => {
    expect(canonical(metadata)).toBe(path)
    expect(metadata.robots).toEqual({ index: false, follow: true })
  })

  test("the root sitemap contains public landing pages, not private utilities", async () => {
    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).toContain("http://localhost:3000/perps")
    expect(urls).toContain("http://localhost:3000/more")
    expect(urls).not.toContain("http://localhost:3000/search")
    expect(urls).not.toContain("http://localhost:3000/portfolio")
  })

  test("robots lets crawlers read noindex pages and advertises all sitemap families", async () => {
    const result = await robots()
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
    const disallowed = rules.flatMap((rule) => rule.disallow ?? [])
    const advertised = Array.isArray(result.sitemap)
      ? result.sitemap
      : [result.sitemap]

    expect(disallowed).toEqual(["/api/"])
    expect(advertised).toContain("http://localhost:3000/sitemap.xml")
    expect(advertised).toContain("http://localhost:3000/token/sitemap/0.xml")
    expect(advertised).toContain("http://localhost:3000/creator/sitemap.xml")
    expect(advertised).toContain("http://localhost:3000/perps/sitemap.xml")
  })

  test("dynamic creator and perp pages canonicalize normalized route values", async () => {
    const creator = await creatorMetadata({
      params: Promise.resolve({
        wallet: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
      }),
    })
    const perp = await perpMetadata({
      params: Promise.resolve({ coin: "btc-usd" }),
    })

    expect(canonical(creator)).toBe(
      "/creator/0xabcdef0123456789abcdef0123456789abcdef01",
    )
    expect(openGraphUrl(creator)).toBe(
      "/creator/0xabcdef0123456789abcdef0123456789abcdef01",
    )
    expect(canonical(perp)).toBe("/perps/BTCUSD")
    expect(openGraphUrl(perp)).toBe("/perps/BTCUSD")
  })
})

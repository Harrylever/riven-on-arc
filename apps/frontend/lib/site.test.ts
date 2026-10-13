import { describe, expect, test } from "bun:test"
import type { Metadata, MetadataRoute } from "next"
import * as site from "./site"

type PageMetadataInput = {
  title: string
  description: string
  path: string
  index?: boolean
}

type TokenDatasetInput = {
  address: string
  name: string
  symbol: string
  verdict: string
  score: number | null
  launchedAt: string
  scoredAt: string | null
  liquidityUsd: number | null
  holders: number | null
}

const seo = site as typeof site & {
  buildPageMetadata(input: PageMetadataInput): Metadata
  buildSiteJsonLd(siteUrl: string): Record<string, unknown>
  buildTokenDatasetJsonLd(
    siteUrl: string,
    token: TokenDatasetInput,
  ): Record<string, unknown>
  serializeJsonLd(value: unknown): string
  staticSitemapEntries(
    siteUrl: string,
    perpsEnabled: boolean,
  ): MetadataRoute.Sitemap
  sitemapShardIds(total: number): Array<{ id: number }>
  sitemapShardUrls(
    siteUrl: string,
    segment: string,
    shards: Array<{ id: number }>,
  ): string[]
  retryOnce<T>(operation: () => Promise<T>): Promise<T>
}

describe("page metadata", () => {
  test("the configured production origin cannot create double-slash URLs", () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://riven.example///"
    try {
      expect(site.getSiteUrl()).toBe("https://riven.example")
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = previous
    }
  })

  test("a public route owns its canonical and social identity", () => {
    const metadata = seo.buildPageMetadata({
      title: "Markets",
      description: "Live Arc markets.",
      path: "/markets",
    })

    expect(metadata.alternates).toEqual({ canonical: "/markets" })
    expect(metadata.openGraph).toMatchObject({
      title: "Markets · Riven",
      description: "Live Arc markets.",
      url: "/markets",
    })
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Markets · Riven",
      description: "Live Arc markets.",
    })
    expect(metadata.robots).toEqual({ index: true, follow: true })
  })

  test("a private utility route asks crawlers not to index it", () => {
    const metadata = seo.buildPageMetadata({
      title: "Watchlist",
      description: "Tokens saved on this device.",
      path: "/watchlist",
      index: false,
    })

    expect(metadata.alternates).toEqual({ canonical: "/watchlist" })
    expect(metadata.robots).toEqual({ index: false, follow: true })
  })
})

describe("structured data", () => {
  test("the site graph ties the website to the Riven organization", () => {
    const data = seo.buildSiteJsonLd("https://riven.example/") as {
      "@context": string
      "@graph": Array<Record<string, unknown>>
    }

    expect(data["@context"]).toBe("https://schema.org")
    expect(data["@graph"]).toContainEqual(
      expect.objectContaining({
        "@type": "WebSite",
        "@id": "https://riven.example/#website",
        url: "https://riven.example/",
      }),
    )
    expect(data["@graph"]).toContainEqual(
      expect.objectContaining({
        "@type": "Organization",
        "@id": "https://riven.example/#organization",
        url: "https://riven.example/",
      }),
    )
  })

  test("a token dataset exposes the latest score without inventing missing values", () => {
    const data = seo.buildTokenDatasetJsonLd("https://riven.example", {
      address: "0xabc",
      name: "Example Token",
      symbol: "EXM",
      verdict: "Looks healthy.",
      score: 8.4,
      launchedAt: "2026-10-01T00:00:00.000Z",
      scoredAt: "2026-10-13T12:00:00.000Z",
      liquidityUsd: null,
      holders: 42,
    }) as {
      "@type": string
      url: string
      dateModified: string
      variableMeasured: Array<Record<string, unknown>>
    }

    expect(data["@type"]).toBe("Dataset")
    expect(data.url).toBe("https://riven.example/token/0xabc")
    expect(data.dateModified).toBe("2026-10-13T12:00:00.000Z")
    expect(data.variableMeasured).toEqual([
      {
        "@type": "PropertyValue",
        name: "Riven safety score",
        value: 8.4,
        minValue: 1,
        maxValue: 10,
      },
      { "@type": "PropertyValue", name: "Holders", value: 42 },
    ])
  })

  test("JSON-LD serialization cannot terminate its script element", () => {
    const serialized = seo.serializeJsonLd({
      name: "</script><script>alert(1)</script>",
    })

    expect(serialized).not.toContain("<")
    expect(serialized).toContain("\\u003c/script>")
  })
})

describe("sitemaps", () => {
  test("the public sitemap excludes private utilities and includes launched surfaces", () => {
    const urls = seo
      .staticSitemapEntries("https://riven.example/", true)
      .map((entry) => entry.url)

    expect(urls).toContain("https://riven.example/perps")
    expect(urls).toContain("https://riven.example/more")
    expect(urls).not.toContain("https://riven.example/search")
    expect(urls).not.toContain("https://riven.example/portfolio")
    expect(urls).not.toContain("https://riven.example/watchlist")
  })

  test("token totals are split into database-safe 10,000-row shards", () => {
    expect(seo.sitemapShardIds(0)).toEqual([{ id: 0 }])
    expect(seo.sitemapShardIds(10_000)).toEqual([{ id: 0 }])
    expect(seo.sitemapShardIds(10_001)).toEqual([{ id: 0 }, { id: 1 }])
  })

  test("robots can advertise every generated shard with stable URLs", () => {
    expect(
      seo.sitemapShardUrls("https://riven.example/", "token", [
        { id: 0 },
        { id: 1 },
      ]),
    ).toEqual([
      "https://riven.example/token/sitemap/0.xml",
      "https://riven.example/token/sitemap/1.xml",
    ])
  })

  test("a transient sitemap read is retried once", async () => {
    let attempts = 0
    const result = await seo.retryOnce(async () => {
      attempts += 1
      if (attempts === 1) throw new Error("temporary read timeout")
      return "ready"
    })

    expect(result).toBe("ready")
    expect(attempts).toBe(2)
  })

  test("a repeated sitemap read failure remains visible", async () => {
    let attempts = 0

    await expect(
      seo.retryOnce(async () => {
        attempts += 1
        throw new Error("database unavailable")
      }),
    ).rejects.toThrow("database unavailable")
    expect(attempts).toBe(2)
  })
})

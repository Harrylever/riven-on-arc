import type { MetadataRoute } from "next"
import { getDb } from "@riven/shared"
import { getSiteUrl } from "@/lib/site"

// Static, always-indexable routes. /watchlist is per-user, so it's left out.
const STATIC_ROUTES: Array<{
  path: string
  priority: number
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
}> = [
  { path: "/", priority: 1, changeFrequency: "hourly" },
  { path: "/trending", priority: 0.9, changeFrequency: "hourly" },
  { path: "/markets", priority: 0.9, changeFrequency: "hourly" },
  { path: "/alerts", priority: 0.8, changeFrequency: "hourly" },
  { path: "/methodology", priority: 0.7, changeFrequency: "weekly" },
  { path: "/agent", priority: 0.6, changeFrequency: "daily" },
  { path: "/ecosystem", priority: 0.6, changeFrequency: "daily" },
  { path: "/portfolio", priority: 0.4, changeFrequency: "weekly" },
  { path: "/search", priority: 0.4, changeFrequency: "weekly" },
]

/** Capped, most-relevant-first — an unbounded per-token sitemap isn't useful to crawlers. */
const MAX_TOKEN_URLS = 1000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${siteUrl}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  let tokenEntries: MetadataRoute.Sitemap = []
  try {
    const db = getDb()
    const tokens = await db.token.findMany({
      // Arc tokens with a pool only — anything else would 404.
      where: { mint: { startsWith: "0x" }, pools: { some: {} } },
      orderBy: { createdAt: "desc" },
      take: MAX_TOKEN_URLS,
      select: { mint: true, createdAt: true },
    })
    tokenEntries = tokens.map((t) => ({
      url: `${siteUrl}/token/${t.mint}`,
      lastModified: t.createdAt,
      changeFrequency: "hourly",
      priority: 0.5,
    }))
  } catch {
    // DB unreachable at build/request time — ship the static routes rather
    // than failing the whole sitemap.
  }

  return [...staticEntries, ...tokenEntries]
}

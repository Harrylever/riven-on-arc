import type { MetadataRoute } from "next"
import { getDb } from "@clawdex/shared"
import { getSiteUrl } from "@/lib/site"

// Static, always-indexable routes. /login and /watchlist are excluded — see
// robots.ts for why (no unique server-rendered content for a crawler).
const STATIC_ROUTES: Array<{
  path: string
  priority: number
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
}> = [
  { path: "/", priority: 1, changeFrequency: "hourly" },
  { path: "/terminal", priority: 0.9, changeFrequency: "hourly" },
  { path: "/agent", priority: 0.7, changeFrequency: "daily" },
  { path: "/ecosystem", priority: 0.6, changeFrequency: "daily" },
  { path: "/kol", priority: 0.6, changeFrequency: "hourly" },
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
      where: { discoveredVia: { not: "ON_DEMAND_RESOLUTION" } },
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

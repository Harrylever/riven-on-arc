import type { MetadataRoute } from "next"
import { getDb } from "@riven/shared"
import {
  getSiteUrl,
  retryOnce,
  sitemapShardIds,
  TOKEN_SITEMAP_PAGE_SIZE,
} from "@/lib/site"

const where = { mint: { startsWith: "0x" }, pools: { some: {} } } as const

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  try {
    const total = await retryOnce(() => getDb().token.count({ where }))
    return sitemapShardIds(total)
  } catch {
    // Keep one runtime-populated shard available when the DB is unavailable
    // during a build or crawler request.
    return sitemapShardIds(0)
  }
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  const shard = Number(await id)
  if (!Number.isSafeInteger(shard) || shard < 0) return []

  const tokens = await retryOnce(() =>
    getDb().token.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: shard * TOKEN_SITEMAP_PAGE_SIZE,
      take: TOKEN_SITEMAP_PAGE_SIZE,
      select: {
        mint: true,
        createdAt: true,
        arcMarket: { select: { updatedAt: true } },
        // The summary row, not scoreRuns: a nested "latest run" makes Prisma load every run of
        // every token in the shard, which drops the connection at this size.
        scoreLatest: { select: { scoredAt: true } },
      },
    }),
  )
  const siteUrl = getSiteUrl().replace(/\/+$/, "")
  return tokens.map((token) => ({
    url: `${siteUrl}/token/${token.mint.toLowerCase()}`,
    lastModified:
      token.scoreLatest?.scoredAt ??
      token.arcMarket?.updatedAt ??
      token.createdAt,
    changeFrequency: "hourly",
    priority: 0.5,
  }))
}

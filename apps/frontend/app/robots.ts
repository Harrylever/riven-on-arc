import type { MetadataRoute } from "next"
import { PERPS_ENABLED } from "@/lib/flags"
import { getSiteUrl, sitemapShardUrls } from "@/lib/site"
import { generateSitemaps as generateTokenSitemaps } from "./token/sitemap"

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = getSiteUrl()
  const tokenShards = await generateTokenSitemaps()
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Utility pages stay crawlable so their page-level noindex can be read.
      // JSON endpoints are never search results.
      disallow: ["/api/"],
    },
    sitemap: [
      `${siteUrl}/sitemap.xml`,
      ...sitemapShardUrls(siteUrl, "token", tokenShards),
      `${siteUrl}/creator/sitemap.xml`,
      ...(PERPS_ENABLED ? [`${siteUrl}/perps/sitemap.xml`] : []),
    ],
  }
}

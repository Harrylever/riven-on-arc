import type { MetadataRoute } from "next"
import { getSiteUrl } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /login: an auth entry point, no unique content to index.
      // /watchlist: purely a browser-localStorage view — empty for any
      // crawler, and whatever it renders is one visitor's own data anyway.
      // /api/*: JSON endpoints, not pages.
      disallow: ["/login", "/watchlist", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}

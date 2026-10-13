import type { MetadataRoute } from "next"
import { PERPS_ENABLED } from "@/lib/flags"
import { getSiteUrl, staticSitemapEntries } from "@/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  return staticSitemapEntries(getSiteUrl(), PERPS_ENABLED)
}

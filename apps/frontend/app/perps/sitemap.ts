import type { MetadataRoute } from "next"
import { getDb } from "@riven/shared"
import { PERPS_ENABLED } from "@/lib/flags"
import { getSiteUrl, retryOnce, SITEMAP_URL_LIMIT } from "@/lib/site"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!PERPS_ENABLED) return []

  const signals = await retryOnce(() =>
    getDb().perpSignal.findMany({
      distinct: ["symbol"],
      orderBy: { scanTime: "desc" },
      take: SITEMAP_URL_LIMIT,
      select: { symbol: true, scanTime: true },
    }),
  )
  const siteUrl = getSiteUrl().replace(/\/+$/, "")
  const coins = new Map<string, Date>()
  for (const signal of signals) {
    const coin = signal.symbol
      .toUpperCase()
      .replace(/USDT?$/, "")
      .replace(/[^A-Z0-9]/g, "")
    if (coin && !coins.has(coin)) coins.set(coin, signal.scanTime)
  }
  return [...coins].map(([coin, scanTime]) => ({
    url: `${siteUrl}/perps/${coin}`,
    lastModified: scanTime,
    changeFrequency: "hourly",
    priority: 0.4,
  }))
}

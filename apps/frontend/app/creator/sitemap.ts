import type { MetadataRoute } from "next"
import { getDb } from "@riven/shared"
import { getSiteUrl, retryOnce, SITEMAP_URL_LIMIT } from "@/lib/site"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // One grouped query: Prisma's `distinct` would pull every token into memory first.
  const creators = await retryOnce(() =>
    getDb().$queryRaw<Array<{ deployerWallet: string; launchTime: Date }>>`
      SELECT t."deployer_wallet" AS "deployerWallet", max(t."launch_time") AS "launchTime"
      FROM "tokens" t
      WHERE t."mint" LIKE '0x%' AND EXISTS (SELECT 1 FROM "pools" p WHERE p."token_id" = t."id")
      GROUP BY t."deployer_wallet"
      ORDER BY max(t."launch_time") DESC
      LIMIT ${SITEMAP_URL_LIMIT}`,
  )
  const siteUrl = getSiteUrl().replace(/\/+$/, "")
  return creators.map((creator) => ({
    url: `${siteUrl}/creator/${creator.deployerWallet.toLowerCase()}`,
    lastModified: creator.launchTime,
    changeFrequency: "daily",
    priority: 0.4,
  }))
}

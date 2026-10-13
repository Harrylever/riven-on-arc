import type { Metadata, MetadataRoute } from "next"

/**
 * Shared SEO/metadata constants. Site URL resolution mirrors lib/api.ts's
 * resolveBaseUrl so metadataBase, canonical URLs, sitemap and robots.txt all
 * agree with the same self-fetch logic already used elsewhere.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return withoutTrailingSlash(process.env.NEXT_PUBLIC_APP_URL)
  }
  if (process.env.VERCEL_URL) {
    return withoutTrailingSlash(`https://${process.env.VERCEL_URL}`)
  }
  return withoutTrailingSlash(`http://localhost:${process.env.PORT ?? 3000}`)
}

export const SITE_NAME = "Riven"

export const SITE_DESCRIPTION =
  "Riven is the anti-rug screener for Arc: live prices and volume for every token, plus a 1–10 safety score from on-chain facts — contract, liquidity, holders, creator history and real trading. Fakes are hidden. The score is never sold."

export const SITE_TAGLINE = "Every token on Arc, rug-checked."

export const SITEMAP_URL_LIMIT = 50_000
export const TOKEN_SITEMAP_PAGE_SIZE = 10_000

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

const STATIC_SITEMAP_ROUTES: Array<{
  path: string
  priority: number
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
}> = [
  { path: "/", priority: 1, changeFrequency: "hourly" },
  { path: "/trending", priority: 0.9, changeFrequency: "hourly" },
  { path: "/markets", priority: 0.9, changeFrequency: "hourly" },
  { path: "/alerts", priority: 0.8, changeFrequency: "hourly" },
  { path: "/methodology", priority: 0.7, changeFrequency: "weekly" },
  { path: "/accuracy", priority: 0.6, changeFrequency: "daily" },
  { path: "/agent", priority: 0.6, changeFrequency: "daily" },
  { path: "/ecosystem", priority: 0.6, changeFrequency: "daily" },
  { path: "/more", priority: 0.4, changeFrequency: "weekly" },
]

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

function absoluteUrl(siteUrl: string, path: string): string {
  const base = withoutTrailingSlash(siteUrl)
  return path === "/"
    ? `${base}/`
    : `${base}${path.startsWith("/") ? path : `/${path}`}`
}

export function buildPageMetadata({
  title,
  description,
  path,
  index = true,
}: PageMetadataInput): Metadata {
  const socialTitle = `${title} · ${SITE_NAME}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
    },
    robots: { index, follow: true },
  }
}

export function buildSiteJsonLd(siteUrl: string): Record<string, unknown> {
  const home = absoluteUrl(siteUrl, "/")
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        url: home,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${home}#organization` },
        inLanguage: "en",
      },
      {
        "@type": "Organization",
        "@id": `${home}#organization`,
        url: home,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        logo: absoluteUrl(siteUrl, "/android-chrome-512x512.png"),
      },
    ],
  }
}

export function buildTokenDatasetJsonLd(
  siteUrl: string,
  token: TokenDatasetInput,
): Record<string, unknown> {
  const url = absoluteUrl(siteUrl, `/token/${token.address}`)
  const variableMeasured = [
    token.score === null
      ? null
      : {
          "@type": "PropertyValue",
          name: "Riven safety score",
          value: token.score,
          minValue: 1,
          maxValue: 10,
        },
    token.liquidityUsd === null
      ? null
      : {
          "@type": "PropertyValue",
          name: "Liquidity in USD",
          value: token.liquidityUsd,
          unitCurrency: "USD",
        },
    token.holders === null
      ? null
      : { "@type": "PropertyValue", name: "Holders", value: token.holders },
  ].filter((value) => value !== null)

  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    url,
    name: `${token.symbol} token risk data on Arc`,
    description: token.verdict,
    creator: { "@id": `${absoluteUrl(siteUrl, "/")}#organization` },
    isAccessibleForFree: true,
    dateCreated: token.launchedAt,
    dateModified: token.scoredAt ?? token.launchedAt,
    about: {
      "@type": "Thing",
      name: token.name,
      alternateName: token.symbol,
      identifier: token.address,
    },
    variableMeasured,
  }
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

export function staticSitemapEntries(
  siteUrl: string,
  perpsEnabled: boolean,
): MetadataRoute.Sitemap {
  const routes = perpsEnabled
    ? [
        ...STATIC_SITEMAP_ROUTES,
        { path: "/perps", priority: 0.6, changeFrequency: "hourly" as const },
      ]
    : STATIC_SITEMAP_ROUTES
  return routes.map((route) => ({
    url: absoluteUrl(siteUrl, route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}

export function sitemapShardIds(total: number): Array<{ id: number }> {
  const count = Math.max(
    1,
    Math.ceil(Math.max(0, total) / TOKEN_SITEMAP_PAGE_SIZE),
  )
  return Array.from({ length: count }, (_, id) => ({ id }))
}

export function sitemapShardUrls(
  siteUrl: string,
  segment: string,
  shards: Array<{ id: number }>,
): string[] {
  const cleanSegment = segment.replace(/^\/+|\/+$/g, "")
  return shards.map(({ id }) =>
    absoluteUrl(siteUrl, `/${cleanSegment}/sitemap/${id}.xml`),
  )
}

export async function retryOnce<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch {
    return operation()
  }
}

/** Ends every agent answer and every signal view (AGENTS.md agent rule 2). */
export const DISCLAIMER = "Not financial advice. DYOR."

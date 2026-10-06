/**
 * Shared SEO/metadata constants. Site URL resolution mirrors lib/api.ts's
 * resolveBaseUrl so metadataBase, canonical URLs, sitemap and robots.txt all
 * agree with the same self-fetch logic already used elsewhere.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}

export const SITE_NAME = "Riven"

export const SITE_DESCRIPTION =
  "Riven is the anti-rug screener for Arc: live prices and volume for every token, plus a 1–10 safety score from on-chain facts — contract, liquidity, holders, creator history and real trading. Fakes are hidden. The score is never sold."

export const SITE_TAGLINE = "Every token on Arc, rug-checked."

/** Ends every agent answer and every signal view (AGENTS.md agent rule 2). */
export const DISCLAIMER = "Not financial advice. DYOR."

// Token art lives on IPFS. A public gateway answers for any address, but each throttles (a flood of token pictures
// on one page gets 429s), so the site uses one gateway and falls back to a second before it shows initials.
// Safe for client and server: no server-only imports.

export const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/"
export const IPFS_FALLBACK_GATEWAY = "https://4everland.io/ipfs/"

/** Other people's public gateways: the same content as ipfs://, so they are served from ours. */
const PUBLIC_GATEWAY = /^https:\/\/(?:ipfs\.io|dweb\.link|gateway\.ipfs\.io|w3s\.link|nftstorage\.link|cloudflare-ipfs\.com)\/ipfs\/(.+)$/i

/** A browsable address for a stored image, or null when it is not one we will load. */
export function imageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith("ipfs://")) return IPFS_GATEWAY + raw.slice("ipfs://".length)
  const gateway = PUBLIC_GATEWAY.exec(raw)
  if (gateway) return IPFS_GATEWAY + gateway[1]
  if (/^https?:\/\//i.test(raw)) return raw
  return null
}

/** The same image on the fallback gateway, or null if this address is not one of ours to swap. */
export function fallbackImageUrl(url: string): string | null {
  return url.startsWith(IPFS_GATEWAY) ? IPFS_FALLBACK_GATEWAY + url.slice(IPFS_GATEWAY.length) : null
}

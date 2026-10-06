// ClawPump's public token list carries socials and a graduation flag that
// ClawDex's own index does not store. Verified 2026-09-21 against
// https://clawpump.tech/api/tokens (no auth).

export interface ClawPumpInfo {
  twitter: string | null
  website: string | null
  telegram: string | null
  xVerified: boolean
  graduated: boolean
}

interface RawClawPumpToken {
  mintAddress?: string
  twitter?: string | null
  website?: string | null
  telegram?: string | null
  xVerified?: boolean
  isGraduated?: boolean
}

/** mint -> socials/graduation, for as many pages as `pages` covers (100 per page). */
export async function getClawPumpInfo(
  pages = 3,
): Promise<Map<string, ClawPumpInfo>> {
  const out = new Map<string, ClawPumpInfo>()

  const responses = await Promise.all(
    Array.from({ length: pages }, async (_, i) => {
      try {
        const res = await fetch(
          `https://clawpump.tech/api/tokens?sort=new&limit=100&offset=${i * 100}`,
          { next: { revalidate: 120 } },
        )
        if (!res.ok) return []
        const json = (await res.json()) as { tokens?: RawClawPumpToken[] }
        return json.tokens ?? []
      } catch (err) {
        console.error("ClawPump token list error:", err)
        return []
      }
    }),
  )

  for (const t of responses.flat()) {
    if (!t.mintAddress) continue
    out.set(t.mintAddress, {
      twitter: t.twitter ?? null,
      website: t.website ?? null,
      telegram: t.telegram ?? null,
      xVerified: Boolean(t.xVerified),
      graduated: Boolean(t.isGraduated),
    })
  }
  return out
}

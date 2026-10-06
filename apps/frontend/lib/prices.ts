/**
 * SOL/USD, used to express bonding-curve figures (which are denominated in SOL)
 * in the same units as the rest of the feed. Returns null rather than a guess
 * when the feed is unreachable, so callers leave the derived values unset.
 */
export async function getSolPriceUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 60 } },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { solana?: { usd?: number } }
    const usd = json.solana?.usd
    return typeof usd === "number" && usd > 0 ? usd : null
  } catch {
    return null
  }
}

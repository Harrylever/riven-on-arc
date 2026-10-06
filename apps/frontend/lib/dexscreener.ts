export interface DexScreenerTokenProfile {
  url: string
  chainId: string
  tokenAddress: string
  icon?: string
  header?: string
  description?: string
  links?: Array<{ type?: string; label?: string; url: string }>
}

export interface DexScreenerPair {
  chainId: string
  dexId: string
  url: string
  pairAddress: string
  baseToken: {
    address: string
    name: string
    symbol: string
  }
  quoteToken: {
    address: string
    name: string
    symbol: string
  }
  priceNative: string
  priceUsd?: string
  volume?: {
    h24?: number
    h6?: number
    h1?: number
    m5?: number
  }
  priceChange?: {
    m5?: number
    h1?: number
    h6?: number
    h24?: number
  }
  liquidity?: {
    usd?: number
    base: number
    quote: number
  }
  txns?: {
    h24?: { buys: number; sells: number }
    h1?: { buys: number; sells: number }
  }
  fdv?: number
  marketCap?: number
  pairCreatedAt?: number
  boosts?: {
    active?: number
  }
  info?: {
    imageUrl?: string
    header?: string
    websites?: Array<{ url: string; label?: string }>
    socials?: Array<{ type?: string; url: string }>
  }
}

export interface DexScreenerTokenBoost {
  url: string
  chainId: string
  tokenAddress: string
  amount?: number
  totalAmount?: number
  icon?: string
  header?: string
  description?: string
  links?: Array<{ type?: string; label?: string; url: string }>
}

/**
 * Fetch latest token profiles from DEX Screener API, filtered for Solana.
 */
export async function getLatestSolanaProfiles(): Promise<
  DexScreenerTokenProfile[]
> {
  try {
    const res = await fetch(
      "https://api.dexscreener.com/token-profiles/latest/v1",
      {
        next: { revalidate: 30 },
      },
    )
    if (!res.ok) return []
    const profiles = (await res.json()) as DexScreenerTokenProfile[]
    if (!Array.isArray(profiles)) return []
    return profiles.filter((p) => p.chainId === "solana")
  } catch (err) {
    console.error("DexScreener getLatestSolanaProfiles error:", err)
    return []
  }
}

/**
 * Fetch pairs and market data for a Solana token address.
 */
export async function getSolanaTokenPairs(
  tokenAddress: string,
): Promise<DexScreenerPair[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`,
      {
        next: { revalidate: 30 },
      },
    )
    if (!res.ok) return []
    const pairs = (await res.json()) as DexScreenerPair[]
    if (!Array.isArray(pairs)) return []
    return pairs
  } catch (err) {
    console.error(
      `DexScreener getSolanaTokenPairs error for ${tokenAddress}:`,
      err,
    )
    return []
  }
}

/**
 * Fetch pairs for many Solana tokens in one request (DexScreener allows up to
 * 30 comma-separated addresses), returning the highest-liquidity pair per token.
 */
export async function getSolanaPairsBatch(
  tokenAddresses: string[],
): Promise<Map<string, DexScreenerPair>> {
  const best = new Map<string, DexScreenerPair>()
  const unique = [...new Set(tokenAddresses)]

  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += 30)
    chunks.push(unique.slice(i, i + 30))

  // Chunks are fetched together: a full feed is several chunks, and running them
  // in sequence made first paint take as long as all of them added up.
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`,
          {
            next: { revalidate: 30 },
          },
        )
        if (!res.ok) return []
        const pairs = (await res.json()) as DexScreenerPair[]
        return Array.isArray(pairs) ? pairs : []
      } catch (err) {
        console.error("DexScreener getSolanaPairsBatch error:", err)
        return []
      }
    }),
  )

  for (const p of results.flat()) {
    const cur = best.get(p.baseToken.address)
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) {
      best.set(p.baseToken.address, p)
    }
  }
  return best
}

/**
 * Generate embed URL for DEX Screener chart.
 */
export function getDexScreenerEmbedUrl(pairAddress: string): string {
  return `https://dexscreener.com/solana/${pairAddress}?embed=1&theme=dark&trades=0&info=0`
}

/**
 * Fetch top and latest boosted tokens on Solana from DexScreener API.
 */
export async function getSolanaBoostedTokens(): Promise<
  { address: string; boosts: number; icon?: string }[]
> {
  try {
    const [topRes, latestRes] = await Promise.all([
      fetch("https://api.dexscreener.com/token-boosts/top/v1", {
        next: { revalidate: 15 },
      }).catch(() => null),
      fetch("https://api.dexscreener.com/token-boosts/latest/v1", {
        next: { revalidate: 15 },
      }).catch(() => null),
    ])

    const topJson =
      topRes && topRes.ok
        ? ((await topRes.json()) as DexScreenerTokenBoost[])
        : []
    const latestJson =
      latestRes && latestRes.ok
        ? ((await latestRes.json()) as DexScreenerTokenBoost[])
        : []

    const map = new Map<
      string,
      { address: string; boosts: number; icon?: string }
    >()

    for (const b of [...topJson, ...latestJson]) {
      if (b.chainId !== "solana" || !b.tokenAddress) continue
      const cur = map.get(b.tokenAddress)
      const amount = b.totalAmount ?? b.amount ?? 0
      if (!cur || amount > cur.boosts) {
        map.set(b.tokenAddress, {
          address: b.tokenAddress,
          boosts: amount,
          icon: b.icon,
        })
      }
    }
    return [...map.values()].sort((a, b) => b.boosts - a.boosts)
  } catch (err) {
    console.error("DexScreener getSolanaBoostedTokens error:", err)
    return []
  }
}

/**
 * Search DexScreener pairs across Solana tokens.
 */
export async function searchDexScreener(
  query: string,
): Promise<DexScreenerPair[]> {
  try {
    const clean = query.trim().replace(/^\$/, "")
    if (!clean) return []
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(clean)}`,
      {
        next: { revalidate: 10 },
      },
    )
    if (!res.ok) return []
    const json = (await res.json()) as { pairs?: DexScreenerPair[] }
    if (!Array.isArray(json.pairs)) return []
    return json.pairs.filter((p) => p.chainId === "solana")
  } catch (err) {
    console.error(`DexScreener search error for ${query}:`, err)
    return []
  }
}

/**
 * Fetch trending Solana pairs from GeckoTerminal as a high-volume market source.
 */
export async function getGeckoTerminalTrending(): Promise<string[]> {
  try {
    const res = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?include=base_token",
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 30 },
      },
    )
    if (!res.ok) return []
    const json = (await res.json()) as {
      data?: Array<{
        relationships?: { base_token?: { data?: { id?: string } } }
      }>
    }
    if (!Array.isArray(json.data)) return []
    return json.data
      .map((p) =>
        p.relationships?.base_token?.data?.id?.replace(/^solana_/, ""),
      )
      .filter((addr): addr is string => Boolean(addr))
  } catch (err) {
    console.error("GeckoTerminal trending error:", err)
    return []
  }
}

/**
 * Aggregates real-time trending Solana tokens (boosts + top volume pools),
 * returning enriched DexScreener pairs with boost counts attached.
 */
export async function getTrendingSolanaPairs(): Promise<DexScreenerPair[]> {
  try {
    const [boosted, trendingAddrs] = await Promise.all([
      getSolanaBoostedTokens(),
      getGeckoTerminalTrending(),
    ])

    const boostMap = new Map(boosted.map((b) => [b.address, b.boosts]))
    const targetAddrs = [
      ...new Set([...boosted.map((b) => b.address), ...trendingAddrs]),
    ]

    if (targetAddrs.length === 0) return []

    const pairMap = await getSolanaPairsBatch(targetAddrs)
    const pairs: DexScreenerPair[] = []

    for (const addr of targetAddrs) {
      const p = pairMap.get(addr)
      if (!p) continue
      const boostVal = boostMap.get(addr) ?? p.boosts?.active ?? 0
      pairs.push({
        ...p,
        boosts: boostVal > 0 ? { active: boostVal } : p.boosts,
      })
    }

    return pairs
  } catch (err) {
    console.error("DexScreener getTrendingSolanaPairs error:", err)
    return []
  }
}

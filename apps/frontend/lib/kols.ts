export interface MadeOnSolTrade {
  wallet_address: string
  kol_name?: string
  kol_twitter?: string
  kol_winrate_7d?: number
  kol_winrate_30d?: number
  token_mint: string
  token_name?: string
  token_symbol?: string
  token_image_url?: string | null
  launchpad?: string
  token_age_minutes?: number
  action: "buy" | "sell"
  sol_amount: number
  token_amount?: number
  market_cap_usd_at_trade?: number
  price_usd_at_trade?: number
  tx_signature?: string
  traded_at: string
}

export interface MadeOnSolFeedResponse {
  trades: MadeOnSolTrade[]
  count: number
  delay?: string
  as_of?: string
}

/**
 * Fetch recent KOL trades from MadeOnSol API using the server-side API key.
 */
export async function getMadeOnSolFeed(
  limit = 50,
): Promise<MadeOnSolFeedResponse> {
  const apiKey = process.env.MADEONSOL_API_KEY
  if (!apiKey) {
    console.warn("MADEONSOL_API_KEY is not set — KOL feed disabled")
    return { trades: [], count: 0 }
  }

  try {
    const url = new URL("https://madeonsol.com/api/v1/kol/feed")
    url.searchParams.set("limit", String(Math.min(limit, 100)))

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 30 },
    })

    if (!res.ok) {
      console.warn(`MadeOnSol API status ${res.status}: ${res.statusText}`)
      return { trades: [], count: 0 }
    }

    const data = (await res.json()) as MadeOnSolFeedResponse
    return {
      trades: data.trades ?? [],
      count: data.count ?? (data.trades ? data.trades.length : 0),
      delay: data.delay ?? "5m",
      as_of: data.as_of ?? new Date().toISOString(),
    }
  } catch (err) {
    console.error("Failed to fetch MadeOnSol KOL feed:", err)
    return { trades: [], count: 0 }
  }
}

/**
 * Fetch KOL trades filtered for a specific token mint.
 */
export async function getKOLTradesForToken(mint: string): Promise<{
  trades: MadeOnSolTrade[]
  buysCount: number
  sellsCount: number
  asOf: string
}> {
  const feed = await getMadeOnSolFeed(100)
  const matching = feed.trades.filter((t) => t.token_mint === mint)

  let buysCount = 0
  let sellsCount = 0

  for (const t of matching) {
    if (t.action === "buy") buysCount++
    else if (t.action === "sell") sellsCount++
  }

  return {
    trades: matching,
    buysCount,
    sellsCount,
    asOf: feed.as_of ?? new Date().toISOString(),
  }
}

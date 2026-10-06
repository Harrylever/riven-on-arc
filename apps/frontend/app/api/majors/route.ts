import { NextResponse } from "next/server"

// Live market data: never served from a build-time or route cache.
export const dynamic = "force-dynamic"

// Majors are not Solana memecoins and are not scored by ClawDex; this is a
// price reference only, read straight from CoinGecko's public endpoint.

const IDS = [
  ["bitcoin", "BTC", "Bitcoin"],
  ["ethereum", "ETH", "Ethereum"],
  ["solana", "SOL", "Solana"],
  ["binancecoin", "BNB", "BNB"],
  ["ripple", "XRP", "XRP"],
  ["dogecoin", "DOGE", "Dogecoin"],
  ["cardano", "ADA", "Cardano"],
  ["avalanche-2", "AVAX", "Avalanche"],
  ["chainlink", "LINK", "Chainlink"],
  ["sui", "SUI", "Sui"],
] as const

const LOGOS: Record<string, string> = {
  bitcoin: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  ethereum: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  solana: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  binancecoin:
    "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  ripple:
    "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png",
  dogecoin: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png",
  cardano: "https://assets.coingecko.com/coins/images/975/small/cardano.png",
  "avalanche-2":
    "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  chainlink:
    "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
  sui: "https://assets.coingecko.com/coins/images/26375/small/sui-ocean-square.png",
}

export interface Major {
  id: string
  symbol: string
  name: string
  priceUsd: number | null
  change24h: number | null
  marketCapUsd: number | null
  logoUrl?: string
}

/** GET /api/majors — reference prices for large-cap assets with official logos. */
export async function GET() {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${IDS.map((i) => i[0]).join(",")}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
      { next: { revalidate: 30 } },
    )
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
    const json = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number; usd_market_cap?: number }
    >

    const majors: Major[] = IDS.map(([id, symbol, name]) => ({
      id,
      symbol,
      name,
      priceUsd: json[id]?.usd ?? null,
      change24h: json[id]?.usd_24h_change ?? null,
      marketCapUsd: json[id]?.usd_market_cap ?? null,
      logoUrl:
        LOGOS[id] ||
        `https://assets.coingecko.com/coins/images/1/small/${id}.png`,
    }))

    return NextResponse.json({ majors, source: "CoinGecko" })
  } catch (err) {
    console.error("[api/majors]", (err as Error).message)
    // Robust fallback with default prices if CoinGecko is rate-limited
    const fallbacks: Major[] = IDS.map(([id, symbol, name]) => ({
      id,
      symbol,
      name,
      priceUsd:
        id === "bitcoin"
          ? 64200
          : id === "ethereum"
            ? 3480
            : id === "solana"
              ? 148
              : null,
      change24h: 1.5,
      marketCapUsd: null,
      logoUrl: LOGOS[id],
    }))
    return NextResponse.json({ majors: fallbacks, source: "Fallback" })
  }
}

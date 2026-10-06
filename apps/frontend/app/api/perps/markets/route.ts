import { NextResponse } from "next/server"
import { getHyperliquidMarkets } from "@/lib/hyperliquid"

// Cached for 10 seconds to deliver high responsiveness while avoiding spamming
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const markets = await getHyperliquidMarkets()
    return NextResponse.json({
      markets,
      count: markets.length,
      updatedAt: Date.now(),
    })
  } catch (err) {
    console.error(
      "[api/perps/markets] Failed to fetch Hyperliquid markets:",
      err,
    )
    return NextResponse.json(
      {
        error: "Failed to fetch perpetual markets",
        markets: [],
      },
      { status: 500 },
    )
  }
}

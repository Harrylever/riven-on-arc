import { NextResponse } from "next/server"
import {
  getHyperliquidCandles,
  getHyperliquidOrderbook,
} from "@/lib/hyperliquid"

export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  props: { params: Promise<{ coin: string }> },
) {
  const { coin } = await props.params
  const { searchParams } = new URL(req.url)
  const intervalParam = searchParams.get("interval") || "1h"
  const validIntervals = ["15m", "1h", "4h", "1d"] as const
  const interval = validIntervals.includes(
    intervalParam as (typeof validIntervals)[number],
  )
    ? (intervalParam as (typeof validIntervals)[number])
    : "1h"

  try {
    const symbol = coin.toUpperCase()
    const [candles, orderbook] = await Promise.all([
      getHyperliquidCandles(symbol, interval, 72),
      getHyperliquidOrderbook(symbol, 12),
    ])

    return NextResponse.json({
      coin: symbol,
      interval,
      candles,
      orderbook,
      updatedAt: Date.now(),
    })
  } catch (err) {
    console.error(`[api/perps/${coin}] Failed to fetch coin details:`, err)
    return NextResponse.json(
      {
        error: `Failed to fetch perpetual data for ${coin}`,
        candles: [],
        orderbook: null,
      },
      { status: 500 },
    )
  }
}

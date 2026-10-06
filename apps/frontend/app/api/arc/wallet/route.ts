import { NextResponse } from "next/server"
import { walletBalances } from "@/lib/arc-trade"
import { getPortfolio } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

/** GET /api/arc/wallet?address=0x… — USDC/EURC balances and scored token holdings. */
export async function GET(req: Request) {
  const address = (
    new URL(req.url).searchParams.get("address") ?? ""
  ).toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Enter a valid 0x address" },
      { status: 400 },
    )
  }
  try {
    const [balances, portfolio] = await Promise.all([
      walletBalances(address),
      getPortfolio(address),
    ])
    return NextResponse.json({
      address,
      ...balances,
      holdings: portfolio?.holdings ?? [],
      atRisk: portfolio?.atRisk ?? 0,
    })
  } catch (err) {
    console.error(`[arc/wallet] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

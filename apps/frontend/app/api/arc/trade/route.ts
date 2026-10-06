import { NextResponse } from "next/server"
import { buildTrade } from "@/lib/arc-trade"

export const dynamic = "force-dynamic"

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/**
 * POST /api/arc/trade { token, side, amount, wallet, slippageBps }
 * Returns a live quote plus the UNSIGNED transactions (approvals, then the swap)
 * for the user's own wallet to sign. Nothing is signed or sent here.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const token = String(body.token ?? "")
  const wallet = String(body.wallet ?? "")
  const side = body.side === "sell" ? "sell" : "buy"
  if (!ADDRESS.test(token) || !ADDRESS.test(wallet)) {
    return NextResponse.json({ error: "Token and wallet must be 0x addresses" }, { status: 400 })
  }
  try {
    const result = await buildTrade({
      token,
      side,
      amount: String(body.amount ?? ""),
      wallet,
      slippageBps: Number(body.slippageBps ?? 300),
    })
    return NextResponse.json(result, { status: "error" in result ? 422 : 200 })
  } catch (err) {
    console.error(`[arc/trade] ${(err as Error).message}`)
    return NextResponse.json({ error: "Couldn't build this trade right now" }, { status: 503 })
  }
}

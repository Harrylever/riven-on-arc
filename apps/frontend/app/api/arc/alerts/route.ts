import { NextResponse } from "next/server"
import { getAlerts } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

/** GET /api/arc/alerts?addresses=0x..,0x.. — anti-rug alerts, optionally for specific tokens. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("addresses")
  const addresses = raw
    ? raw
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 100)
    : undefined
  try {
    return NextResponse.json({
      alerts: await getAlerts({ addresses, limit: 50 }),
    })
  } catch (err) {
    console.error(`[arc/alerts] ${(err as Error).message}`)
    return NextResponse.json(
      { alerts: [], error: "unavailable" },
      { status: 503 },
    )
  }
}

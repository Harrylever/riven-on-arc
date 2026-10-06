import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PerpsClient } from "@/components/perps/perps-client"
import { PERPS_ENABLED } from "@/lib/flags"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Perps terminal",
  description:
    "Hyperliquid perps with TradingView charts, order book, funding, sakz-bot signals, pair tracking and price alerts.",
}

export default function PerpsPage() {
  if (!PERPS_ENABLED) notFound()
  return <PerpsClient />
}

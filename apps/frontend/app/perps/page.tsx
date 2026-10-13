import { notFound } from "next/navigation"
import { PerpsClient } from "@/components/perps/perps-client"
import { PERPS_ENABLED } from "@/lib/flags"
import { buildPageMetadata } from "@/lib/site"

export const dynamic = "force-dynamic"

export const metadata = buildPageMetadata({
  title: "Perps terminal",
  description:
    "Live perp markets with TradingView charts, order book, funding, Riven Scanner calls, pair tracking and price alerts.",
  path: "/perps",
})

export default function PerpsPage() {
  if (!PERPS_ENABLED) notFound()
  return <PerpsClient />
}

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PerpPairClient } from "@/components/perps/perp-pair-client"
import { PERPS_ENABLED } from "@/lib/flags"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ coin: string }> }): Promise<Metadata> {
  const { coin } = await params
  const c = coin.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return {
    title: `${c}-PERP · chart, signals & news`,
    description: `${c} perpetual: live chart, paper trading, Riven Scanner calls, alerts and the news moving it — read by Riven.`,
  }
}

export default async function PerpPairPage({ params }: { params: Promise<{ coin: string }> }) {
  if (!PERPS_ENABLED) notFound()
  const { coin } = await params
  const c = coin.toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!c) notFound()
  return <PerpPairClient coin={c} />
}

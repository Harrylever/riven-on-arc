import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCallouts, getTokenDetail } from "@/lib/arc-data"
import { BAND_META } from "@/lib/riven-format"
import { TokenView } from "@/components/riven/token-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mint: string }>
}): Promise<Metadata> {
  const { mint } = await params
  const t = await getTokenDetail(mint).catch(() => null)
  if (!t) return { title: "Token not found" }
  const score =
    t.score === null
      ? "not scored yet"
      : `${t.score.toFixed(1)}/10 · ${BAND_META[t.band].short}`
  return {
    title: `${t.symbol} — ${score}`,
    description: `${t.verdict} ${t.name} on Arc, scored by Riven on contract, liquidity, holders, creator and activity.`,
    alternates: { canonical: `/token/${t.address}` },
  }
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ mint: string }>
}) {
  const { mint } = await params
  const [t, callouts] = await Promise.all([getTokenDetail(mint), getCallouts(8, mint).catch(() => [])])
  if (!t) notFound()
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  return <TokenView t={t} callouts={callouts} serverNow={now} />
}

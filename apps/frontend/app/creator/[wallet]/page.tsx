import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCreatorRecord } from "@/lib/arc-data"
import { CreatorTrack } from "@/components/riven/token-view"
import { shortAddr } from "@/lib/riven-format"
import { buildPageMetadata } from "@/lib/site"
import { Card } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ wallet: string }>
}): Promise<Metadata> {
  const { wallet } = await params
  const address = wallet.toLowerCase()
  return buildPageMetadata({
    title: `Creator ${shortAddr(address)}`,
    description:
      "Every Arc token this wallet has launched, and how each turned out.",
    path: `/creator/${address}`,
    index: /^0x[0-9a-f]{40}$/.test(address),
  })
}

/** A creator's whole launch history, from Riven's own index of every Argus and Tolly launch. */
export default async function CreatorPage({
  params,
}: {
  params: Promise<{ wallet: string }>
}) {
  const { wallet } = await params
  const addr = wallet.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(addr)) notFound()
  const record = await getCreatorRecord(addr).catch(() => null)
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[28px] font-extrabold text-[var(--rv-ink)]">
          Creator {shortAddr(addr)}
        </h1>
        <p className="mt-1 text-[14px] text-[var(--rv-ink-2)]">
          Every Arc token this wallet has launched, with how each turned out.
          Facts from the chain, not a verdict on the person.
        </p>
      </header>
      {record === null ? (
        <Card
          variant="riven"
          className="px-6 py-10 text-center text-[var(--rv-ink-2)]"
        >
          Riven has not seen this wallet launch a token, or the record is
          unavailable right now.
        </Card>
      ) : (
        <CreatorTrack
          record={record}
          now={now}
          title="Launch history"
          link={false}
        />
      )}
    </div>
  )
}

import Link from "next/link"
import { getRugRadar } from "@/lib/arc-data"
import { age } from "@/lib/riven-format"
import { TokenAvatar } from "@/components/riven/token-avatar"
import { AlertSettings } from "@/components/riven/alert-settings"
import { TelegramConnect } from "@/components/riven/telegram-connect"
import { PageHero } from "@/components/riven/page-hero"
import type { Holo } from "@/components/mascot/mascot"
import { buildPageMetadata } from "@/lib/site"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { PageNav } from "@/components/riven/page-nav"

export const dynamic = "force-dynamic"
export const metadata = buildPageMetadata({
  title: "Rug radar",
  description: "Live anti-rug alerts for Arc tokens.",
  path: "/alerts",
})

const META: Record<string, { label: string; color: string }> = {
  RUG_PULL: { label: "Liquidity pulled", color: "var(--rv-risk)" },
  CREATOR_DUMP: { label: "Creator sold", color: "var(--rv-risk)" },
  WHALE_DUMP: { label: "Whale sold", color: "var(--rv-caution)" },
  SCORE_DROP: { label: "Score drop", color: "var(--rv-caution)" },
}

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = Math.floor(Number((await searchParams).page))
  const requested = Number.isFinite(raw) && raw >= 1 ? raw : 1
  // A failed read must never look like "no rugs": keep the two states apart.
  const radar = await getRugRadar(requested).catch((err: Error) => {
    console.error(`[alerts] ${err.message}`)
    return null
  })
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  const alerts = radar?.alerts ?? null
  const day = radar?.last24h.total ?? 0
  const count = (t: string) => radar?.last24h.byType[t] ?? 0
  const latest = radar?.latest ?? null
  const holos: Holo[] = radar
    ? [
        { title: "Caught · 24h", value: String(day), note: "Pulls, creator sells, whale sells, score drops", tone: day ? "red" : "green" },
        {
          title: "By type · 24h",
          value: `${count("RUG_PULL")} pulled`,
          note: `${count("CREATOR_DUMP")} creator sells · ${count("WHALE_DUMP")} whale sells`,
          bars: ["RUG_PULL", "CREATOR_DUMP", "WHALE_DUMP", "SCORE_DROP"].map((t) => Math.min(1, count(t) / Math.max(1, day))),
          tone: "amber",
        },
        ...(latest ? [{ title: `Latest · ${latest.token.symbol}`, value: META[latest.type]?.label ?? latest.type, note: `${age(latest.createdAt, now)} ago`, tone: "red" as const }] : []),
      ]
    : []
  return (
    <div className="flex flex-col gap-4">
      <PageHero
        eyebrow="Watching Arc around the clock"
        title="Rug radar"
        mood={day ? "warn" : "happy"}
        holos={holos}
        lines={[
          "I watch for pulled liquidity, creator sells and whale sells, around the clock.",
          "Star a token and I'll ping you if it gets rugged.",
          "Every alert links to the on-chain evidence.",
        ]}
        greet={day ? `${day} caught in the last 24h. Stay sharp.` : "Quiet so far today. I'm still watching."}
      >
        Every time liquidity gets pulled, a creator sells out, a whale sells 5%+ of supply, or a score collapses on Arc.
      </PageHero>
      <AlertSettings />
      <TelegramConnect />
      {radar === null || alerts === null ? (
        <Alert variant="destructive" className="rounded-[var(--rv-radius)] border-[color:var(--rv-risk)]/30 bg-[var(--rv-risk)]/10 after:hidden">
          <AlertTitle>Alerts unavailable right now</AlertTitle>
          <AlertDescription>Riven couldn&apos;t read its alert log. This is not an all-clear: check back in a moment.</AlertDescription>
        </Alert>
      ) : alerts.length === 0 ? (
        <Empty className="rv-card">
          <EmptyHeader>
            <EmptyTitle className="text-lg text-[var(--rv-ink)]">Quiet for now</EmptyTitle>
            <EmptyDescription className="text-sm text-[var(--rv-ink-2)]">No rugs, dumps or score drops caught yet. Riven keeps watching.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ol className="rv-card divide-y divide-[var(--rv-stroke)]">
            {alerts.map((a) => {
              const m = META[a.type] ?? { label: a.type, color: "var(--rv-ink-2)" }
              return (
                <li key={a.id}>
                  <Link href={`/token/${a.token.address}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--rv-row-hover)]">
                    <TokenAvatar image={a.token.image} symbol={a.token.symbol} address={a.token.address} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--rv-ink)]">{a.token.symbol}</span>
                        <Badge
                          variant="neutral"
                          className="rounded border-transparent bg-white/[0.04] px-1.5 py-0 text-[10px] font-bold uppercase"
                          style={{ color: m.color }}
                        >
                          {m.label}
                        </Badge>
                      </div>
                      <p className="truncate text-[13px] text-[var(--rv-ink-2)]">{a.message}</p>
                    </div>
                    <span className="rv-num text-[12px] text-[var(--rv-ink-3)]">{age(a.createdAt, now)} ago</span>
                  </Link>
                </li>
              )
            })}
          </ol>
          <p className="text-center text-[12px] text-[var(--rv-ink-3)]">
            {radar.total.toLocaleString("en-US")} alerts in all · page {radar.page} of {radar.pages}
          </p>
          <PageNav page={radar.page} pages={radar.pages} path="/alerts" query={{}} />
          {requested > radar.pages && (
            <Button variant="outline" nativeButton={false} render={<Link href="/alerts" />} className="mx-auto h-9 px-4 text-[13px] tracking-normal normal-case">
              Back to the newest
            </Button>
          )}
        </>
      )}
    </div>
  )
}

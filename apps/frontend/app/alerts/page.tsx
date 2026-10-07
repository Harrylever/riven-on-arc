import type { Metadata } from "next"
import Link from "next/link"
import { getAlerts } from "@/lib/arc-data"
import { age } from "@/lib/riven-format"
import { TokenAvatar } from "@/components/riven/token-avatar"
import { AlertSettings } from "@/components/riven/alert-settings"
import { TelegramConnect } from "@/components/riven/telegram-connect"
import { PageHero } from "@/components/riven/page-hero"
import type { Holo } from "@/components/mascot/mascot"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Rug radar",
  description: "Live anti-rug alerts for Arc tokens.",
}

const META: Record<string, { label: string; color: string }> = {
  RUG_PULL: { label: "Liquidity pulled", color: "var(--rv-risk)" },
  CREATOR_DUMP: { label: "Creator sold", color: "var(--rv-risk)" },
  WHALE_DUMP: { label: "Whale sold", color: "var(--rv-caution)" },
  SCORE_DROP: { label: "Score drop", color: "var(--rv-caution)" },
}

export default async function AlertsPage() {
  // A failed read must never look like "no rugs": keep the two states apart.
  const alerts = await getAlerts({ limit: 100 }).catch((err: Error) => {
    console.error(`[alerts] ${err.message}`)
    return null
  })
  // eslint-disable-next-line react-hooks/purity -- per-request server render
  const now = Date.now()
  const day = (alerts ?? []).filter((a) => now - new Date(a.createdAt).getTime() < 24 * 3600_000)
  const count = (t: string) => day.filter((a) => a.type === t).length
  const holos: Holo[] = alerts
    ? [
        { title: "Caught · 24h", value: String(day.length), note: "Pulls, creator sells, whale sells, score drops", tone: day.length ? "red" : "green" },
        {
          title: "By type · 24h",
          value: `${count("RUG_PULL")} pulled`,
          note: `${count("CREATOR_DUMP")} creator sells · ${count("WHALE_DUMP")} whale sells`,
          bars: ["RUG_PULL", "CREATOR_DUMP", "WHALE_DUMP", "SCORE_DROP"].map((t) => Math.min(1, count(t) / Math.max(1, day.length))),
          tone: "amber",
        },
        ...(alerts[0] ? [{ title: `Latest · ${alerts[0].token.symbol}`, value: META[alerts[0].type]?.label ?? alerts[0].type, note: `${age(alerts[0].createdAt, now)} ago`, tone: "red" as const }] : []),
      ]
    : []
  return (
    <div className="flex flex-col gap-4">
      <PageHero
        eyebrow="Watching Arc around the clock"
        title="Rug radar"
        mood={day.length ? "warn" : "happy"}
        holos={holos}
        lines={[
          "I watch for pulled liquidity, creator sells and whale sells, around the clock.",
          "Star a token and I'll ping you if it gets rugged.",
          "Every alert links to the on-chain evidence.",
        ]}
        greet={day.length ? `${day.length} caught in the last 24h. Stay sharp.` : "Quiet so far today. I'm still watching."}
      >
        Every time liquidity gets pulled, a creator sells out, a whale sells 5%+ of supply, or a score collapses on Arc.
      </PageHero>
      <AlertSettings />
      <TelegramConnect />
      {alerts === null ? (
        <div className="rv-card px-6 py-10 text-center" role="alert">
          <p className="text-lg font-bold text-[var(--rv-caution)]">
            Alerts unavailable right now
          </p>
          <p className="mt-1 text-sm text-[var(--rv-ink-2)]">
            Riven couldn&apos;t read its alert log. This is not an all-clear —
            check back in a moment.
          </p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="rv-card px-6 py-10 text-center">
          <p className="text-lg font-bold text-[var(--rv-ink)]">
            Quiet for now
          </p>
          <p className="mt-1 text-sm text-[var(--rv-ink-2)]">
            No rugs, dumps or score drops caught yet. Riven keeps watching.
          </p>
        </div>
      ) : (
        <ol className="rv-card divide-y divide-[var(--rv-stroke)]">
          {alerts.map((a) => {
            const m = META[a.type] ?? {
              label: a.type,
              color: "var(--rv-ink-2)",
            }
            return (
              <li key={a.id}>
                <Link
                  href={`/token/${a.token.address}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--rv-row-hover)]"
                >
                  <TokenAvatar
                    image={a.token.image}
                    symbol={a.token.symbol}
                    address={a.token.address}
                    size={34}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--rv-ink)]">
                        {a.token.symbol}
                      </span>
                      <span
                        className="rounded px-1.5 text-[10px] font-bold uppercase"
                        style={{
                          color: m.color,
                          background: "rgba(255,255,255,0.04)",
                        }}
                      >
                        {m.label}
                      </span>
                    </div>
                    <p className="truncate text-[13px] text-[var(--rv-ink-2)]">
                      {a.message}
                    </p>
                  </div>
                  <span className="rv-num text-[12px] text-[var(--rv-ink-3)]">
                    {age(a.createdAt, now)} ago
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { getAlerts } from "@/lib/arc-data"
import { age } from "@/lib/riven-format"
import { TokenAvatar } from "@/components/riven/token-avatar"
import { AlertSettings } from "@/components/riven/alert-settings"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Rug radar",
  description: "Live anti-rug alerts for Arc tokens.",
}

const META: Record<string, { label: string; color: string }> = {
  RUG_PULL: { label: "Rug pull", color: "var(--rv-risk)" },
  CREATOR_DUMP: { label: "Creator dump", color: "var(--rv-risk)" },
  WHALE_DUMP: { label: "Whale dump", color: "var(--rv-caution)" },
  SCORE_DROP: { label: "Score drop", color: "var(--rv-caution)" },
}

export default async function AlertsPage() {
  // A failed read must never look like "no rugs": keep the two states apart.
  const alerts = await getAlerts({ limit: 100 }).catch((err: Error) => {
    console.error(`[alerts] ${err.message}`)
    return null
  })
  const now = Date.now()
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="rv-display text-[28px] font-extrabold text-[var(--rv-ink)]">
          Rug radar
        </h1>
        <p className="rv-body text-[14px] text-[var(--rv-ink-2)]">
          Every time liquidity gets pulled, a creator dumps, a whale sells 5%+
          of supply, or a score collapses on Arc.
        </p>
      </header>
      <AlertSettings />
      {alerts === null ? (
        <div className="rv-card px-6 py-10 text-center" role="alert">
          <p className="rv-display text-lg font-bold text-[var(--rv-caution)]">
            Alerts unavailable right now
          </p>
          <p className="rv-body mt-1 text-sm text-[var(--rv-ink-2)]">
            Riven couldn&apos;t read its alert log. This is not an all-clear —
            check back in a moment.
          </p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="rv-card px-6 py-10 text-center">
          <p className="rv-display text-lg font-bold text-[var(--rv-ink)]">
            Quiet for now
          </p>
          <p className="rv-body mt-1 text-sm text-[var(--rv-ink-2)]">
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
                      <span className="rv-body font-semibold text-[var(--rv-ink)]">
                        {a.token.symbol}
                      </span>
                      <span
                        className="rv-body rounded px-1.5 text-[10px] font-bold uppercase"
                        style={{
                          color: m.color,
                          background: "rgba(255,255,255,0.04)",
                        }}
                      >
                        {m.label}
                      </span>
                    </div>
                    <p className="rv-body truncate text-[13px] text-[var(--rv-ink-2)]">
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

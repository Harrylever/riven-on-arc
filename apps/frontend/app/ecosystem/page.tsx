import type { Metadata } from "next"
import Link from "next/link"
import { EXPLORER, getEcosystem } from "@/lib/arc-data"
import { shortAddr, usd } from "@/lib/riven-format"
import { ScoreBadge } from "@/components/riven/score-badge"
import { TokenAvatar } from "@/components/riven/token-avatar"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Ecosystem",
  description: "Arc launchpads compared: launches, fakes, risk and volume.",
}

export default async function EcosystemPage() {
  const eco = await getEcosystem().catch(() => null)
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="rv-display text-[28px] font-extrabold text-[var(--rv-ink)]">
          Arc ecosystem
        </h1>
        <p className="rv-body text-[14px] text-[var(--rv-ink-2)]">
          Where tokens launch on Arc, and how many of them are real. Last 24
          hours.
        </p>
      </header>
      {!eco ? (
        <div className="rv-card px-6 py-10 text-center text-[var(--rv-ink-2)]">
          Ecosystem data is unavailable right now.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {eco.pads.map((p) => (
              <section key={p.name} className="rv-card p-4">
                <h2 className="rv-display text-[18px] font-bold text-[var(--rv-ink)]">
                  {p.name}
                </h2>
                <dl className="rv-num mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <Cell label="Launches" value={String(p.launches)} />
                  <Cell label="Volume 24h" value={usd(p.volume24h)} />
                  <Cell
                    label="Caught faking"
                    value={`${p.fakePct}%`}
                    color="var(--rv-risk)"
                  />
                  <Cell
                    label="Risky / healthy"
                    value={`${p.riskyPct}% / ${p.healthy}`}
                    color="var(--rv-caution)"
                  />
                </dl>
                {p.best && (
                  <Link
                    href={`/token/${p.best.address}`}
                    className="mt-3 flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2 hover:bg-white/[0.06]"
                  >
                    <TokenAvatar
                      image={p.best.image}
                      symbol={p.best.symbol}
                      address={p.best.address}
                      size={26}
                    />
                    <span className="rv-body flex-1 truncate text-[13px] font-semibold text-[var(--rv-ink)]">
                      Top real token: {p.best.symbol}
                    </span>
                    <ScoreBadge
                      score={p.best.score}
                      band={p.best.band}
                      size="sm"
                    />
                  </Link>
                )}
              </section>
            ))}
          </div>
          <section className="rv-card p-4">
            <h2 className="rv-display text-[18px] font-bold text-[var(--rv-ink)]">
              Most active creators · 24h
            </h2>
            <p className="rv-body text-[12px] text-[var(--rv-ink-3)]">
              Wallets launching many tokens a day are usually farming, not
              building.
            </p>
            <ol className="mt-3 divide-y divide-[var(--rv-stroke)]">
              {eco.serial.map(([wallet, n], i) => (
                <li
                  key={wallet}
                  className="rv-num flex items-center gap-3 py-2 text-[13px]"
                >
                  <span className="w-5 text-[var(--rv-ink-3)]">{i + 1}</span>
                  <a
                    href={`${EXPLORER}/address/${wallet}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--rv-ink-2)] hover:text-[var(--rv-ice)]"
                  >
                    {shortAddr(wallet)}
                  </a>
                  <span
                    className="ml-auto font-semibold"
                    style={{
                      color:
                        n >= 10
                          ? "var(--rv-risk)"
                          : n >= 4
                            ? "var(--rv-caution)"
                            : "var(--rv-ink)",
                    }}
                  >
                    {n} launches
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}

function Cell({
  label,
  value,
  color = "var(--rv-ink)",
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
      <dt className="text-[var(--rv-ink-3)]">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold" style={{ color }}>
        {value}
      </dd>
    </div>
  )
}

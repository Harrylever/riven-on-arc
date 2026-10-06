import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  FireIcon,
  LockIcon,
  Shield01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

const SCORE_INPUTS: {
  icon: IconSvgElement
  title: string
  body: string
  note: string
}[] = [
  {
    icon: Shield01Icon,
    title: "Contract authority",
    body: "EVM owner controls, mint selectors and proxy implementation indicators; bytecode matching is heuristic.",
    note: "Authority scoring not yet active",
  },
  {
    icon: LockIcon,
    title: "LP position lock",
    body: "Check the owner and withdrawal controls of a Uniswap v4 liquidity position after deployment addresses are verified.",
    note: "Unverified pools remain unscored",
  },
  {
    icon: FireIcon,
    title: "Attributed burns",
    body: "Count only token transfers to burn addresses from the deployer or configured launchpad treasury.",
    note: "Unattributed burns count for nothing",
  },
  {
    icon: UserGroupIcon,
    title: "Holder concentration",
    body: "Top-10 share of circulating supply, excluding the verified pool manager, pool and burn addresses.",
    note: "Holder data not yet indexed",
  },
]

export function ScoreExplainerSection() {
  return (
    <section id="score" className="border-t border-[var(--border)] py-20">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--brand)] uppercase">
          The score
        </div>
        <h2
          className="max-w-[720px] text-[28px] font-bold tracking-tight sm:text-[34px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Proposed score methodology · 0 to 10.
        </h2>

        <p className="mt-3 max-w-[720px] text-sm text-[var(--text-muted)]">
          These Arc scoring rules are not active yet. Token scores remain
          unavailable until factory events and all inputs are verified.
        </p>

        <ScoreBands />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SCORE_INPUTS.map((s) => (
            <div
              key={s.title}
              className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-[18px]"
            >
              <HugeiconsIcon
                icon={s.icon}
                className="size-[18px] text-[var(--brand)]"
                strokeWidth={2}
              />
              <div
                className="mt-3 text-[17px] font-bold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {s.title}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                {s.body}
              </p>
              <div className="mt-3.5 border-t border-[var(--border)] pt-2.5 font-mono text-[11px] text-[var(--text-muted)]">
                {s.note.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ScoreBands() {
  return (
    <div className="mt-8 flex gap-1">
      <div style={{ flex: 49 }}>
        <div
          className="h-2 rounded"
          style={{ background: "var(--score-risk)" }}
        />
        <div
          className="mt-2.5 font-mono text-xs font-semibold"
          style={{ color: "var(--score-risk)" }}
        >
          0&ndash;4.9 &middot; RISK
        </div>
      </div>
      <div style={{ flex: 20 }}>
        <div
          className="h-2 rounded"
          style={{ background: "var(--score-caution)" }}
        />
        <div
          className="mt-2.5 font-mono text-xs font-semibold"
          style={{ color: "var(--score-caution)" }}
        >
          5.0&ndash;6.9 &middot; CAUTION
        </div>
      </div>
      <div style={{ flex: 31 }}>
        <div
          className="h-2 rounded"
          style={{ background: "var(--score-healthy)" }}
        />
        <div
          className="mt-2.5 font-mono text-xs font-semibold"
          style={{ color: "var(--score-healthy)" }}
        >
          7.0&ndash;10 &middot; HEALTHY
        </div>
      </div>
    </div>
  )
}

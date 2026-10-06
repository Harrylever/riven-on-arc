import { ARC_PORT_MODE } from "@/lib/flags"

const MOAT = [
  {
    title: "No paid boosts",
    body: "Position in every list comes from the score and the clock.",
  },
  {
    title: "No cash-for-verified",
    body: "We don't sell badges. A profile and a fee don't make a token safer.",
  },
  {
    title: "No curated trust list",
    body: "Signals are on-chain facts anyone can check, not our opinion.",
  },
  {
    title: "100% Free & Open",
    body: "No paywalls, no gated tiers. Every score and safety verdict is readable without an account.",
  },
]

export function MoatSection() {
  const items = ARC_PORT_MODE
    ? [
        {
          title: "No paid scores",
          body: "Arc launch scores are not published yet. No listing can buy a rating.",
        },
        {
          title: "Unverified is labeled",
          body: "Factory event formats are not confirmed, so raw logs stay undecoded instead of appearing as guessed launches.",
        },
        {
          title: "Inspection, not guarantees",
          body: "Contract metadata and bytecode can be inspected, but selector checks are heuristics—not a complete safety review.",
        },
        {
          title: "Free while building",
          body: "ClawDex has no paid boosts or paywalls. Scores and monitoring remain unavailable while Arc signal inputs are being built.",
        },
      ]
    : MOAT

  return (
    <section className="border-t border-[var(--border)] bg-[var(--surface-sunken)] py-20">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--brand)] uppercase">
          The moat
        </div>
        <h2
          className="max-w-[720px] text-[28px] font-bold tracking-tight sm:text-[34px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Nothing on this page is for sale.
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((m) => (
            <div
              key={m.title}
              className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-[18px]"
            >
              <div
                className="text-[17px] font-bold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {m.title}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                {m.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

import { SignalRow } from "@/components/ds"
import { Badge } from "@/components/ui/badge"
import { Shield01Icon, UserGroupIcon } from "@hugeicons/core-free-icons"

export function ProblemSection() {
  return (
    <section className="py-20">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-10 px-6">
        <div className="min-w-0 flex-1 basis-[380px]">
          <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--brand)] uppercase">
            The problem
          </div>
          <h2
            className="text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Launch data needs verification before it deserves a score.
          </h2>
          <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-[var(--text-secondary)]">
            ClawDex is building a transparent Arc launch index. It will not
            label a token or publish a score until the underlying on-chain
            signals can be checked.
          </p>
        </div>
        <div className="min-w-0 flex-1 basis-[340px]" style={{ maxWidth: 440 }}>
          <RiskSampleCard />
        </div>
      </div>
    </section>
  )
}

function RiskSampleCard() {
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Badge variant="neutral">Sample</Badge>
      </div>
      <div className="rounded-none border border-t-2 border-[var(--border)] border-t-[var(--score-risk)] bg-[var(--surface)] p-5">
        <div className="flex items-center gap-4">
          <div className="min-w-0">
            <div
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              MEMESPAD FACTORY
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
              Arc mainnet &middot; chain 5042
            </div>
          </div>
        </div>
        <div className="mt-3.5">
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            Raw factory logs can be scanned, but the launch event ABI is not
            verified yet. Launch decoding and scoring are paused.
          </p>
        </div>
        <div className="mt-3.5 grid gap-1.5">
          <SignalRow
            icon={Shield01Icon}
            label="Factory bytecode"
            value="Detected"
            state="healthy"
          />
          <SignalRow
            icon={UserGroupIcon}
            label="Launch event ABI"
            value="Unverified"
            state="caution"
          />
        </div>
      </div>
    </div>
  )
}

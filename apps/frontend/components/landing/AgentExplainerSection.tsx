import { Badge } from "@/components/ui/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"
import { DemoAgentChat } from "@/components/landing/DemoAgentChat"

const SAMPLE_QUESTIONS = [
  "is this safe to buy?",
  "who holds the most?",
  "what does LP lock mean?",
]

export function AgentExplainerSection() {
  return (
    <section className="border-t border-[var(--border)] py-20">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-10 px-6">
        <div className="min-w-0 flex-1 basis-[380px]">
          <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--brand)] uppercase">
            The agent explains why
          </div>
          <h2
            className="text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Other tools show data. Ours tells you what it means.
          </h2>
          <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-[var(--text-secondary)]">
            Paste a mint, or ask the way you&apos;d say it out loud. No filters,
            no query language.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {SAMPLE_QUESTIONS.map((q) => (
              <Badge
                key={q}
                variant="outline"
                className="gap-1.5 py-1 font-normal normal-case"
              >
                <HugeiconsIcon
                  icon={SparklesIcon}
                  className="size-3"
                  strokeWidth={2}
                />
                {q}
              </Badge>
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1 basis-[380px]" style={{ maxWidth: 460 }}>
          <DemoAgentChat />
        </div>
      </div>
    </section>
  )
}

"use client"

import { useId, useState } from "react"
import { SUB_SCORE_LABEL, type ArcFlag } from "@riven/shared/score"

const COLOR = { danger: "var(--rv-risk)", warning: "var(--rv-caution)", good: "var(--rv-healthy)" } as const

/** "2 risks · 1 warning · 3 good", so what is inside is clear even while it is closed. */
function summary(flags: ArcFlag[]): string {
  const n = (level: ArcFlag["level"]) => flags.filter((f) => f.level === level).length
  const parts = [
    n("danger") && `${n("danger")} ${n("danger") === 1 ? "risk" : "risks"}`,
    n("warning") && `${n("warning")} ${n("warning") === 1 ? "warning" : "warnings"}`,
    n("good") && `${n("good")} good`,
  ].filter(Boolean)
  return parts.join(" · ")
}

/**
 * "What Riven found": every flag with its level, most serious first. Closed to begin with, since the score and the
 * verdict above already say the headline; open it for the detail. `flags` arrive already ordered.
 */
export function Findings({ flags }: { flags: ArcFlag[] }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  return (
    <section className="rv-card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-4 text-left"
      >
        <h2 className="text-[15px] font-bold text-[var(--rv-ink)]">What Riven found</h2>
        <span className="ml-auto min-w-0 truncate text-[12px] text-[var(--rv-ink-3)]">
          {flags.length === 0 ? "still reading" : summary(flags)}
        </span>
        <svg
          viewBox="0 0 16 16"
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`shrink-0 text-[var(--rv-ink-3)] transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <div id={bodyId} hidden={!open} className="px-4 pb-4">
        {flags.length === 0 ? (
          <p className="text-sm text-[var(--rv-ink-2)]">Still reading this token&apos;s on-chain data.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {flags.map((f, i) => (
              <li key={`${f.text}-${i}`} className="flex items-start gap-2.5 text-[13px] leading-snug text-[var(--rv-ink)]">
                <span aria-hidden className="mt-1 size-2 shrink-0 rounded-sm" style={{ background: COLOR[f.level] }} />
                <span className="flex-1">{f.text}</span>
                <span className="text-[10px] tracking-wide text-[var(--rv-ink-3)] uppercase">{SUB_SCORE_LABEL[f.category]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

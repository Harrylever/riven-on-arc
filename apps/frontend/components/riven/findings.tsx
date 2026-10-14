"use client"

import { SUB_SCORE_LABEL, type ArcFlag } from "@riven/shared/score"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Card } from "@/components/ui/card"

const COLOR = {
  danger: "var(--rv-risk)",
  warning: "var(--rv-caution)",
  good: "var(--rv-healthy)",
} as const

/** "2 risks · 1 warning · 3 good", so what is inside is clear even while it is closed. */
function summary(flags: ArcFlag[]): string {
  const n = (level: ArcFlag["level"]) =>
    flags.filter((f) => f.level === level).length
  const parts = [
    n("danger") && `${n("danger")} ${n("danger") === 1 ? "risk" : "risks"}`,
    n("warning") &&
      `${n("warning")} ${n("warning") === 1 ? "warning" : "warnings"}`,
    n("good") && `${n("good")} good`,
  ].filter(Boolean)
  return parts.join(" · ")
}

/**
 * "What Riven found": every flag with its level, most serious first. Closed to begin with, since the score and the
 * verdict above already say the headline; open it for the detail. `flags` arrive already ordered.
 */
export function Findings({ flags }: { flags: ArcFlag[] }) {
  return (
    <Card variant="riven" as="section" className="overflow-hidden">
      <Collapsible>
        {/* the trigger sits inside the heading, so the section keeps its heading for screen readers */}
        <h2>
          <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--rv-blue)]">
            <span className="text-[15px] font-bold text-[var(--rv-ink)]">
              What Riven found
            </span>
            <span className="ml-auto min-w-0 truncate text-[12px] font-normal text-[var(--rv-ink-3)]">
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
              className="shrink-0 text-[var(--rv-ink-3)] transition-transform duration-200 group-data-[panel-open]/trigger:rotate-180 motion-reduce:transition-none"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent
          keepMounted
          className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none"
        >
          <div className="px-4 pb-4">
            {flags.length === 0 ? (
              <p className="text-sm text-[var(--rv-ink-2)]">
                Still reading this token&apos;s on-chain data.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {flags.map((f, i) => (
                  <li
                    key={`${f.text}-${i}`}
                    className="flex items-start gap-2.5 text-[13px] leading-snug text-[var(--rv-ink)]"
                  >
                    <span
                      aria-hidden
                      className="mt-1 size-2 shrink-0 rounded-sm"
                      style={{ background: COLOR[f.level] }}
                    />
                    <span className="flex-1">{f.text}</span>
                    <span className="text-[10px] tracking-wide text-[var(--rv-ink-3)] uppercase">
                      {SUB_SCORE_LABEL[f.category]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

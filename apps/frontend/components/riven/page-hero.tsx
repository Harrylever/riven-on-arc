"use client"

import type { ReactNode } from "react"
import type { Holo, Mood } from "@/components/mascot/mascot"
import { useRivenPage } from "@/components/mascot/riven-context"

/**
 * Section header: title + plain-English intro. Riven isn't boxed in here — the
 * docked Riven picks up this page's tips, mood and holograms instead.
 */
export function PageHero({
  eyebrow,
  title,
  children,
  actions,
  mood = "idle",
  holos,
  lines,
  greet,
}: {
  eyebrow?: string
  title: string
  children?: ReactNode
  actions?: ReactNode
  mood?: Mood
  holos?: Holo[]
  lines?: string[]
  greet?: string
}) {
  useRivenPage({ mood, holos, lines, greet })
  return (
    <header className="flex flex-col gap-1.5">
      {eyebrow && (
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-card)] px-3 py-1 text-[12px] text-[var(--rv-ink-2)]">
          <span className="rv-live-dot" /> {eyebrow}
        </p>
      )}
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-[var(--rv-ink)] sm:text-[32px]">{title}</h1>
      {children && <div className="max-w-2xl text-[13.5px] leading-relaxed text-[var(--rv-ink-2)]">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

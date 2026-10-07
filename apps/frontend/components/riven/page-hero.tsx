"use client"

import { useEffect, useState, type ReactNode } from "react"
import { MascotStage } from "@/components/mascot/mascot-stage"
import type { Holo, Mood } from "@/components/mascot/mascot"

/**
 * Section header with Riven beside it: title + plain-English intro on the
 * left, Riven (with his holograms and page tips) on the right. Shared by the
 * inner pages so they match the home and token pages.
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
  // On phones Riven sits small in the corner; his holograms need the room of a wider screen.
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return (
    <header className="rv-card relative grid items-center gap-2 overflow-hidden p-4 sm:p-5 md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_360px]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_40%,rgba(124,196,232,0.13),transparent_60%)]"
        aria-hidden
      />
      <div className="relative pr-[96px] md:pr-0">
        {eyebrow && (
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] px-3 py-1 text-[12px] text-[var(--rv-ink-2)]">
            <span className="rv-live-dot" /> {eyebrow}
          </p>
        )}
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-[var(--rv-ink)] sm:text-[34px]">{title}</h1>
        {children && <div className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-[var(--rv-ink-2)]">{children}</div>}
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
      <MascotStage
        className="!absolute top-1 right-1 h-[150px] w-[104px] md:!relative md:top-auto md:right-auto md:-my-2 md:h-[230px] md:w-auto lg:h-[260px]"
        framing={wide ? "full" : "bust"}
        mood={mood}
        holos={wide ? holos : undefined}
        holoSize={0.48}
        lines={wide ? lines : undefined}
        greet={wide ? greet : undefined}
        bubbleSide="left"
      />
    </header>
  )
}

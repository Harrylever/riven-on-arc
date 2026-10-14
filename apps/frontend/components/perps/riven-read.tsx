"use client"

import { useEffect, useRef } from "react"
import { flushSync } from "react-dom"
import type { PerpInsight } from "@/lib/perp-insight"
import { DISCLAIMER } from "@/lib/site"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

/**
 * Riven's read as a drop-down. Closed, it keeps the takeaway visible (the activity score and the
 * one-line headline); opening it adds the supporting facts and the sources. It closes by itself
 * once it has been scrolled past, so it never sits above the chart taking room.
 *
 * Controlled: the page opens it when "Why is it moving?" is pressed.
 */
export function RivenRead({
  insight,
  open,
  onOpenChange,
  flash,
}: {
  insight: PerpInsight | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Changes each time the read is refreshed; remounts the card to replay the highlight. */
  flash: number
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Close when the card has scrolled out of view past the top of the screen.
  useEffect(() => {
    const el = sectionRef.current
    if (!el || !open) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (
          !entry ||
          entry.isIntersecting ||
          entry.boundingClientRect.bottom > 0
        )
          return
        // The card is above the viewport, so shrinking it would shove everything below it up
        // the screen. Collapse instantly, then scroll by however far the next block moved so
        // what the reader is looking at stays put (Safari has no scroll anchoring to do it).
        const next = el.nextElementSibling as HTMLElement | null
        const before = next?.getBoundingClientRect().top
        const body = bodyRef.current
        if (body) body.style.transition = "none"
        flushSync(() => onOpenChange(false))
        if (next && before !== undefined) {
          const shift = next.getBoundingClientRect().top - before
          if (Math.abs(shift) > 0.5) window.scrollBy(0, shift)
        }
        if (body) body.style.transition = ""
      },
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [open, flash, onOpenChange])

  return (
    <Card
      variant="riven"
      as="section"
      ref={sectionRef}
      id="read"
      key={`read-${flash}`}
      className="scroll-mt-28 overflow-hidden"
      style={flash ? { animation: "rv-flash 1.6s ease-out" } : undefined}
    >
      <Button
        variant="plain"
        size="bare"
        type="button"
        aria-expanded={open}
        aria-controls="read-body"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="rv-label">Riven&apos;s read</span>
            {insight && (
              <span className="rv-num ml-auto text-[11.5px] text-[var(--rv-ink-3)]">
                Activity {insight.activity}/10
                <span className="hidden sm:inline"> · not a buy score</span>
              </span>
            )}
          </span>
          {insight ? (
            <span className="mt-1.5 block text-[15px] leading-snug font-semibold text-[var(--rv-ink)]">
              {insight.why}
            </span>
          ) : (
            <span className="mt-2 block h-10 animate-pulse rounded-md bg-white/[0.04]" />
          )}
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[var(--rv-ice)]">
          <span className="hidden sm:inline">{open ? "Hide" : "Details"}</span>
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
            className={`transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </span>
      </Button>

      {/* grid-rows 0fr -> 1fr animates the height without measuring it */}
      <div
        id="read-body"
        ref={bodyRef}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {insight && (
            <div className="px-4 pb-4">
              <ul className="flex flex-col gap-1 border-t border-[var(--rv-stroke)] pt-3 text-[13px] leading-relaxed text-[var(--rv-ink-2)]">
                {insight.bullets.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] text-[var(--rv-ink-3)]">
                Activity is how much is going on (move size, volume, news,
                funding), not a buy score. Live market prices, calls from Riven
                Scanner, plus crypto news. Riven explains; you decide.{" "}
                {DISCLAIMER}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

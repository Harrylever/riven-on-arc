"use client"

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Button } from "@/components/ui/button"

/**
 * A horizontal card row that works everywhere: glides slowly on its own,
 * pauses while someone touches / hovers / focuses it, has arrow buttons, and
 * can be dragged with a mouse on desktop (touch scrolls natively). It loops
 * forever: the cards are rendered twice and the scroll position wraps by one
 * set's width, so after the last card the first one simply follows.
 */
export function Carousel({
  children,
  speed = 22,
  label,
}: {
  children: ReactNode
  /** Auto-glide speed in px/s (0 = off). */
  speed?: number
  label?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const pausedUntil = useRef(0)
  const items = Children.toArray(children)
  // Only loop when the cards overflow the row; measured after layout.
  const [loop, setLoop] = useState(false)
  useEffect(() => {
    const el = row.current
    if (!el) return
    const check = () => {
      const single = loop ? el.scrollWidth / 2 : el.scrollWidth
      setLoop(single > el.clientWidth + 8)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [items.length, loop])

  // Seamless wrap: past the first set → jump back one set width (same picture).
  useEffect(() => {
    const el = row.current
    if (!el || !loop) return
    const onScroll = () => {
      const half = el.scrollWidth / 2
      // 1px dead-band so a wrap never re-triggers the opposite wrap
      if (el.scrollLeft >= half + 1) el.scrollLeft -= half
      else if (el.scrollLeft < 1) el.scrollLeft += half
    }
    // start on the second copy so scrolling left has room too
    if (el.scrollLeft < 2) el.scrollLeft = el.scrollWidth / 2
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [loop])

  // auto-glide
  useEffect(() => {
    const el = row.current
    if (
      !el ||
      speed <= 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return
    let raf = 0
    let last = performance.now()
    let carry = 0
    const hold = (ms: number) => () =>
      (pausedUntil.current = performance.now() + ms)
    const onEnter = hold(60_000)
    const onLeave = hold(1500)
    const onTouch = hold(5000)
    el.addEventListener("pointerenter", onEnter)
    el.addEventListener("pointerleave", onLeave)
    el.addEventListener("touchstart", onTouch, { passive: true })
    el.addEventListener("wheel", onTouch, { passive: true })
    el.addEventListener("focusin", onEnter)
    el.addEventListener("focusout", onLeave)
    const step = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      if (now > pausedUntil.current && el.scrollWidth > el.clientWidth + 4) {
        carry += (speed * dt) / 1000
        const whole = Math.floor(carry)
        if (whole >= 1) {
          carry -= whole
          el.scrollLeft += whole // the scroll handler wraps it when looping
          if (
            el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 &&
            el.scrollWidth <= el.clientWidth * 2
          ) {
            // short, non-looping row: glide back to the start
            el.scrollTo({ left: 0, behavior: "smooth" })
            pausedUntil.current = now + 2500
          }
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener("pointerenter", onEnter)
      el.removeEventListener("pointerleave", onLeave)
      el.removeEventListener("touchstart", onTouch)
      el.removeEventListener("wheel", onTouch)
      el.removeEventListener("focusin", onEnter)
      el.removeEventListener("focusout", onLeave)
    }
  }, [speed])

  // mouse drag (desktop); a drag doesn't count as a click on the card under it
  useEffect(() => {
    const el = row.current
    if (!el) return
    let down = false
    let moved = 0
    let startX = 0
    let startLeft = 0
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return
      down = true
      moved = 0
      startX = e.clientX
      startLeft = el.scrollLeft
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - startX
      moved = Math.max(moved, Math.abs(dx))
      if (moved > 4) {
        el.scrollLeft = startLeft - dx
        el.style.cursor = "grabbing"
        el.style.userSelect = "none"
      }
    }
    const onUp = () => {
      down = false
      el.style.cursor = ""
      el.style.userSelect = ""
    }
    const onClick = (e: MouseEvent) => {
      if (moved > 6) {
        e.preventDefault()
        e.stopPropagation()
      }
      moved = 0
    }
    el.addEventListener("pointerdown", onDown)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    el.addEventListener("click", onClick, true)
    return () => {
      el.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      el.removeEventListener("click", onClick, true)
    }
  }, [])

  const nudge = (dir: -1 | 1) => {
    const el = row.current
    if (!el) return
    pausedUntil.current = performance.now() + 6000
    el.scrollBy({
      left: dir * Math.max(240, el.clientWidth * 0.8),
      behavior: "smooth",
    })
  }

  return (
    <div className="group/car relative" role="region" aria-label={label}>
      <div
        ref={row}
        className="scrollbar-hidden -mx-4 flex gap-3 overflow-x-auto px-4 pb-1"
        onDragStart={(e) => e.preventDefault()}
      >
        {items}
        {loop &&
          items.map((c, i) => (
            <Fragment
              key={`loop-${isValidElement(c) && c.key != null ? c.key : i}`}
            >
              {c}
            </Fragment>
          ))}
      </div>
      {(["left", "right"] as const).map((side) => (
        <Button
          variant="plain"
          size="bare"
          key={side}
          type="button"
          onClick={() => nudge(side === "left" ? -1 : 1)}
          aria-label={side === "left" ? "Scroll left" : "Scroll right"}
          className={`absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-[var(--rv-stroke-strong)] bg-[rgba(10,10,12,0.85)] text-[var(--rv-ink)] opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/car:opacity-100 focus-visible:opacity-100 md:grid ${
            side === "left" ? "-left-2" : "-right-2"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            width={16}
            height={16}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            aria-hidden
          >
            <path d={side === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
          </svg>
        </Button>
      ))}
    </div>
  )
}

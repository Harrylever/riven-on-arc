"use client"

/**
 * Riven's thinking orbs, built on thinking-orbs (MIT,
 * github.com/Jakubantalik/thinking-orbs), tinted Riven blue.
 */
import { ThinkingOrb, scaleCounts, type OrbState } from "thinking-orbs"
import { MODE_FRAMES, paintFrame, resolvePreset } from "thinking-orbs/engine"
import { useEffect, useRef, useState } from "react"

/** A single blue orb, for loading and "Riven is thinking" states. */
export function RivenOrb({
  state = "working",
  size = 20,
  label = "Riven is thinking",
}: {
  state?: OrbState
  size?: 64 | 32 | 20
  label?: string
}) {
  return <ThinkingOrb state={state} size={size} theme="dark" color="#7cc4e8" aria-label={label} />
}

/** Every state the library ships, in an order that flows well as a loop. */
const CYCLE: Array<{ state: OrbState; label: string }> = [
  { state: "searching", label: "Scanning Arc" },
  { state: "connecting", label: "Mapping wallets" },
  { state: "working", label: "Indexing pools" },
  { state: "weaving", label: "Tracing liquidity" },
  { state: "composing", label: "Writing verdicts" },
  { state: "listening", label: "Watching trades" },
  { state: "solving", label: "Scoring tokens" },
  { state: "breathing", label: "Standing by" },
  { state: "shaping", label: "Sorting signals" },
]
const BLUE = { r: 124, g: 196, b: 232 }

/**
 * One big thought-orb that cycles through all nine thinking-orbs states,
 * cross-fading between them. Drawn with the library's own geometry at full
 * size (not a scaled-up 64px canvas), so the dots stay crisp.
 */
export function BigOrb({
  size = 520,
  hold = 6,
  className = "",
  showLabel = false,
}: {
  size?: number
  hold?: number
  className?: string
  showLabel?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [label, setLabel] = useState(CYCLE[0]!.label)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // presets are tuned for small orbs: add dots back for a big one, and slow it down
    const modes = CYCLE.map(({ state }) => {
      const r = resolvePreset(state, 64)
      return { frame: MODE_FRAMES[r.mode], opts: scaleCounts(r.opts, 2.2), speed: r.speed * 0.4 }
    })
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const draw = (i: number, sec: number, alpha: number) => {
      if (alpha <= 0.01) return
      const m = modes[i % modes.length]!
      ctx.globalAlpha = alpha
      paintFrame(ctx, m.frame(size, sec * m.speed, m.opts), true, BLUE)
    }
    const render = (sec: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      const n = Math.floor(sec / hold)
      const phase = sec - n * hold
      const fade = 1.2
      const out = phase > hold - fade ? (phase - (hold - fade)) / fade : 0
      draw(n, sec, 1 - out)
      draw(n + 1, sec, out)
      ctx.globalAlpha = 1
      return n
    }
    if (reduced) {
      render(0.6)
      return
    }
    let raf = 0
    let running = false
    let shown = -1
    const t0 = performance.now()
    const loop = () => {
      const n = render((performance.now() - t0) / 1000)
      if (n !== shown) {
        shown = n
        setLabel(CYCLE[n % CYCLE.length]!.label)
      }
      if (running) raf = requestAnimationFrame(loop)
    }
    // only animate while on screen
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !running) {
        running = true
        raf = requestAnimationFrame(loop)
      } else if (!e?.isIntersecting) {
        running = false
        cancelAnimationFrame(raf)
      }
    })
    io.observe(canvas)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [size, hold])

  return (
    <div className={`pointer-events-none flex flex-col items-center ${className}`} aria-hidden>
      <canvas
        ref={ref}
        style={{
          width: size,
          maxWidth: "100%",
          aspectRatio: "1",
          height: "auto",
          filter: "drop-shadow(0 0 18px rgba(124,196,232,0.35))",
        }}
      />
      {showLabel && (
        <span className="rv-num -mt-6 text-[11px] font-semibold tracking-[0.16em] text-[var(--rv-ink-3)] uppercase">
          {label}…
        </span>
      )}
    </div>
  )
}

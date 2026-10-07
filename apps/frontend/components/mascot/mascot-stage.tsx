"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mascot, type Holo, type Mood } from "./mascot"
import type { Framing } from "./riven-mascot"
import * as sfx from "@/lib/bot-sfx"

/** What he says while doing each of his moves. */
const ACT_LINES: Record<string, string[]> = {
  scan: [
    "Riven… GO! Pulling up the numbers.",
    "Hologram up. Let me take a closer look.",
    "Scanning the chain…",
  ],
  wave: ["Hey there!", "Hi! Tap me for the numbers."],
  inspect: [
    "Still shiny.",
    "Chrome check: ✓",
    "Not a scratch on me.",
    "Looking sharp, if I say so myself.",
  ],
  spin: ["Wheee!", "360° scan complete."],
  hop: ["Boing.", "On it!"],
  shake: ["Nope. Read the red flags.", "I wouldn't. Check why first."],
  nod: ["Looking good so far.", "Clean on-chain."],
  nodata: ["Nothing to read on this one yet — no trades or pool data.", "No data on this pair yet. Check back once it trades."],
  think: ["Hmm… let me think about that one.", "Computing…"],
  celebrate: ["Woo! Clean on-chain!", "That's what I like to see."],
  point: ["You — check the score before you buy.", "Read the red flags first!"],
  dance: ["Green candles make me dance.", "♪ beep boop ♪"],
  look: ["Watching the chain…", "Anything new launching? Let me look."],
}

const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)]!

/**
 * Riven, alive on a page: the 3D mascot plus a speech bubble. `lines` are
 * page-specific things he says (a token's verdict, a tip); he also comments
 * on his own moves. Click him and he reacts.
 */
export function MascotStage({
  mood = "idle",
  holos,
  lines = [],
  framing = "full",
  zoom,
  className = "",
  bubbleSide = "bottom",
  greet,
  holoSize,
  lively,
  command,
  onPhase,
  onTap,
  say: sayProp,
  autoScan,
}: {
  mood?: Mood
  holos?: Holo[]
  lines?: string[]
  framing?: Framing
  zoom?: number
  className?: string
  /** Where his speech bubble sits — never over his face. */
  bubbleSide?: "outside-left" | "bottom"
  /** First thing he says. */
  greet?: string
  /** Hologram card size (bigger = more readable). */
  holoSize?: number
  /** Emote more often (home page). */
  lively?: boolean
  command?: { id: number; act: string; at?: number }
  onPhase?: (phase: "press" | "done") => void
  /** Replaces the default tap reaction (e.g. "scan this token"). */
  onTap?: () => void
  /** Something the page wants him to say right now (bump the object to repeat). */
  say?: { text: string; ms?: number } | null
  autoScan?: boolean
}) {
  const [say, setSay] = useState<string | null>(greet ?? null)
  const [poke, setPoke] = useState(0)
  const [muted, setMutedState] = useState(false)
  useEffect(() => setMutedState(sfx.isMuted()), [])
  const hideAt = useRef<number | undefined>(undefined)
  const lastLine = useRef(0)

  const speak = useCallback((text: string, ms = 3800) => {
    setSay(text)
    window.clearTimeout(hideAt.current)
    hideAt.current = window.setTimeout(() => setSay(null), ms)
  }, [])

  useEffect(() => {
    if (greet) speak(greet, 5200)
    return () => window.clearTimeout(hideAt.current)
  }, [greet, speak])

  // Every so often, share something about the page.
  useEffect(() => {
    if (lines.length === 0) return
    const id = window.setInterval(() => {
      lastLine.current = (lastLine.current + 1) % lines.length
      speak(lines[lastLine.current]!, 4500)
    }, 14_000)
    return () => window.clearInterval(id)
  }, [lines, speak])

  useEffect(() => {
    if (sayProp?.text) speak(sayProp.text, sayProp.ms ?? 4200)
  }, [sayProp, speak])

  const onAct = useCallback(
    (a: string) => {
      const options = ACT_LINES[a]
      if (options && Math.random() < 0.7) speak(pick(options))
    },
    [speak],
  )

  // Beside him (docked) or down by his feet (hero) — never across his visor.
  const bubblePos =
    bubbleSide === "outside-left"
      ? "right-full top-[18%] mr-1 w-max max-w-[220px]"
      : "left-1/2 bottom-1 -translate-x-1/2 w-max max-w-[min(260px,92%)]"

  return (
    <div className={`group relative select-none ${className}`}>
      <button
        type="button"
        aria-label="Riven, the Riven mascot — tap to say hi"
        onClick={() => {
          sfx.arm() // a tap unlocks his voice (browsers block sound until a gesture)
          if (onTap) {
            onTap()
            return
          }
          setPoke((p) => p + 1)
          speak(
            lines.length
              ? lines[Math.floor(Math.random() * lines.length)]!
              : "Hey! I'm Riven. I check every token on Arc.",
          )
        }}
        className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-[var(--rv-blue)]"
      />
      <Mascot
        className="size-full"
        mood={mood}
        holos={holos}
        framing={framing}
        zoom={zoom}
        holoSize={holoSize}
        lively={lively}
        onAct={onAct}
        poke={poke}
        command={command}
        onPhase={onPhase}
        autoScan={autoScan}
      />
      <button
        type="button"
        onClick={() => {
          const m = !muted
          sfx.setMuted(m)
          setMutedState(m)
          if (!m) {
            sfx.arm()
            sfx.chirp()
          }
        }}
        aria-label={muted ? "Unmute Riven" : "Mute Riven"}
        aria-pressed={muted}
        className="absolute right-2 bottom-2 z-20 grid size-7 place-items-center rounded-full border border-[var(--rv-stroke)] bg-[rgba(10,14,20,0.8)] text-[var(--rv-ink-3)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--rv-ink)] focus-visible:opacity-100"
        title={muted ? "Sound off" : "Sound on (after your first tap)"}
      >
        <svg
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          {muted ? (
            <path d="m17 9 5 6m0-6-5 6" />
          ) : (
            <path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13" />
          )}
        </svg>
      </button>
      {say && (
        <div
          role="status"
          className={`pointer-events-none absolute z-20 rounded-xl border border-[rgba(124,196,232,0.35)] bg-[rgba(10,14,20,0.92)] px-3 py-2 text-[12.5px] leading-snug text-[var(--rv-ink)] shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur ${bubblePos}`}
          style={{ animation: "rv-pop 180ms ease-out" }}
        >
          <span className="mb-0.5 block text-[10px] font-bold tracking-[0.12em] text-[var(--rv-blue)] uppercase">
            Riven
          </span>
          {say}
        </div>
      )}
    </div>
  )
}

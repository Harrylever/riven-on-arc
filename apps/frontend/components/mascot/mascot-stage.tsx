"use client"

import { useEffect, useRef, useState } from "react"
import { Mascot, type Holo, type Mood } from "./mascot"
import type { Framing } from "./riven-mascot"
import * as sfx from "@/lib/bot-sfx"
import { useRivenOptional } from "./riven-context"

/**
 * Riven, alive on a page. He doesn't talk on his own (no speech bubbles): he
 * checks himself out and looks around. Tap him for the page's action (e.g. a
 * scan), double-tap to talk to him. `lines`, `greet`, `say` and `bubbleSide`
 * are accepted for compatibility but no longer shown.
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
  onDoubleTap,
  intro,
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
  /** Double-tap: defaults to "ask Riven out loud". */
  onDoubleTap?: () => void
  /** Play the full scan once on arrival, then idle naturally (home page). */
  intro?: boolean
}) {
  const riven = useRivenOptional()
  const lastTap = useRef(0)
  const single = useRef<number | undefined>(undefined)
  const [poke, setPoke] = useState(0)
  const [muted, setMutedState] = useState(false)
  useEffect(() => setMutedState(sfx.isMuted()), [])
  void lines
  void greet
  void sayProp
  void bubbleSide

  return (
    <div className={`group relative select-none ${className}`}>
      <button
        type="button"
        aria-label="Riven — tap for a scan or a tip, double-tap to ask him out loud"
        onClick={() => {
          sfx.arm() // a tap unlocks his voice (browsers block sound until a gesture)
          // Double-tap → talk to him. A single tap waits a beat to be sure.
          const now = Date.now()
          const double = onDoubleTap ?? riven?.listen
          if (double && now - lastTap.current < 320) {
            window.clearTimeout(single.current)
            lastTap.current = 0
            sfx.talk() // robot noises when you call him
            double()
            return
          }
          lastTap.current = now
          window.clearTimeout(single.current)
          single.current = window.setTimeout(() => {
            if (onTap) return onTap()
            setPoke((p) => p + 1)
          }, double ? 300 : 0)
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
        poke={poke}
        command={command}
        onPhase={onPhase}
        autoScan={autoScan}
        intro={intro}
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
    </div>
  )
}

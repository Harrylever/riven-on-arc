"use client"

import { ThinkingOrb, type OrbState } from "thinking-orbs"
import { useEffect, useState } from "react"

/**
 * Ambient "thinking" orbs drifting behind the home hero — Riven's agents at
 * work. Built on thinking-orbs (MIT, github.com/Jakubantalik/thinking-orbs),
 * tinted Riven blue. They bloom in one after another when a visitor lands.
 */
const ORBS: Array<{
  state: OrbState
  size: 64 | 32 | 20
  scale: number
  left: string
  top: string
  delay: number
  drift: number
  hideSm?: boolean
}> = [
  { state: "searching", size: 64, scale: 1.6, left: "6%", top: "14%", delay: 0.1, drift: 11 },
  { state: "connecting", size: 64, scale: 1.25, left: "44%", top: "6%", delay: 0.45, drift: 14, hideSm: true },
  { state: "working", size: 64, scale: 1.0, left: "88%", top: "10%", delay: 0.3, drift: 12 },
  { state: "weaving", size: 64, scale: 1.1, left: "2%", top: "72%", delay: 0.7, drift: 13, hideSm: true },
  { state: "listening", size: 32, scale: 1.2, left: "38%", top: "84%", delay: 0.9, drift: 10, hideSm: true },
  { state: "composing", size: 64, scale: 1.3, left: "92%", top: "68%", delay: 0.6, drift: 15 },
  { state: "solving", size: 32, scale: 1.0, left: "60%", top: "40%", delay: 1.1, drift: 9, hideSm: true },
  { state: "shaping", size: 20, scale: 1.4, left: "22%", top: "44%", delay: 1.3, drift: 8, hideSm: true },
]

export function OrbField() {
  // Canvas orbs are client-only; mount after hydration so SSR stays clean.
  const [on, setOn] = useState(false)
  useEffect(() => setOn(true), [])
  if (!on) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {ORBS.map((o, i) => (
        <div
          key={i}
          className={`absolute ${o.hideSm ? "hidden sm:block" : ""}`}
          style={{
            left: o.left,
            top: o.top,
            animation: `rv-orb-in 1.4s cubic-bezier(.2,.8,.2,1) ${o.delay}s both, rv-orb-drift ${o.drift}s ease-in-out ${o.delay}s infinite alternate`,
          }}
        >
          <div style={{ transform: `scale(${o.scale})`, opacity: 0.55, filter: "drop-shadow(0 0 10px rgba(124,196,232,0.45))" }}>
            <ThinkingOrb state={o.state} size={o.size} theme="dark" color="#7cc4e8" speed={0.8} />
          </div>
        </div>
      ))}
    </div>
  )
}

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

"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Holo, Mood } from "./mascot"
import { VoicePanel, useRivenVoice } from "./riven-voice"

/**
 * One Riven for the whole site. Pages don't get their own mascot window any
 * more: they tell the docked Riven what to show (his holograms, page tips,
 * mood) and what "scan" means here. Tapping him — or a page's "Scan" button —
 * runs the scan: the wrist hologram when there's data, a shrug when there isn't.
 */
export interface RivenPage {
  holos?: Holo[]
  lines?: string[]
  mood?: Mood
  greet?: string
  /** What "this" means when the user asks Riven a question here (voice or chat). */
  topic?: { kind: "token"; address: string } | { kind: "perp"; coin: string }
  /** Present on pages with something to scan (a token). */
  scan?: {
    /** False → he shrugs "no data for this token/pair yet". */
    hasData: boolean
    /** Hologram opened: refresh the page's numbers. */
    onPress?: () => void
    /** He's done reading: point the user at the full details. */
    onDone?: () => void
  }
}

interface Ctx {
  page: RivenPage | null
  setPage: (p: RivenPage | null) => void
  command: { id: number; act: string; at: number } | undefined
  play: (act: string) => void
  /** Run this page's scan (or shrug when it has no data). */
  scan: () => void
  say: { text: string; ms?: number } | null
  speak: (text: string, ms?: number) => void
  /** Double-tap: open / close voice chat. */
  listen: () => void
}

const RivenCtx = createContext<Ctx | null>(null)

export function RivenProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<RivenPage | null>(null)
  const [command, setCommand] = useState<{ id: number; act: string; at: number } | undefined>(undefined)
  const [say, setSay] = useState<{ text: string; ms?: number } | null>(null)
  const play = useCallback((act: string) => setCommand((c) => ({ id: (c?.id ?? 0) + 1, act, at: Date.now() })), [])
  const speak = useCallback((text: string, ms?: number) => setSay({ text, ms }), [])
  const pageRef = useRef(page)
  pageRef.current = page
  const scan = useCallback(() => {
    const s = pageRef.current?.scan
    if (!s) return play("wave")
    play(s.hasData && pageRef.current?.holos?.length ? "scan" : "nodata")
  }, [play])
  const voice = useRivenVoice({
    topic: () => pageRef.current?.topic,
    onThinking: () => play("think"),
    onAnswer: (short) => {
      play("nod")
      speak(short, 6000)
    },
  })
  const listen = voice.toggle
  const value = useMemo(
    () => ({ page, setPage, command, play, scan, say, speak, listen }),
    [page, command, play, scan, say, speak, listen],
  )
  return (
    <RivenCtx.Provider value={value}>
      {children}
      <VoicePanel
        chat={voice.chat}
        onAsk={voice.ask}
        onClose={voice.toggle}
        onListen={voice.listen}
        onStop={voice.stopListening}
        onReply={voice.setReply}
      />
    </RivenCtx.Provider>
  )
}

/** Same as useRiven, but null outside the provider (e.g. isolated previews). */
export function useRivenOptional() {
  return useContext(RivenCtx)
}

export function useRiven() {
  const c = useContext(RivenCtx)
  if (!c) throw new Error("useRiven outside RivenProvider")
  return c
}

/**
 * Register what Riven shows on this page. Data is compared by value so a
 * re-render with the same numbers doesn't restart him; callbacks always use
 * the latest version.
 */
export function useRivenPage(page: RivenPage | null) {
  const { setPage } = useRiven()
  const latest = useRef(page)
  latest.current = page
  const key = JSON.stringify(page, (_, v) => (typeof v === "function" ? undefined : v))
  useEffect(() => {
    const p = latest.current
    if (!p) {
      setPage(null)
      return
    }
    setPage({
      ...p,
      scan: p.scan && {
        hasData: p.scan.hasData,
        onPress: () => latest.current?.scan?.onPress?.(),
        onDone: () => latest.current?.scan?.onDone?.(),
      },
    })
  }, [key, setPage])
  useEffect(() => () => setPage(null), [setPage])
}

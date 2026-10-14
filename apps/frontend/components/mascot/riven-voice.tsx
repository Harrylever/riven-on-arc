"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import * as sfx from "@/lib/bot-sfx"
import {
  preloadRobotVoice,
  speakRobot,
  stopRobotVoice,
} from "@/lib/robot-voice"
import { Input } from "@/components/ui/input"
import { RV_INPUT } from "@/components/riven/card-style"
import { Button } from "@/components/ui/button"

/**
 * Talk to Riven. Double-tap him to open (and double-tap again to close) a
 * chat panel. Speak with the mic button — the browser's own speech
 * recognition, free, no key — or type. Riven's analysis engine answers from
 * his data (the page you're on is the context; Gemini or Claude only reword
 * it when a key is set), and he replies the way you choose: out loud, or as
 * text. He explains — he never tells anyone to trade.
 */

type Topic =
  | { kind: "token"; address: string }
  | { kind: "perp"; coin: string }
  | undefined
type Msg = { who: "you" | "riven"; text: string; mode?: string }
/** robot = Riven's own synthesized robot voice · natural = the browser's voice · text = no speech */
export type ReplyMode = "robot" | "natural" | "text"
export interface VoiceChat {
  open: boolean
  listening: boolean
  heard: string
  thinking: boolean
  msgs: Msg[]
  reply: ReplyMode
  micSupported: boolean
  micError: string | null
}

interface SpeechRec {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult:
    | ((e: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >
      }) => void)
    | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecCtor = new () => SpeechRec

function recCtor(): RecCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: RecCtor
    webkitSpeechRecognition?: RecCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const REPLY_KEY = "riven_reply_mode_v1"

/** What Riven says out loud: no bullets, sources or long disclaimers. */
function spoken(text: string) {
  return text
    .split("\n")
    .filter((l) => !/^source:/i.test(l.trim()))
    .join(". ")
    .replace(/•/g, "")
    .replace(/Not financial advice\. DYOR\./g, "Not financial advice.")
    .replace(/\$([A-Z]{2,})/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim()
    .slice(0, 700)
}

function say(text: string) {
  try {
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(spoken(text))
    u.rate = 1.05
    u.pitch = 1.15
    const voice = synth
      .getVoices()
      .find(
        (v) =>
          /^en[-_]/i.test(v.lang) &&
          /google|samantha|daniel|aria|guy|jenny|zira|natural/i.test(v.name),
      )
    if (voice) u.voice = voice
    synth.speak(u)
  } catch {
    // no speech voice on this device: the text is still in the panel
  }
}

export function useRivenVoice(opts: {
  topic: () => Topic
  onThinking: () => void
  onAnswer: (short: string) => void
}) {
  const [chat, setChat] = useState<VoiceChat>({
    open: false,
    listening: false,
    heard: "",
    thinking: false,
    msgs: [],
    reply: "robot",
    micSupported: true,
    micError: null,
  })
  const rec = useRef<SpeechRec | null>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const replyRef = useRef<ReplyMode>("robot")
  // What Riven last talked about + the recent turns, so follow-ups ("and its holders?") work.
  const subjectRef = useRef<string | undefined>(undefined)
  const msgsRef = useRef<VoiceChat["msgs"]>([])
  msgsRef.current = chat.msgs

  useEffect(() => {
    let reply: ReplyMode = "robot"
    try {
      const saved = localStorage.getItem(REPLY_KEY)
      if (saved === "text" || saved === "natural") reply = saved
    } catch {}
    replyRef.current = reply
    setChat((c) => ({ ...c, reply, micSupported: recCtor() !== null }))
  }, [])

  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q) return
    setChat((c) => ({
      ...c,
      thinking: true,
      heard: "",
      msgs: [...c.msgs, { who: "you", text: q }],
    }))
    optsRef.current.onThinking()
    sfx.compute(1400)
    let text: string
    let mode: string | undefined
    try {
      const res = await fetch("/api/arc/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          topic: optsRef.current.topic(),
          subject: subjectRef.current,
          history: msgsRef.current
            .slice(-6)
            .map((m) => ({ who: m.who, text: m.text })),
        }),
      })
      const d = (await res.json()) as {
        text?: string
        error?: string
        mode?: string
        tokens?: Array<{ address: string }>
      }
      if (d.tokens?.length === 1) subjectRef.current = d.tokens[0]!.address
      text = d.text ?? d.error ?? "I couldn't answer that right now."
      mode = d.mode
    } catch {
      sfx.glitch()
      text = "I couldn't reach my data just now. Try again in a moment."
    }
    setChat((c) => ({
      ...c,
      thinking: false,
      msgs: [...c.msgs, { who: "riven", text, mode }],
    }))
    optsRef.current.onAnswer(text.split("\n")[0]!.slice(0, 140))
    sfx.talk()
    if (replyRef.current === "robot") {
      // his own robot voice; the browser voice if it can't run here
      if (!(await speakRobot(spoken(text)))) say(text)
    } else if (replyRef.current === "natural") say(text)
  }, [])

  const stopListening = useCallback(() => {
    rec.current?.stop()
  }, [])

  /** Mic button: start listening; the question is sent when you stop talking. */
  const listen = useCallback(() => {
    sfx.arm()
    window.speechSynthesis?.cancel()
    stopRobotVoice()
    const C = recCtor()
    if (!C) {
      setChat((c) => ({
        ...c,
        micSupported: false,
        micError:
          "This browser can't listen — type instead (voice works in Chrome, Edge and Safari).",
      }))
      return
    }
    rec.current?.abort()
    const r = new C()
    rec.current = r
    r.lang = navigator.language || "en-US"
    r.interimResults = true
    r.continuous = false
    let finalText = ""
    let lastHeard = ""
    r.onresult = (e) => {
      let heard = ""
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!
        heard += res[0]!.transcript
        if (res.isFinal) finalText = heard
      }
      lastHeard = heard
      setChat((c) => ({ ...c, heard }))
    }
    r.onerror = (e) => {
      const msg =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone is blocked — allow it in the address bar, or type instead."
          : e.error === "no-speech"
            ? "I didn't catch anything. Tap the mic and try again."
            : e.error === "network"
              ? "Voice recognition needs an internet connection. Type instead."
              : null
      if (msg) {
        sfx.glitch()
        setChat((c) => ({ ...c, micError: msg }))
      }
    }
    r.onend = () => {
      rec.current = null
      const heard = (finalText || lastHeard).trim()
      setChat((c) => ({ ...c, listening: false }))
      if (heard) void ask(heard)
    }
    setChat((c) => ({
      ...c,
      open: true,
      listening: true,
      heard: "",
      micError: null,
    }))
    try {
      r.start()
    } catch {
      setChat((c) => ({
        ...c,
        listening: false,
        micError: "Couldn't start the microphone — type instead.",
      }))
    }
  }, [ask])

  /** Double-tap on Riven: open the chat (and start listening), or close it. */
  const toggle = useCallback(() => {
    sfx.arm()
    setChat((c) => {
      if (c.open) {
        rec.current?.abort()
        window.speechSynthesis?.cancel()
        stopRobotVoice()
        sfx.zoomOut()
        return { ...c, open: false, listening: false, heard: "" }
      }
      sfx.zoomIn()
      if (replyRef.current === "robot") preloadRobotVoice()
      return { ...c, open: true, micError: null }
    })
  }, [])

  const setReply = useCallback((reply: ReplyMode) => {
    replyRef.current = reply
    if (reply !== "natural") window.speechSynthesis?.cancel()
    if (reply !== "robot") stopRobotVoice()
    else preloadRobotVoice()
    try {
      localStorage.setItem(REPLY_KEY, reply)
    } catch {}
    setChat((c) => ({ ...c, reply }))
  }, [])

  useEffect(() => () => rec.current?.abort(), [])
  return { chat, toggle, listen, stopListening, ask, setReply }
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

/** The chat panel beside Riven while voice chat is on. */
export function VoicePanel({
  chat,
  onAsk,
  onClose,
  onListen,
  onStop,
  onReply,
}: {
  chat: VoiceChat
  onAsk: (q: string) => void
  onClose: () => void
  onListen: () => void
  onStop: () => void
  onReply: (r: ReplyMode) => void
}) {
  const [typed, setTyped] = useState("")
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [chat.msgs.length, chat.thinking])
  if (!chat.open) return null
  return (
    <div
      role="dialog"
      aria-label="Voice chat with Riven"
      className="fixed right-2 bottom-[214px] z-40 flex w-[min(370px,calc(100vw-16px))] flex-col rounded-xl border border-[rgba(124,196,232,0.35)] bg-[rgba(10,14,20,0.97)] text-[13px] text-[var(--rv-ink)] shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur lg:right-4 lg:bottom-[260px]"
      style={{ animation: "rv-pop 180ms ease-out" }}
    >
      <div className="flex items-center gap-2 border-b border-[var(--rv-stroke)] px-3 py-2">
        <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--rv-blue)] uppercase">
          Talk to Riven
        </span>
        <div
          className="rv-seg ml-auto"
          role="radiogroup"
          aria-label="How Riven replies"
        >
          <Button
            variant="plain"
            size="bare"
            type="button"
            role="radio"
            aria-checked={chat.reply === "robot"}
            onClick={() => onReply("robot")}
            className="!px-2 !py-1 !text-[11px]"
            title="Riven's own robot voice"
          >
            🤖 Riven
          </Button>
          <Button
            variant="plain"
            size="bare"
            type="button"
            role="radio"
            aria-checked={chat.reply === "natural"}
            onClick={() => onReply("natural")}
            className="!px-2 !py-1 !text-[11px]"
            title="Your browser's natural voice"
          >
            🗣 Natural
          </Button>
          <Button
            variant="plain"
            size="bare"
            type="button"
            role="radio"
            aria-checked={chat.reply === "text"}
            onClick={() => onReply("text")}
            className="!px-2 !py-1 !text-[11px]"
          >
            Text
          </Button>
        </div>
        <Button
          variant="plain"
          size="bare"
          type="button"
          onClick={onClose}
          className="grid size-6 place-items-center rounded-full text-[var(--rv-ink-3)] hover:bg-white/[0.06] hover:text-[var(--rv-ink)]"
          aria-label="Close voice chat (or double-tap Riven)"
        >
          ×
        </Button>
      </div>

      <div className="flex max-h-[42vh] min-h-[90px] flex-col gap-2 overflow-y-auto px-3 py-2.5">
        {chat.msgs.length === 0 && !chat.listening && (
          <p className="text-[var(--rv-ink-3)]">
            Tap the mic and ask anything — “what's happening on Arc?”, “is this
            token safe?”, “tokens under $50K with socials”, “why is SOL
            pumping?”, “what does funding mean?”. Double-tap me again to close.
          </p>
        )}
        {chat.msgs.map((m, i) => (
          <div key={i} className={m.who === "you" ? "self-end text-right" : ""}>
            <div
              className={`inline-block max-w-[300px] rounded-lg px-2.5 py-1.5 leading-relaxed whitespace-pre-line ${
                m.who === "you"
                  ? "bg-[var(--rv-blue)] text-[var(--rv-on-blue)]"
                  : "bg-white/[0.05]"
              }`}
            >
              {m.text}
            </div>
            {m.who === "riven" && (
              <p className="mt-0.5 text-[10.5px] text-[var(--rv-ink-3)]">
                {m.mode === "gemini"
                  ? "Worded by Gemini from Riven's data"
                  : m.mode === "claude"
                    ? "Worded by Claude from Riven's data"
                    : "Riven's analysis engine"}
              </p>
            )}
          </div>
        ))}
        {chat.listening && (
          <p className="flex items-center gap-2 text-[var(--rv-ink-2)] italic">
            <span className="size-2 shrink-0 rounded-full bg-[var(--rv-risk)]" />
            {chat.heard || "Listening… speak now"}
          </p>
        )}
        {chat.thinking && (
          <p className="text-[var(--rv-ink-3)]">Riven is reading his data…</p>
        )}
        {chat.micError && (
          <p className="text-[12px] text-[var(--rv-caution)]">
            {chat.micError}
          </p>
        )}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onAsk(typed)
          setTyped("")
        }}
        className="flex items-center gap-2 border-t border-[var(--rv-stroke)] p-2"
      >
        <Button
          variant="plain"
          size="bare"
          type="button"
          onClick={chat.listening ? onStop : onListen}
          disabled={!chat.micSupported}
          aria-label={chat.listening ? "Stop listening" : "Speak to Riven"}
          aria-pressed={chat.listening}
          className="grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-40"
          style={{
            background: chat.listening ? "var(--rv-risk)" : "var(--rv-blue)",
            color: chat.listening ? "#fff" : "var(--rv-on-blue)",
          }}
          title={
            chat.micSupported
              ? undefined
              : "Voice input isn't supported in this browser"
          }
        >
          <MicIcon />
        </Button>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={
            chat.micSupported ? "…or type a question" : "Type a question"
          }
          className={`${RV_INPUT} h-9 min-w-0 flex-1 px-3 text-[13px]`}
        />
        <Button
          variant="riven"
          size="rv"
          type="submit"
          disabled={!typed.trim() || chat.thinking}
          className="h-9 px-3 text-[13px] disabled:opacity-50"
        >
          Ask
        </Button>
      </form>
      <p className="px-3 pb-2 text-[10.5px] text-[var(--rv-ink-3)]">
        Riven explains; he never tells you to trade. Not financial advice.{" "}
        <Link
          href="/agent"
          onClick={onClose}
          className="text-[var(--rv-ice)] hover:underline"
        >
          Full chat
        </Link>
      </p>
    </div>
  )
}

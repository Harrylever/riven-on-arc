"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { ScoreBadge } from "./score-badge"
import { TokenAvatar } from "./token-avatar"
import { MascotStage } from "@/components/mascot/mascot-stage"
import { RivenOrb } from "./orb-field"

interface Msg {
  role: "user" | "riven"
  text: string
  tokens?: TokenSummary[]
  mode?: "claude" | "rules"
}

const STARTERS = [
  "What rugged today?",
  "Safest tokens on Arc",
  "What's trending?",
  "Newest launches",
]

export function AgentChat() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "riven",
      text: "Ask me about any Arc token, creator or rug. Paste a 0x address, type a $TICKER, or tap a question below.",
    },
  ])
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(
    () => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    [msgs],
  )

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setQ("")
    setMsgs((m) => [...m, { role: "user", text }])
    setBusy(true)
    try {
      const res = await fetch("/api/arc/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
      })
      const d = await res.json()
      setMsgs((m) => [
        ...m,
        {
          role: "riven",
          text: d.text ?? d.error ?? "No answer.",
          tokens: d.tokens,
          mode: d.mode,
        },
      ])
    } catch {
      setMsgs((m) => [
        ...m,
        {
          role: "riven",
          text: "I couldn't reach Riven's data just now. Try again.",
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[70dvh] flex-col gap-3">
      <header className="flex items-center gap-4">
        <MascotStage
          className="h-[170px] w-[150px] shrink-0"
          framing="bust"
          lines={["Paste a 0x address or a $TICKER.", "I only answer from on-chain data.", "I'll never tell you to buy or sell — just what the chain says."]}
          greet="Ask me anything about an Arc token."
          bubbleSide="right"
        />
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--rv-ink)]">Ask Riven</h1>
          <p className="text-[13px] text-[var(--rv-ink-2)]">
            Answers come only from Riven&apos;s on-chain data — each one says whether Riven&apos;s rule engine wrote it or Claude
            rephrased those same facts. It explains; it never tells you to buy or sell.
          </p>
        </div>
      </header>
      <div
        className="rv-card flex flex-1 flex-col gap-3 p-4"
        aria-live="polite"
      >
        {msgs.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "self-end" : "self-start"}
          >
            <div
              className={`max-w-[640px] rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-line ${
                m.role === "user"
                  ? "bg-[var(--rv-blue)] text-[var(--rv-on-blue)]"
                  : "bg-white/[0.04] text-[var(--rv-ink)]"
              }`}
            >
              {m.role === "riven" && (
                <span className="rv-num mr-1 text-[12px] text-[var(--rv-blue)]">
                  riven&gt;
                </span>
              )}
              {m.text}
            </div>
            {m.mode && (
              <p className="rv-num mt-1 text-[10.5px] text-[var(--rv-ink-3)]">
                {m.mode === "claude"
                  ? "Written by Claude from Riven's data"
                  : "Riven rule engine · no AI model"}
              </p>
            )}
            {m.tokens && m.tokens.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.tokens.map((t) => (
                  <Link
                    key={t.address}
                    href={`/token/${t.address}`}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 ring-1 ring-[var(--rv-stroke)] hover:ring-[var(--rv-stroke-strong)]"
                  >
                    <TokenAvatar
                      image={t.image}
                      symbol={t.symbol}
                      address={t.address}
                      size={22}
                    />
                    <span className="text-[13px] font-semibold text-[var(--rv-ink)]">
                      {t.symbol}
                    </span>
                    <ScoreBadge score={t.score} band={t.band} size="sm" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p className="rv-num flex items-center gap-2 text-[12px] text-[var(--rv-ink-3)]">
            <RivenOrb state="searching" size={20} label="Riven is reading Arc" />
            riven&gt; reading Arc…
          </p>
        )}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => ask(s)}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--rv-ice)] ring-1 ring-[var(--rv-stroke-strong)] hover:bg-white/5"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(q)
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Is $TICKER safe? · paste a 0x address"
          aria-label="Ask Riven"
          className="rv-input h-12 min-w-0 flex-1 px-4 text-[14px]"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--rv-blue)] px-5 text-[14px] font-semibold text-[var(--rv-on-blue)] disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  )
}

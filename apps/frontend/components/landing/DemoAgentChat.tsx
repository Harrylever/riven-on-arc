"use client"

import { useRef, useState } from "react"
import { AgentChat, type AgentMessage } from "@/components/ds"

/**
 * Canned demo replies — POST /api/agent/analyze is still a 501 stub (see
 * AGENTS.md's API contracts section), so this mirrors the same demo
 * heuristic the ClawDex Landing design used rather than pretending to call
 * the real endpoint. Swap for a real fetch once that endpoint ships.
 */
function reply(text: string): string {
  const q = text.toLowerCase()
  if (q.includes("lp") || q.includes("lock")) {
    return "LP locked means the liquidity sits in a contract with a timer on it — the team can't withdraw the pool until it expires."
  }
  if (q.includes("hold") || q.includes("who")) {
    return "Top-10 concentration is read from on-chain token accounts and refreshed every few minutes. No single wallet holding too much of the supply is a healthy sign."
  }
  if (q.includes("safe") || q.includes("buy")) {
    return "I can tell you whether the ways a team could take your money are closed — mint/freeze authority, LP lock, attributed burns. That's a contract read, not price advice."
  }
  return "I read that off chain state. Ask me about authority, the LP lock, burns, or who holds the supply and I'll give you the number plus what it means."
}

const INITIAL_MESSAGES: AgentMessage[] = [
  { role: "user", content: "is this safe to buy?" },
  {
    role: "agent",
    content:
      "I can't tell you to buy — but I can tell you the ways a team could take your money are closed: mint and freeze authority revoked, LP locked. Not financial advice. DYOR.",
  },
]

export function DemoAgentChat() {
  const [messages, setMessages] = useState<AgentMessage[]>(INITIAL_MESSAGES)
  const [thinking, setThinking] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  const send = (text: string) => {
    setMessages((m) => [...m, { role: "user", content: text }])
    setThinking(true)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setMessages((m) => [...m, { role: "agent", content: reply(text) }])
      setThinking(false)
    }, 900)
  }

  return (
    <>
      <div className="mb-2 font-mono text-[11px] tracking-wider text-[var(--text-muted)] uppercase">
        Example conversation. Ask the real agent on the Agent page.
      </div>
      <AgentChat
        messages={messages}
        thinking={thinking}
        onSend={send}
        suggestions={["Who holds the most?", "What does LP lock mean?"]}
        placeholder="Paste a mint, or just ask"
        style={{ height: 400 }}
      />
    </>
  )
}

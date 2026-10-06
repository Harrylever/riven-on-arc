"use client"

import { useEffect, useRef, useState, FormEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  AgentAnswerCard,
  AgentTokenList,
  AgentKolList,
  DeployerStrip,
} from "@/components/agent/AgentAnswerCard"
import type { TokenFacts } from "@/lib/agent"
import type { DeployerProfile } from "@/lib/deployer"
import type { LeaderboardTokenItem } from "@/lib/api"
import type { KolCoordinationGroup } from "@/lib/screen"
import { ARC_PORT_MODE } from "@/lib/flags"

interface Message {
  sender: "user" | "agent"
  text: string
  mode?: "llm" | "facts"
  facts?: TokenFacts
  deployer?: DeployerProfile | null
  tokens?: LeaderboardTokenItem[]
  kolGroups?: KolCoordinationGroup[]
}

export interface AlertItem {
  id: string
  symbol: string
  mint: string
  message: string
  createdAt: string
}

interface AgentClientProps {
  initialMint?: string
  initialQuery?: string
  alerts?: AlertItem[]
}

const SOLANA_ADDRESS_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/
const EVM_ADDRESS_RE = /0x[a-fA-F0-9]{40}/

export function AgentClient({
  initialMint,
  initialQuery,
  alerts = [],
}: AgentClientProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "agent",
      text: ARC_PORT_MODE
        ? "Arc analysis is paused until verified launch signals are connected. ClawDex will not guess scores or answer from unverified data."
        : 'Paste a Solana token mint address and I will explain what ClawDex has checked on it, or ask a market question such as "new launches with healthy liquidity". I only use data ClawDex has, and I say so when something has not been checked. I don\'t give buy or sell advice.',
    },
  ])
  const [currentMint, setCurrentMint] = useState<string | undefined>(
    initialMint,
  )
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const started = useRef(false)

  const ask = async (question: string, mintOverride?: string) => {
    const addressPattern = ARC_PORT_MODE ? EVM_ADDRESS_RE : SOLANA_ADDRESS_RE
    const mint =
      mintOverride ?? question.match(addressPattern)?.[0] ?? currentMint
    setMessages((prev) => [...prev, { sender: "user", text: question }])

    if (mint) setCurrentMint(mint)
    setIsTyping(true)
    try {
      const res = await fetch("/api/agent/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint, question }),
      })
      const json = await res.json()
      const text = res.ok
        ? json.answer
        : ARC_PORT_MODE && res.status === 503
          ? "Arc analysis is not available until verified launch signals are connected."
          : res.status === 404
            ? "I couldn't find that token."
            : "The agent is unavailable right now."
      setMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text,
          mode: res.ok ? json.mode : undefined,
          facts: res.ok ? json.facts : undefined,
          deployer: res.ok ? json.deployer : undefined,
          tokens: res.ok ? json.tokens : undefined,
          kolGroups: res.ok ? json.kolGroups : undefined,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "agent", text: "The agent is unavailable right now." },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    // Fire-and-forget: `ask` is async and sets state after its own await, not
    // synchronously within this effect body — a one-time mount kickoff, not
    // state derived from props/state.

    if (initialMint) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void ask(
        initialQuery || "Explain this token's risk profile.",
        initialMint,
      )
    } else if (initialQuery) {
      void ask(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = (e?: FormEvent) => {
    if (e) e.preventDefault()
    const query = input.trim()
    if (!query || isTyping) return
    setInput("")
    void ask(query)
  }

  const handleChipClick = (promptText: string) => {
    setInput(promptText)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-none border border-[var(--line2)] bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-[var(--mut)]">
          <span className="dot"></span>{" "}
          {ARC_PORT_MODE ? "Arc Launch Agent" : "Solana Token Agent"}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--txt)] uppercase sm:text-4xl">
          ClawDex Agent
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-xs text-[var(--mut)] sm:text-sm">
          {ARC_PORT_MODE
            ? "Plain-English Arc token analysis will be enabled after verified launch data is connected."
            : "Plain-English explanations of what ClawDex has checked on a Solana token: authority, LP lock, holders, burns and market data."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Main Chat Window */}
        <div className="flex h-[580px] flex-col overflow-hidden rounded-none border border-[var(--line2)] bg-gradient-to-b from-[var(--panel2)] to-[var(--panel)] shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
          {/* Window Bar */}
          <div className="flex items-center gap-3 border-b border-[var(--line)] bg-white/[0.02] px-4 py-3">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="font-mono text-xs text-[var(--mut)]">
              {ARC_PORT_MODE
                ? "clawdex://arc-agent/data-pending"
                : "clawdex://agent/session-active"}
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-[var(--sol2)]">
              <span className="dot"></span>{" "}
              {ARC_PORT_MODE
                ? "Arc data connection pending"
                : "grounded on ClawDex data"}
            </div>
          </div>

          {/* Message Stream */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {messages.map((m, idx) => {
              const isRich = Boolean(
                m.facts || m.tokens || m.kolGroups || m.deployer,
              )
              return (
                <div
                  key={idx}
                  className={`rounded-none px-4 py-3 text-xs leading-relaxed ${
                    isRich ? "w-full max-w-full" : "max-w-[85%]"
                  } ${
                    m.sender === "user"
                      ? "self-end bg-[var(--brand)] text-[var(--text-on-brand)] shadow-md"
                      : "self-start border border-[var(--line)] bg-[var(--panel2)] text-[var(--txt)] shadow-sm"
                  }`}
                >
                  {m.sender === "agent" && (
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-[var(--sol2)]">
                      <span>🤖</span> ClawDex Agent ·{" "}
                      {m.mode === "llm"
                        ? "AI summary of ClawDex data"
                        : m.mode === "facts"
                          ? "ClawDex data (no AI model configured)"
                          : "ClawDex"}
                    </div>
                  )}
                  {m.facts ? (
                    <AgentAnswerCard
                      facts={m.facts}
                      narrative={m.text}
                      mode={m.mode}
                    />
                  ) : (
                    <div className="whitespace-pre-line">{m.text}</div>
                  )}
                  {m.tokens ? (
                    <div className="mt-2">
                      <AgentTokenList tokens={m.tokens} />
                    </div>
                  ) : null}
                  {m.kolGroups ? (
                    <div className="mt-2">
                      <AgentKolList groups={m.kolGroups} />
                    </div>
                  ) : null}
                  {!m.facts && m.deployer ? (
                    <div className="mt-2">
                      <DeployerStrip deployer={m.deployer} />
                    </div>
                  ) : null}
                </div>
              )
            })}

            {isTyping && (
              <div className="flex items-center gap-2 self-start rounded-none border border-[var(--line)] bg-[var(--panel2)] px-4 py-2.5 text-xs text-[var(--mut)]">
                <span className="dot"></span>
                {ARC_PORT_MODE
                  ? "Checking Arc analysis status..."
                  : "Reading ClawDex data..."}
              </div>
            )}
          </div>

          {!ARC_PORT_MODE && (
            <div className="flex gap-2 overflow-x-auto border-t border-[var(--line)] px-4 py-2 text-[11px]">
              <button
                onClick={() =>
                  handleChipClick("What are the biggest risks here?")
                }
                className="rounded-none border border-[var(--line)] bg-white/[0.02] px-2.5 py-1 whitespace-nowrap text-[var(--mut)] transition-all hover:border-[var(--sol2)] hover:text-[var(--txt)]"
              >
                Biggest risks
              </button>
              <button
                onClick={() => handleChipClick("Is the liquidity healthy?")}
                className="rounded-none border border-[var(--line)] bg-white/[0.02] px-2.5 py-1 whitespace-nowrap text-[var(--mut)] transition-all hover:border-[var(--sol2)] hover:text-[var(--txt)]"
              >
                Liquidity check
              </button>
              <button
                onClick={() => handleChipClick("Who holds the most supply?")}
                className="rounded-none border border-[var(--line)] bg-white/[0.02] px-2.5 py-1 whitespace-nowrap text-[var(--mut)] transition-all hover:border-[var(--sol2)] hover:text-[var(--txt)]"
              >
                Holder concentration
              </button>
            </div>
          )}

          {/* Chat Input */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 border-t border-[var(--line)] bg-black/30 p-3"
          >
            <input
              type="text"
              placeholder={
                ARC_PORT_MODE
                  ? "Arc analysis is not enabled until launch signals are verified…"
                  : "Paste a mint address, or ask about the current token…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border-none bg-transparent px-2 font-mono text-xs text-[var(--txt)] outline-none placeholder:text-[var(--mut2)]"
            />
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-to-r from-[var(--sol2)] to-[var(--cyan)] text-xs font-bold text-[var(--text-on-brand)]"
            >
              Send ↑
            </Button>
          </form>
        </div>

        {/* Autonomous Monitoring Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="rounded-none border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-[var(--mut2)] uppercase">
              <span>🔔</span> Recent alerts
            </div>

            {alerts.length === 0 ? (
              <p className="text-xs text-[var(--mut)]">
                {ARC_PORT_MODE
                  ? "Arc monitoring alerts will appear once verified launch signals are connected."
                  : "No alerts yet. Alerts appear when the monitoring service detects a change on a token it tracks."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {alerts.map((a) => (
                  <Link
                    key={a.id}
                    href={`/token/${a.mint}`}
                    className="block rounded-none border border-[var(--line)] bg-black/20 p-3 text-xs"
                  >
                    <div className="font-bold text-[var(--amber)]">
                      ${a.symbol}
                    </div>
                    <div className="mt-1 text-[var(--txt)]">{a.message}</div>
                    <div className="mt-1 text-[10px] text-[var(--mut2)]">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-none border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="mb-2 text-xs font-bold tracking-wider text-[var(--mut2)] uppercase">
              Agent Behavioral Safeguards
            </div>
            <ul className="mt-2 flex flex-col gap-2 text-xs text-[var(--mut)]">
              <li>▸ Objective analysis, never buy/sell recommendations</li>
              <li>▸ Figures come with their check timestamps</li>
              <li>▸ Always DYOR — not financial advice</li>
            </ul>
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <Link href={ARC_PORT_MODE ? "/terminal" : "/"}>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-[var(--line2)] text-xs"
                >
                  {ARC_PORT_MODE
                    ? "← Back to Arc Terminal"
                    : "← Back to Live Screener"}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, type HTMLAttributes } from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon, SentIcon } from "@hugeicons/core-free-icons"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Button } from "@/components/ui/button"

export interface AgentMessage {
  role: "user" | "agent"
  content: string
}

export interface AgentChatProps extends HTMLAttributes<HTMLDivElement> {
  messages?: AgentMessage[]
  suggestions?: string[]
  onSend?: (text: string) => void
  thinking?: boolean
  placeholder?: string
  title?: string
}

export function AgentChat({
  messages = [],
  suggestions = [],
  onSend,
  thinking,
  placeholder = "Paste a mint address, or just ask",
  title = "ClawDex Agent",
  className,
  ...rest
}: AgentChatProps) {
  const [draft, setDraft] = useState("")
  const send = (t?: string) => {
    const v = (t ?? draft).trim()
    if (!v) return
    onSend?.(v)
    setDraft("")
  }

  return (
    <div
      className={cn(
        "border-primary/30 bg-card flex min-h-0 flex-col overflow-hidden rounded-none border",
        className,
      )}
      {...rest}
    >
      <div className="border-primary/30 bg-primary/10 flex items-center gap-2 border-b px-3.5 py-3">
        <HugeiconsIcon
          icon={SparklesIcon}
          className="text-primary size-4"
          strokeWidth={2}
        />
        <span className="font-heading text-sm font-bold tracking-normal normal-case">
          {title}
        </span>
        <span className="text-primary ml-auto font-mono text-[10px] tracking-wider uppercase">
          on-chain · live
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[86%] rounded-none px-3 py-2.5 text-sm leading-relaxed",
              m.role === "user"
                ? "bg-primary text-primary-foreground self-end"
                : "border-border bg-muted/50 text-foreground self-start border",
            )}
          >
            {m.content}
          </div>
        ))}
        {thinking ? (
          <div className="border-border bg-muted/50 flex items-center gap-2 self-start rounded-none border px-3 py-2.5">
            <HugeiconsIcon
              icon={SparklesIcon}
              className="text-primary size-3.5 animate-pulse"
              strokeWidth={2}
            />
            <span className="text-muted-foreground font-mono text-xs">
              reading the contract…
            </span>
          </div>
        ) : null}
      </div>

      {suggestions.length ? (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => send(s)}
              className="border-primary/35 text-primary hover:bg-primary/10 rounded-none border px-2.5 py-1 text-xs transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="border-border border-t px-3.5 py-2.5">
        <InputGroup className="border-border bg-muted/30 h-10 border px-2">
          <InputGroupInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") send()
            }}
          />
          <InputGroupAddon align="inline-end">
            <Button
              size="icon-sm"
              variant="default"
              aria-label="Send"
              onClick={() => send()}
            >
              <HugeiconsIcon
                icon={SentIcon}
                className="size-3.5"
                strokeWidth={2}
              />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  )
}

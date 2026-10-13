// Server-only. Lets the model (Gemini or Claude) call Riven's read-only tools to
// answer a question, then phrase the result. The model can only use what the
// tools returned; if no AI key is set or anything fails, the caller falls back to
// the rule-based `answer()` path, so Ask Riven always replies.
import { TOOLS, runTool, type ToolContext } from "./agent-tools"
import { DISCLAIMER, type AgentReply } from "./riven-agent"
import { SYSTEM, readGemini, type AnswerMode, type Turn } from "./riven-writer"
import type { TokenSummary } from "./arc-data"

export const MAX_ROUNDS = 3
export const MAX_TOOL_CALLS = 5

const AGENT_SYSTEM = `${SYSTEM}

You have tools instead of a ready-made FACTS block. How to use them:
- For anything about a specific token, wallet, perp pair, the market, alerts or news, call the matching tool first; the tool results are your FACTS. Never answer those from memory.
- You may call several tools, or none for plain concept questions ("what is liquidity?") and greetings.
- "my tokens", "my bag", "what do I hold" means the user's own wallet: use my_portfolio. If it says no verified wallet, tell the user to connect and verify their wallet.
- If a tool says it couldn't fetch something, say so plainly. Never fill the gap, and never present missing data as "all clear".
- Prefer the user's current page (see CONTEXT) when they say "this" or "it".
- CONTEXT is background only. Never mention the user's page or wallet status unless the question needs it.`

export interface ModelCall {
  id: string
  name: string
  args: unknown
}
export interface ModelStep {
  text: string
  calls: ModelCall[]
}
export interface ToolResultMsg {
  call: ModelCall
  text: string
}

/** One conversation with a model. Stateful: each `turn` continues the last. */
export interface ModelSession {
  mode: Extract<AnswerMode, "claude" | "gemini">
  turn(results: ToolResultMsg[] | null, allowTools: boolean): Promise<ModelStep>
}

const decls = () => TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))

function userPrompt(question: string, history: Turn[], ctx: ToolContext) {
  const convo = history.length
    ? `CONVERSATION SO FAR:\n${history.map((h) => `${h.who === "you" ? "User" : "Riven"}: ${h.text}`).join("\n")}\n\n`
    : ""
  const page =
    ctx.topic?.kind === "token"
      ? `viewing the token ${ctx.topic.address}`
      : ctx.topic?.kind === "perp"
        ? `viewing the ${ctx.topic.coin} perp pair`
        : ctx.subject
          ? `last discussed the token ${ctx.subject}`
          : "not on a token or pair page"
  const context = `CONTEXT: user is ${page}; verified wallet: ${ctx.wallet ? "yes" : "no"}.\n\n`
  return `${convo}${context}QUESTION:\n${question}`
}

// ---- Gemini ----------------------------------------------------------------

interface GeminiPart {
  text?: string
  thought?: boolean
  functionCall?: { name: string; args?: unknown }
  [k: string]: unknown
}

export function geminiSession(key: string, model: string, system: string, first: string): ModelSession {
  const contents: Array<{ role: string; parts: GeminiPart[] }> = [{ role: "user", parts: [{ text: first }] }]
  return {
    mode: "gemini",
    async turn(results, allowTools) {
      if (results)
        contents.push({
          role: "user",
          parts: results.map((r) => ({ functionResponse: { name: r.call.name, response: { result: r.text } } })),
        })
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          ...(allowTools ? { tools: [{ functionDeclarations: decls() }] } : {}),
          generationConfig: {
            maxOutputTokens: 700,
            temperature: 0.3,
            ...(/pro/i.test(model) ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
          },
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`gemini ${model} ${res.status}`)
      const data = (await res.json()) as { candidates?: Array<{ finishReason?: string; content?: { role?: string; parts?: GeminiPart[] } }> }
      const c = data.candidates?.[0]
      const parts = c?.content?.parts ?? []
      const calls = parts.flatMap((p, i) => (p.functionCall ? [{ id: `g${contents.length}-${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} }] : []))
      if (calls.length) {
        // Echo the model's turn back verbatim (Gemini 3 needs its thought signatures).
        contents.push({ role: "model", parts })
        return { text: "", calls }
      }
      // No tool call: reuse the strict reader so a cut-off reply is an error, not an answer.
      return { text: readGemini({ candidates: data.candidates }), calls: [] }
    },
  }
}

// ---- Claude ----------------------------------------------------------------

type ClaudeBlock = { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string }

export function claudeSession(key: string, model: string, system: string, first: string): ModelSession {
  const messages: Array<{ role: "user" | "assistant"; content: string | ClaudeBlock[] }> = [{ role: "user", content: first }]
  return {
    mode: "claude",
    async turn(results, allowTools) {
      if (results)
        messages.push({
          role: "user",
          content: results.map((r) => ({ type: "tool_result", tool_use_id: r.call.id, content: r.text })),
        })
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 700,
          system,
          messages,
          ...(allowTools ? { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`anthropic ${res.status}`)
      const data = (await res.json()) as { content?: ClaudeBlock[]; stop_reason?: string }
      const blocks = data.content ?? []
      const calls = blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id ?? "", name: b.name ?? "", args: b.input ?? {} }))
      if (calls.length) {
        messages.push({ role: "assistant", content: blocks })
        return { text: "", calls }
      }
      if (data.stop_reason === "max_tokens") throw new Error("stopped early (max_tokens)")
      return { text: blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim(), calls: [] }
    },
  }
}

/** The AI backend configured for this deployment, or null (rules-only). Claude wins if both are set. */
export function openSession(question: string, history: Turn[], ctx: ToolContext): ModelSession | null {
  const first = userPrompt(question, history, ctx)
  const claude = process.env.ANTHROPIC_API_KEY
  if (claude) return claudeSession(claude, process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001", AGENT_SYSTEM, first)
  const gemini = process.env.GEMINI_API_KEY
  if (gemini) return geminiSession(gemini, process.env.GEMINI_MODEL || "gemini-3.1-flash-lite", AGENT_SYSTEM, first)
  return null
}

/**
 * Run the tool loop. Throws on any model/transport failure — the caller then
 * falls back to the rule-based answer.
 */
export async function runAgent(
  session: ModelSession,
  ctx: ToolContext,
): Promise<AgentReply & { mode: ModelSession["mode"]; toolsUsed: string[] }> {
  const tokens = new Map<string, TokenSummary>()
  const toolsUsed: string[] = []
  let calls = 0
  let step = await session.turn(null, true)
  for (let round = 0; step.calls.length > 0; round++) {
    // Out of rounds or calls: drop the tools so the model must answer with what it has.
    const last = round >= MAX_ROUNDS - 1 || calls + step.calls.length > MAX_TOOL_CALLS
    const run = last ? step.calls.slice(0, Math.max(MAX_TOOL_CALLS - calls, 0)) : step.calls
    const results: ToolResultMsg[] = await Promise.all(
      step.calls.map(async (call) => {
        if (!run.includes(call)) return { call, text: "Skipped: tool-call limit reached for this question." }
        const reply = await runTool(call.name, call.args, ctx)
        for (const t of reply.tokens) tokens.set(t.address, t)
        toolsUsed.push(call.name)
        return { call, text: reply.text }
      }),
    )
    calls += run.length
    step = await session.turn(results, !last)
    if (last && step.calls.length > 0) throw new Error("model kept calling tools after tools were disabled")
  }
  let text = step.text.trim()
  if (!text) throw new Error("empty reply")
  if (!text.endsWith(DISCLAIMER)) text = `${text}\n\n${DISCLAIMER}`
  return { text, tokens: [...tokens.values()].slice(0, 6), mode: session.mode, toolsUsed }
}

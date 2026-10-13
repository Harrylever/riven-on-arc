import { NextResponse } from "next/server"
import { answer, type AgentTopic } from "@/lib/riven-agent"
import type { Turn } from "@/lib/riven-writer"
import { openSession, runAgent } from "@/lib/agent-loop"
import { identify } from "@/lib/ask-identity"
import { peekUsage, prismaQuotaStore, spendCall, WALLET_LIMIT } from "@/lib/ask-quota"

export const dynamic = "force-dynamic"

/**
 * POST /api/arc/agent { question } — grounded answer from Riven's own data.
 * `mode` says who wrote it: "rules" (Riven's analysis engine) or the AI that
 * rephrased those same facts ("claude" with ANTHROPIC_API_KEY, "gemini" with
 * GEMINI_API_KEY). `topic` = the token or perp pair on the asking page.
 *
 * Each question spends one call of the daily allowance: 10 for a wallet verified
 * through /api/arc/session, 3 without one (see lib/ask-quota.ts). Over the limit
 * it answers 429. With an AI key set the model answers by calling Riven's tools
 * (lib/agent-tools.ts); otherwise, or on any failure, the rule engine answers.
 */

/** GET → today's usage for the caller, without spending a call. */
export async function GET(req: Request) {
  try {
    return NextResponse.json({ usage: await peekUsage(prismaQuotaStore, identify(req)) })
  } catch (err) {
    console.error(`[arc/agent] usage: ${(err as Error).message}`)
    return NextResponse.json({ error: "Couldn't read your allowance" }, { status: 503 })
  }
}

export async function POST(req: Request) {
  let question = ""
  let topic: AgentTopic | undefined
  let subject: string | undefined
  let history: Turn[] = []
  try {
    const body = (await req.json()) as {
      question?: unknown
      topic?: { kind?: unknown; address?: unknown; coin?: unknown }
      subject?: unknown
      history?: unknown
    }
    question =
      typeof body.question === "string" ? body.question.slice(0, 500) : ""
    // What "this" means on the page the question came from (voice asks from any page).
    const t = body.topic
    if (t?.kind === "token" && typeof t.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(t.address))
      topic = { kind: "token", address: t.address.toLowerCase() }
    else if (t?.kind === "perp" && typeof t.coin === "string" && /^[A-Za-z0-9]{1,20}$/.test(t.coin))
      topic = { kind: "perp", coin: t.coin.toUpperCase() }
    // The token Riven last talked about, for follow-ups like "and its holders?"
    if (typeof body.subject === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.subject)) subject = body.subject.toLowerCase()
    // A few previous turns so the AI voice can follow the conversation.
    if (Array.isArray(body.history))
      history = body.history
        .filter((h): h is { who: string; text: string } => typeof h?.who === "string" && typeof h?.text === "string")
        .slice(-6)
        .map((h) => ({ who: h.who === "you" ? "you" : "riven", text: h.text.slice(0, 600) }))
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!question.trim())
    return NextResponse.json({ error: "Ask a question" }, { status: 400 })
  const id = identify(req)
  let spent: Awaited<ReturnType<typeof spendCall>>
  try {
    spent = await spendCall(prismaQuotaStore, id)
  } catch (err) {
    // Can't count = can't enforce the limit, so don't answer (a failed read is an error, not "all clear").
    console.error(`[arc/agent] quota: ${(err as Error).message}`)
    return NextResponse.json({ error: "Riven couldn't check your allowance right now" }, { status: 503 })
  }
  if (!spent.ok) {
    const anon = spent.usage.tier === "anon"
    return NextResponse.json(
      {
        error:
          spent.reason === "ip"
            ? "Too many questions from this network today. Try again tomorrow."
            : anon
              ? `You've used your ${spent.usage.limit} free questions today. Connect and verify your wallet for ${WALLET_LIMIT} a day.`
              : `You've used all ${spent.usage.limit} questions for today. Your allowance resets at 00:00 UTC.`,
        reason: spent.reason,
        usage: spent.usage,
        needsWallet: anon && spent.reason === "tier",
      },
      { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((Date.parse(spent.usage.resetAt) - Date.now()) / 1000))) } },
    )
  }
  try {
    const ctx = { wallet: id.wallet, topic, subject }
    const session = openSession(question, history, ctx)
    if (session) {
      try {
        const { toolsUsed, ...reply } = await runAgent(session, ctx)
        return NextResponse.json({ ...reply, tools: toolsUsed, usage: spent.usage })
      } catch (err) {
        console.warn(`[arc/agent] AI tool loop failed, using rule engine: ${(err as Error).message}`)
      }
    }
    return NextResponse.json({ ...(await answer(question, ctx)), mode: "rules", usage: spent.usage })
  } catch (err) {
    console.error(`[arc/agent] ${(err as Error).message}`)
    await spent.release().catch(() => {})
    return NextResponse.json(
      { error: "Riven couldn't answer right now" },
      { status: 503 },
    )
  }
}

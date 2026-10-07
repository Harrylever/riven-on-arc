import { NextResponse } from "next/server"
import { answer, type AgentTopic } from "@/lib/riven-agent"
import type { Turn } from "@/lib/riven-writer"
import { writeAnswer } from "@/lib/riven-writer"

export const dynamic = "force-dynamic"

/**
 * POST /api/arc/agent { question } — grounded answer from Riven's own data.
 * `mode` says who wrote it: "rules" (Riven's analysis engine) or the AI that
 * rephrased those same facts ("claude" with ANTHROPIC_API_KEY, "gemini" with
 * GEMINI_API_KEY). `topic` = the token or perp pair on the asking page.
 */
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
  try {
    return NextResponse.json(
      await writeAnswer(question, await answer(question, { topic, subject }), history),
    )
  } catch (err) {
    console.error(`[arc/agent] ${(err as Error).message}`)
    return NextResponse.json(
      { error: "Riven couldn't answer right now" },
      { status: 503 },
    )
  }
}

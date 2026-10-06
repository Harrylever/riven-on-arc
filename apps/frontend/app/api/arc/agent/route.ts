import { NextResponse } from "next/server"
import { answer } from "@/lib/riven-agent"

export const dynamic = "force-dynamic"

/** POST /api/arc/agent { question } — grounded answer from Riven's own data. */
export async function POST(req: Request) {
  let question = ""
  try {
    const body = (await req.json()) as { question?: unknown }
    question = typeof body.question === "string" ? body.question.slice(0, 500) : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!question.trim()) return NextResponse.json({ error: "Ask a question" }, { status: 400 })
  try {
    return NextResponse.json(await answer(question))
  } catch (err) {
    console.error(`[arc/agent] ${(err as Error).message}`)
    return NextResponse.json({ error: "Riven couldn't answer right now" }, { status: 503 })
  }
}

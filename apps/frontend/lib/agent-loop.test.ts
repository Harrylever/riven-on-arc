import { describe, expect, mock, test } from "bun:test"
import type { ToolContext } from "./agent-tools"

const ran: Array<{ name: string; args: unknown; ctx: ToolContext }> = []
mock.module("./agent-tools", () => ({
  TOOLS: [],
  runTool: async (name: string, args: unknown, ctx: ToolContext) => {
    ran.push({ name, args, ctx })
    return { text: `facts from ${name}`, tokens: name === "get_token" ? [{ address: "0xabc" }] : [] }
  },
}))

const { MAX_TOOL_CALLS, runAgent } = await import("./agent-loop")
const { DISCLAIMER } = await import("./riven-agent")

type Step = { text: string; calls: Array<{ id: string; name: string; args: unknown }> }
function stub(steps: Step[]) {
  const seen: Array<{ results: unknown; allowTools: boolean }> = []
  let i = 0
  return {
    seen,
    session: {
      mode: "gemini" as const,
      async turn(results: unknown, allowTools: boolean) {
        seen.push({ results, allowTools })
        const s = steps[Math.min(i++, steps.length - 1)]!
        return s
      },
    },
  }
}
const call = (name: string, id = name) => ({ id, name, args: { token: "PEPE" } })
const ctx: ToolContext = { wallet: "0x" + "a".repeat(40) }

describe("runAgent", () => {
  test("answers directly with no tools and appends the disclaimer", async () => {
    const { session } = stub([{ text: "Liquidity is how easily you can sell.", calls: [] }])
    const r = await runAgent(session, ctx)
    expect(r.text.endsWith(DISCLAIMER)).toBe(true)
    expect(r.toolsUsed).toEqual([])
  })

  test("runs the requested tools, feeds results back, and returns the token chips", async () => {
    ran.length = 0
    const { session, seen } = stub([
      { text: "", calls: [call("get_token"), call("rug_alerts")] },
      { text: "PEPE looks fine. " + DISCLAIMER, calls: [] },
    ])
    const r = await runAgent(session, ctx)
    expect(ran.map((x) => x.name)).toEqual(["get_token", "rug_alerts"])
    expect(ran[0]!.ctx.wallet).toBe(ctx.wallet) // tools see the verified wallet
    expect(r.toolsUsed).toEqual(["get_token", "rug_alerts"])
    expect(r.tokens).toHaveLength(1)
    expect((seen[1]!.results as Array<{ text: string }>).map((x) => x.text)).toEqual(["facts from get_token", "facts from rug_alerts"])
    expect(r.text.match(new RegExp(DISCLAIMER.replace(/\./g, "\\."), "g"))).toHaveLength(1)
  })

  test("stops looping: tools are switched off after the round limit", async () => {
    ran.length = 0
    const { session, seen } = stub([
      { text: "", calls: [call("get_token", "a")] },
      { text: "", calls: [call("get_token", "b")] },
      { text: "", calls: [call("get_token", "c")] },
      { text: "Done.", calls: [] },
    ])
    const r = await runAgent(session, ctx)
    expect(r.text).toContain("Done.")
    expect(seen.at(-1)!.allowTools).toBe(false)
  })

  test("never runs more than the tool-call budget", async () => {
    ran.length = 0
    const many = Array.from({ length: 8 }, (_, i) => call("get_token", `c${i}`))
    const { session, seen } = stub([
      { text: "", calls: many },
      { text: "Answer.", calls: [] },
    ])
    await runAgent(session, ctx)
    expect(ran.length).toBeLessThanOrEqual(MAX_TOOL_CALLS)
    // the skipped calls still get a (skipped) result so the model's turn is complete
    expect((seen[1]!.results as unknown[]).length).toBe(8)
  })

  test("a model that ignores 'no more tools' is an error (caller falls back to rules)", async () => {
    const { session } = stub([{ text: "", calls: [call("get_token")] }])
    await expect(runAgent(session, ctx)).rejects.toThrow()
  })

  test("an empty reply is an error", async () => {
    const { session } = stub([{ text: "  ", calls: [] }])
    await expect(runAgent(session, ctx)).rejects.toThrow("empty")
  })
})

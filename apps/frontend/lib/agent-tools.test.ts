import { describe, expect, test } from "bun:test"
import { TOOLS, runTool } from "./agent-tools"

describe("agent tools", () => {
  test("every tool is named, described and has an object schema", () => {
    const names = new Set<string>()
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/)
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.parameters.type).toBe("object")
      for (const r of t.parameters.required ?? []) expect(t.parameters.properties).toHaveProperty(r)
      expect(names.has(t.name)).toBe(false)
      names.add(t.name)
    }
  })

  test("an unknown tool name is a harmless message, not a crash", async () => {
    const r = await runTool("drop_database", {}, { wallet: null })
    expect(r.text).toContain("no tool called")
  })

  test("bad arguments are refused before touching any data", async () => {
    expect((await runTool("get_creator", { wallet: "not-an-address" }, { wallet: null })).text).toContain("valid wallet")
    expect((await runTool("compare_tokens", { tokens: ["only-one"] }, { wallet: null })).text).toContain("at least two")
    expect((await runTool("get_token", "garbage", { wallet: null })).text).toContain("No token given")
  })

  test("my_portfolio never works without a verified wallet", async () => {
    const r = await runTool("my_portfolio", { wallet: "0x" + "a".repeat(40) }, { wallet: null })
    expect(r.text).toContain("hasn't connected and verified")
  })

  test("page_context with nothing to point at says so", async () => {
    expect((await runTool("page_context", {}, { wallet: null })).text).toContain("isn't on a token or pair page")
  })
})

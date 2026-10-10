import { describe, expect, test } from "bun:test"
import { readGemini } from "./riven-writer"

const reply = (finishReason: string | undefined, text: string) => ({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
})

describe("readGemini", () => {
  test("returns the text of a finished reply", () => {
    expect(readGemini(reply("STOP", "Hello. "))).toBe("Hello.")
  })
  test("joins multi-part replies", () => {
    expect(readGemini({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "a " }, { text: "b" }] } }] })).toBe("a b")
  })
  test("a reply cut off by the token limit is an error, not an answer", () => {
    expect(() => readGemini(reply("MAX_TOKENS", "There are actually two different tokens using the"))).toThrow("MAX_TOKENS")
  })
  test("a safety stop is an error too", () => {
    expect(() => readGemini(reply("SAFETY", ""))).toThrow("SAFETY")
  })
  test("no candidates is an error", () => {
    expect(() => readGemini({})).toThrow("no candidate")
  })
})

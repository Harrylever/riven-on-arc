import { describe, expect, test } from "bun:test"
import { cached } from "./memo"

describe("cached", () => {
  test("serves a fresh value without loading again", async () => {
    let calls = 0
    const load = async () => ++calls
    expect(await cached("memo-fresh", 60_000, load)).toBe(1)
    expect(await cached("memo-fresh", 60_000, load)).toBe(1)
    expect(calls).toBe(1)
  })
  test("concurrent callers share one load", async () => {
    let calls = 0
    const load = async () => {
      await new Promise((r) => setTimeout(r, 20))
      return ++calls
    }
    const [a, b] = await Promise.all([cached("memo-shared-inflight", 60_000, load), cached("memo-shared-inflight", 60_000, load)])
    expect([a, b, calls]).toEqual([1, 1, 1])
  })
  test("shared mode still loads when Next's data cache is unavailable (tests, scripts)", async () => {
    expect(await cached("memo-shared-fallback", 60_000, async () => ({ ok: true }), { shared: true })).toEqual({ ok: true })
  })
  test("a failed load is not cached, so the next call retries and the error is not hidden", async () => {
    let calls = 0
    const load = async () => {
      calls++
      if (calls === 1) throw new Error("db down")
      return "back"
    }
    await expect(cached("memo-fail", 60_000, load, { shared: true })).rejects.toThrow("db down")
    expect(await cached("memo-fail", 60_000, load, { shared: true })).toBe("back")
    expect(calls).toBe(2)
  })
})

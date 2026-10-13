import { describe, expect, test } from "bun:test"
import { TimeoutError, withTimeout } from "./with-timeout"

const never = () => new Promise<never>(() => {})
const later = <T>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms))

describe("withTimeout", () => {
  test("returns the value when the work finishes in time", async () => {
    expect(await withTimeout(later("ok", 5), 200, "x")).toBe("ok")
  })
  test("rejects with the step's name when the work never settles", async () => {
    const err = await withTimeout(never(), 20, "pool indexing").catch((e) => e)
    expect(err).toBeInstanceOf(TimeoutError)
    expect(err.message).toContain("pool indexing timed out after 0s")
  })
  test("passes the work's own error through", async () => {
    await expect(withTimeout(Promise.reject(new Error("db down")), 200, "x")).rejects.toThrow("db down")
  })
})

import { describe, expect, test } from "bun:test"
import { ANON_LIMIT, IP_CEILING, WALLET_LIMIT, hashIp, memoryQuotaStore, nextResetAt, peekUsage, spendCall, utcDay } from "./ask-quota"

const W = "0x" + "a".repeat(40)
const anon = (ip = "ip1") => ({ wallet: null, ipHash: ip })
const wallet = (ip = "ip1", w = W) => ({ wallet: w, ipHash: ip })

describe("ask quota", () => {
  test("anonymous callers get 3 a day, then are refused", async () => {
    const s = memoryQuotaStore()
    for (let i = 1; i <= ANON_LIMIT; i++) {
      const d = await spendCall(s, anon())
      expect(d.ok).toBe(true)
      if (d.ok) expect(d.usage).toMatchObject({ tier: "anon", used: i, limit: 3 })
    }
    const d = await spendCall(s, anon())
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.reason).toBe("tier")
  })

  test("a verified wallet gets 10 a day", async () => {
    const s = memoryQuotaStore()
    for (let i = 0; i < WALLET_LIMIT; i++) expect((await spendCall(s, wallet())).ok).toBe(true)
    expect((await spendCall(s, wallet())).ok).toBe(false)
  })

  test("a refused call is not counted", async () => {
    const s = memoryQuotaStore()
    for (let i = 0; i < ANON_LIMIT; i++) await spendCall(s, anon())
    await spendCall(s, anon())
    await spendCall(s, anon())
    expect((await peekUsage(s, anon())).used).toBe(ANON_LIMIT)
    // the IP counter wasn't inflated by the refusals either
    expect(await s.get("ip", "ip1", utcDay())).toBe(ANON_LIMIT)
  })

  test("wallet allowance is separate per wallet", async () => {
    const s = memoryQuotaStore()
    for (let i = 0; i < WALLET_LIMIT; i++) await spendCall(s, wallet("ip1", W))
    expect((await spendCall(s, wallet("ip2", "0x" + "b".repeat(40)))).ok).toBe(true)
  })

  test("many wallets on one IP stop at the IP ceiling", async () => {
    const s = memoryQuotaStore()
    let ok = 0
    for (let i = 0; i < IP_CEILING + 5; i++) {
      const d = await spendCall(s, wallet("shared", "0x" + i.toString(16).padStart(40, "0")))
      if (d.ok) ok++
      else expect(d.reason).toBe("ip")
    }
    expect(ok).toBe(IP_CEILING)
  })

  test("anonymous calls don't eat a wallet's allowance", async () => {
    const s = memoryQuotaStore()
    for (let i = 0; i < ANON_LIMIT; i++) await spendCall(s, anon())
    const d = await spendCall(s, wallet())
    expect(d.ok).toBe(true)
    if (d.ok) expect(d.usage.used).toBe(1)
  })

  test("release hands the call back, once", async () => {
    const s = memoryQuotaStore()
    const d = await spendCall(s, anon())
    if (!d.ok) throw new Error("expected ok")
    await d.release()
    await d.release()
    expect((await peekUsage(s, anon())).used).toBe(0)
    expect(await s.get("ip", "ip1", utcDay())).toBe(0)
  })

  test("a new UTC day starts fresh", async () => {
    const s = memoryQuotaStore()
    const day1 = new Date("2026-10-13T23:59:00Z")
    for (let i = 0; i < ANON_LIMIT; i++) await spendCall(s, anon(), day1)
    expect((await spendCall(s, anon(), day1)).ok).toBe(false)
    expect((await spendCall(s, anon(), new Date("2026-10-14T00:00:01Z"))).ok).toBe(true)
  })

  test("concurrent calls can't exceed the limit", async () => {
    const s = memoryQuotaStore()
    const all = await Promise.all(Array.from({ length: 8 }, () => spendCall(s, anon())))
    expect(all.filter((d) => d.ok).length).toBe(ANON_LIMIT)
  })

  test("resets at the next 00:00 UTC", () => {
    expect(nextResetAt(new Date("2026-10-13T18:30:00Z"))).toBe("2026-10-14T00:00:00.000Z")
  })

  test("IPs are stored salted, never raw", () => {
    const h = hashIp("203.0.113.9", "secret")
    expect(h).not.toContain("203")
    expect(h).toBe(hashIp("203.0.113.9", "secret"))
    expect(h).not.toBe(hashIp("203.0.113.9", "other"))
  })
})

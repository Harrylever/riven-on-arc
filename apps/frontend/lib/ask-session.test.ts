import { describe, expect, test } from "bun:test"
import { privateKeyToAccount } from "viem/accounts"
import { signInMessage } from "./ask-session-message"
import { SESSION_COOKIE, makeSessionToken, newNonce, verifySignIn, walletFromCookies } from "./ask-session"

const SECRET = "test-secret-at-least-16-chars"
const acct = privateKeyToAccount("0x" + "11".repeat(32) as `0x${string}`)
const HOST = "riven.test"

async function signed(over: { nonce?: string; issuedAt?: string; domain?: string } = {}, now = Date.now()) {
  const message = signInMessage({
    domain: over.domain ?? HOST,
    address: acct.address,
    nonce: over.nonce ?? newNonce(SECRET, now),
    issuedAt: over.issuedAt ?? new Date(now).toISOString(),
  })
  return { message, signature: await acct.signMessage({ message }) }
}

describe("wallet sign-in", () => {
  test("accepts a fresh signature from the wallet", async () => {
    const r = await verifySignIn({ ...(await signed()), host: HOST }, SECRET)
    expect(r).toEqual({ ok: true, address: acct.address.toLowerCase() })
  })

  test("rejects a signature from a different key", async () => {
    const other = privateKeyToAccount("0x" + "22".repeat(32) as `0x${string}`)
    const { message } = await signed()
    const r = await verifySignIn({ message, signature: await other.signMessage({ message }), host: HOST }, SECRET)
    expect(r.ok).toBe(false)
  })

  test("rejects a message for another site", async () => {
    const r = await verifySignIn({ ...(await signed({ domain: "evil.test" })), host: HOST }, SECRET)
    expect(r.ok).toBe(false)
  })

  test("rejects a forged nonce", async () => {
    const r = await verifySignIn({ ...(await signed({ nonce: "deadbeefdeadbeef0123.abcdef012345abcdef012345" })), host: HOST }, SECRET)
    expect(r.ok).toBe(false)
  })

  test("rejects an expired sign-in", async () => {
    const past = Date.now() - 30 * 60 * 1000
    const r = await verifySignIn({ ...(await signed({}, past)), host: HOST }, SECRET)
    expect(r.ok).toBe(false)
  })

  test("rejects garbage", async () => {
    expect((await verifySignIn({ message: "hi", signature: "0x00", host: HOST }, SECRET)).ok).toBe(false)
  })
})

describe("session cookie", () => {
  const cookie = (v: string) => `a=b; ${SESSION_COOKIE}=${v}; c=d`

  test("round-trips the wallet", () => {
    const t = makeSessionToken(acct.address, SECRET)
    expect(walletFromCookies(cookie(t), SECRET)).toBe(acct.address.toLowerCase())
  })

  test("a tampered cookie proves nothing", () => {
    const t = makeSessionToken(acct.address, SECRET)
    const other = Buffer.from(JSON.stringify({ a: "0x" + "f".repeat(40), e: Date.now() + 1e6 })).toString("base64url")
    expect(walletFromCookies(cookie(`${other}.${t.split(".")[1]}`), SECRET)).toBeNull()
  })

  test("a cookie signed with another secret is rejected", () => {
    expect(walletFromCookies(cookie(makeSessionToken(acct.address, "another-secret-1234567")), SECRET)).toBeNull()
  })

  test("expired and missing cookies are rejected", () => {
    const t = makeSessionToken(acct.address, SECRET, Date.now() - 48 * 3600 * 1000)
    expect(walletFromCookies(cookie(t), SECRET)).toBeNull()
    expect(walletFromCookies(null, SECRET)).toBeNull()
    expect(walletFromCookies("a=b", SECRET)).toBeNull()
    expect(walletFromCookies(cookie(makeSessionToken(acct.address, SECRET)), null)).toBeNull()
  })
})

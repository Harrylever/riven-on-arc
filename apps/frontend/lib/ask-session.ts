// Server-only. Proves which wallet is asking, without a popup per question: the
// user signs one message, the server checks it and hands back a signed cookie.
// The wallet quota is only ever granted from that cookie, never from a request
// body, so a made-up address can't buy extra questions.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { verifyMessage } from "viem"
import { parseSignInMessage } from "./ask-session-message"

export const SESSION_COOKIE = "rv_wallet"
export const SESSION_TTL_S = 24 * 60 * 60
const NONCE_TTL_MS = 10 * 60 * 1000

/** Signing secret. Missing in production = wallet sign-in is switched off (everyone is anonymous). */
export function sessionSecret(): string | null {
  const s = process.env.ASK_SESSION_SECRET
  if (s && s.length >= 16) return s
  return process.env.NODE_ENV === "production" ? null : "riven-dev-only-session-secret"
}

const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64url")

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Stateless nonce: `<random>.<issuedMs>.<mac>`, checked by recomputing the mac. */
export function newNonce(secret: string, now = Date.now()): string {
  const body = `${randomBytes(8).toString("hex")}${now.toString(16)}`
  return `${body}.${mac(secret, `nonce|${body}`).replace(/[^0-9a-f]/gi, "").slice(0, 24).toLowerCase()}`
}

function nonceValid(secret: string, nonce: string, now: number): boolean {
  const [body, tag] = nonce.split(".")
  if (!body || !tag || body.length < 17) return false
  const want = mac(secret, `nonce|${body}`).replace(/[^0-9a-f]/gi, "").slice(0, 24).toLowerCase()
  if (!safeEqual(tag, want)) return false
  const issued = parseInt(body.slice(16), 16)
  return Number.isFinite(issued) && now - issued >= 0 && now - issued <= NONCE_TTL_MS
}

export type VerifyResult = { ok: true; address: string } | { ok: false; error: string }

/** Check a signed sign-in message and return the proven wallet. */
export async function verifySignIn(
  input: { message: string; signature: string; host: string },
  secret: string,
  now = Date.now(),
): Promise<VerifyResult> {
  const f = parseSignInMessage(input.message)
  if (!f) return { ok: false, error: "Unrecognised message" }
  if (f.domain !== input.host) return { ok: false, error: "Message is for a different site" }
  if (!nonceValid(secret, f.nonce, now)) return { ok: false, error: "Sign-in expired, try again" }
  const issued = Date.parse(f.issuedAt)
  if (!Number.isFinite(issued) || Math.abs(now - issued) > NONCE_TTL_MS) return { ok: false, error: "Sign-in expired, try again" }
  if (!/^0x[0-9a-fA-F]+$/.test(input.signature)) return { ok: false, error: "Bad signature" }
  let valid = false
  try {
    valid = await verifyMessage({
      address: f.address as `0x${string}`,
      message: input.message,
      signature: input.signature as `0x${string}`,
    })
  } catch {
    valid = false
  }
  return valid ? { ok: true, address: f.address.toLowerCase() } : { ok: false, error: "Signature doesn't match that wallet" }
}

/** `<base64url {a,e}>.<mac>` — the cookie value. */
export function makeSessionToken(address: string, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ a: address.toLowerCase(), e: now + SESSION_TTL_S * 1000 })).toString("base64url")
  return `${body}.${mac(secret, `session|${body}`)}`
}

/** The wallet a cookie header proves, or null (missing, forged or expired). */
export function walletFromCookies(cookieHeader: string | null, secret: string | null, now = Date.now()): string | null {
  if (!cookieHeader || !secret) return null
  const raw = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  if (!raw) return null
  const [body, tag] = raw.split(".")
  if (!body || !tag || !safeEqual(tag, mac(secret, `session|${body}`))) return null
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { a?: unknown; e?: unknown }
    if (typeof p.a !== "string" || !/^0x[0-9a-f]{40}$/.test(p.a)) return null
    if (typeof p.e !== "number" || p.e < now) return null
    return p.a
  } catch {
    return null
  }
}

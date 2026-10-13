import { NextResponse } from "next/server"
import { newNonce, makeSessionToken, sessionSecret, SESSION_COOKIE, SESSION_TTL_S, verifySignIn } from "@/lib/ask-session"
import { identify } from "@/lib/ask-identity"

export const dynamic = "force-dynamic"

const host = (req: Request) => req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host

/** GET → a fresh nonce to sign, plus the wallet this browser is already verified as. */
export async function GET(req: Request) {
  const secret = sessionSecret()
  return NextResponse.json({
    enabled: !!secret,
    wallet: identify(req).wallet,
    domain: host(req),
    nonce: secret ? newNonce(secret) : null,
    issuedAt: new Date().toISOString(),
  })
}

/** POST { message, signature } → verifies the wallet signature and sets the session cookie. */
export async function POST(req: Request) {
  const secret = sessionSecret()
  if (!secret) return NextResponse.json({ error: "Wallet sign-in isn't configured" }, { status: 503 })
  let body: { message?: unknown; signature?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (typeof body.message !== "string" || typeof body.signature !== "string" || body.message.length > 600)
    return NextResponse.json({ error: "message and signature are required" }, { status: 400 })
  const r = await verifySignIn({ message: body.message, signature: body.signature, host: host(req) }, secret)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 })
  const res = NextResponse.json({ wallet: r.address })
  res.cookies.set(SESSION_COOKIE, makeSessionToken(r.address, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_S,
  })
  return res
}

/** DELETE → sign out (the wallet was disconnected). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
  return res
}

// Server-only. Who is asking: the wallet proven by the signed cookie (if any)
// and a hash of the caller's IP.
import { hashIp, type Identity } from "./ask-quota"
import { sessionSecret, walletFromCookies } from "./ask-session"

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return fwd || req.headers.get("x-real-ip")?.trim() || "unknown"
}

export function identify(req: Request): Identity {
  const secret = sessionSecret()
  return {
    wallet: walletFromCookies(req.headers.get("cookie"), secret),
    ipHash: hashIp(clientIp(req), secret ?? "riven-ip-salt"),
  }
}

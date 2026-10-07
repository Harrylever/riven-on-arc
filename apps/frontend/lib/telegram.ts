import { randomBytes } from "node:crypto"
import { getDb } from "@clawdex/shared"

/** Bot username without "@"; Telegram alerts are hidden when unset. */
export const TELEGRAM_BOT = (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "").trim()

/** The browser's random id (from localStorage): 16–64 url-safe chars. */
export function validDeviceKey(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(v)
}

export function linkStatus(link: { linkCode: string; chatId: string | null; username: string | null } | null) {
  return {
    enabled: TELEGRAM_BOT.length > 0,
    linked: !!link?.chatId,
    username: link?.username ?? null,
    url: link && TELEGRAM_BOT ? `https://t.me/${TELEGRAM_BOT}?start=${link.linkCode}` : null,
  }
}

/** Find this browser's link row, creating it (with a fresh one-time code) if needed. */
export async function ensureLink(deviceKey: string) {
  const db = getDb()
  const found = await db.telegramLink.findUnique({ where: { deviceKey } })
  if (found) return found
  return db.telegramLink.create({
    data: { deviceKey, linkCode: randomBytes(12).toString("base64url") },
  })
}

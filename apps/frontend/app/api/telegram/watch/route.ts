import { getDb } from "@riven/shared"
import { NextResponse } from "next/server"
import { TELEGRAM_BOT, ensureLink, validDeviceKey } from "@/lib/telegram"

export const dynamic = "force-dynamic"

const MAX = 200

/**
 * PUT { deviceKey, tokens: ["0x…"], perps: ["BTC" | "*"] } — replaces what this
 * browser's Telegram chat is pinged about (its starred tokens + tracked pairs).
 */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    deviceKey?: unknown
    tokens?: unknown
    perps?: unknown
  } | null
  if (!validDeviceKey(body?.deviceKey)) return NextResponse.json({ error: "bad deviceKey" }, { status: 400 })
  if (!TELEGRAM_BOT) return NextResponse.json({ ok: false, enabled: false })
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
  const tokens = [...new Set(list(body.tokens).map((t) => t.toLowerCase()))].filter((t) => /^0x[0-9a-f]{40}$/.test(t))
  const perps = [...new Set(list(body.perps).map((p) => p.toUpperCase()))].filter((p) => p === "*" || /^[A-Z0-9]{1,20}$/.test(p))
  if (tokens.length + perps.length > MAX) return NextResponse.json({ error: "too many" }, { status: 400 })
  try {
    const db = getDb()
    const link = await ensureLink(body.deviceKey)
    await db.$transaction([
      db.telegramWatch.deleteMany({ where: { linkId: link.id } }),
      db.telegramWatch.createMany({
        data: [
          ...tokens.map((target) => ({ linkId: link.id, kind: "token", target })),
          ...perps.map((target) => ({ linkId: link.id, kind: "perp", target })),
        ],
      }),
    ])
    return NextResponse.json({ ok: true, tokens: tokens.length, perps: perps.length })
  } catch (err) {
    console.error(`[telegram] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

import { getDb } from "@clawdex/shared"
import { NextResponse } from "next/server"
import { TELEGRAM_BOT, ensureLink, linkStatus, validDeviceKey } from "@/lib/telegram"

export const dynamic = "force-dynamic"

/** GET ?deviceKey= → is this browser linked to a Telegram chat? */
export async function GET(req: Request) {
  const deviceKey = new URL(req.url).searchParams.get("deviceKey")
  if (!validDeviceKey(deviceKey)) return NextResponse.json({ error: "bad deviceKey" }, { status: 400 })
  if (!TELEGRAM_BOT) return NextResponse.json(linkStatus(null))
  try {
    const link = await getDb().telegramLink.findUnique({ where: { deviceKey } })
    return NextResponse.json(linkStatus(link))
  } catch (err) {
    console.error(`[telegram] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

/** POST { deviceKey } → a t.me deep link; pressing Start in Telegram links the chat. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { deviceKey?: unknown } | null
  if (!validDeviceKey(body?.deviceKey)) return NextResponse.json({ error: "bad deviceKey" }, { status: 400 })
  if (!TELEGRAM_BOT) return NextResponse.json(linkStatus(null))
  try {
    return NextResponse.json(linkStatus(await ensureLink(body.deviceKey)))
  } catch (err) {
    console.error(`[telegram] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

/** DELETE { deviceKey } → stop messaging this browser's chat. */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { deviceKey?: unknown } | null
  if (!validDeviceKey(body?.deviceKey)) return NextResponse.json({ error: "bad deviceKey" }, { status: 400 })
  try {
    await getDb().telegramLink.updateMany({ where: { deviceKey: body.deviceKey }, data: { chatId: null, linkedAt: null } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[telegram] ${(err as Error).message}`)
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}

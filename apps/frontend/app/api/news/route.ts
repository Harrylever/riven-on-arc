import { NextResponse } from "next/server"
import { getNews } from "@/lib/news"

export const dynamic = "force-dynamic"

/** GET /api/news?coin=SOL&limit=20 — crypto headlines, coin-tagged, newest first. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const coin = sp.get("coin")?.toUpperCase().replace(/[^A-Z0-9]/g, "") || undefined
  const limit = Math.min(60, Math.max(1, Number(sp.get("limit")) || 24))
  const news = await getNews({ coin, limit }).catch(() => [])
  return NextResponse.json({ news })
}

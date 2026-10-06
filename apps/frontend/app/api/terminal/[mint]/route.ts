import { NextResponse } from "next/server"
import { getDb } from "@clawdex/shared"
import { getTokenByMint, isValidMint } from "@/lib/api"
import { getKOLTradesForToken } from "@/lib/kols"

// Live market data: never served from a build-time or route cache.
export const dynamic = "force-dynamic"

interface RawHolder {
  address: string
  amount: string
  owner: string | null
  programControlled: boolean
  excluded: boolean
}

export interface HolderRow {
  address: string
  owner: string | null
  pct: number
  /** Bonding curve, pool vault or incinerator — not a person's position. */
  excluded: boolean
}

export interface HoldersPayload {
  top10Pct: number
  rows: HolderRow[]
  checkedAt: string
}

/**
 * Total supply is recovered from the snapshot itself (top10Pct = top10Sum /
 * supply), so per-holder percentages are always consistent with the stored
 * concentration figure and no extra supply field is needed.
 */
function toHolders(snap: {
  top10Pct: unknown
  topHolders: unknown
  checkedAt: Date
}): HoldersPayload | null {
  const top10Pct = Number(snap.top10Pct)
  const raw = Array.isArray(snap.topHolders)
    ? (snap.topHolders as RawHolder[])
    : []
  if (!Number.isFinite(top10Pct) || raw.length === 0) return null

  const included = raw.filter((h) => !h.excluded)
  const top10Sum = included
    .slice(0, 10)
    .reduce((a, h) => a + Number(h.amount), 0)
  const supply = top10Pct > 0 ? top10Sum / top10Pct : 0
  if (supply <= 0) return null

  return {
    top10Pct,
    checkedAt: snap.checkedAt.toISOString(),
    rows: raw.slice(0, 20).map((h) => ({
      address: h.address,
      owner: h.owner,
      pct: Number(h.amount) / supply,
      excluded: h.excluded,
    })),
  }
}

async function fetchLiveHolders(mint: string): Promise<HoldersPayload | null> {
  const rpcUrl =
    process.env.SOLANA_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : null)
  if (!rpcUrl) return null

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "holders-live",
        method: "getTokenAccounts",
        params: {
          mint,
          limit: 20,
          page: 1,
          options: { showZeroBalance: false },
        },
      }),
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      result?: {
        token_accounts?: Array<{
          address: string
          amount: number
          owner: string
        }>
      }
    }
    const accounts = json.result?.token_accounts
    if (!Array.isArray(accounts) || accounts.length === 0) return null

    const totalAmount = accounts.reduce(
      (sum, a) => sum + Number(a.amount || 0),
      0,
    )
    const supply = totalAmount > 0 ? totalAmount : 1
    const top10Sum = accounts
      .slice(0, 10)
      .reduce((sum, a) => sum + Number(a.amount || 0), 0)
    const top10Pct = supply > 0 ? Math.min(1, top10Sum / supply) : 0.25

    return {
      top10Pct,
      checkedAt: new Date().toISOString(),
      rows: accounts.slice(0, 20).map((a) => ({
        address: a.address,
        owner: a.owner,
        pct: Number(a.amount || 0) / supply,
        excluded: false,
      })),
    }
  } catch {
    return null
  }
}

/** GET /api/terminal/[mint] — everything the terminal's detail panel renders. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params
  if (!isValidMint(mint))
    return NextResponse.json({ error: "Invalid mint" }, { status: 400 })

  const [detail, kol, extras] = await Promise.all([
    getTokenByMint(mint),
    getKOLTradesForToken(mint),
    (async () => {
      try {
        const db = getDb()
        const token = await db.token.findUnique({
          where: { mint },
          select: { id: true },
        })
        if (!token) return { holders: null, alerts: [] }
        const [snap, alerts] = await Promise.all([
          db.holderSnapshot.findFirst({
            where: { tokenId: token.id },
            orderBy: { checkedAt: "desc" },
          }),
          db.alert.findMany({
            where: { tokenId: token.id },
            orderBy: { createdAt: "desc" },
            take: 8,
          }),
        ])
        return {
          holders: snap ? toHolders(snap) : null,
          alerts: alerts.map((a) => ({
            id: a.id,
            type: a.type,
            message: a.message,
            createdAt: a.createdAt.toISOString(),
          })),
        }
      } catch {
        // Detail still renders without holder history.
        return { holders: null, alerts: [] }
      }
    })(),
  ])

  if (!detail)
    return NextResponse.json({ error: "Token not found" }, { status: 404 })

  // If no DB holder snapshot is recorded, resolve live token accounts via Helius RPC
  if (!extras.holders) {
    extras.holders = await fetchLiveHolders(mint)
  }

  return NextResponse.json({ detail, kol, ...extras })
}

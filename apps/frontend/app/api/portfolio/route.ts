import { NextResponse } from "next/server"
import { getDb } from "@clawdex/shared"
import { rpcCall } from "@clawdex/shared/chain"
import { privyConfigured, verifyPrivyRequest } from "@/lib/privy-server"
import { getSolanaPairsBatch } from "@/lib/dexscreener"

// The classic SPL Token program and Token-2022 — a held token can live under
// either, so both are queried and merged.
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

const rpcUrl =
  process.env.SOLANA_RPC_URL ||
  (process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : null)

export interface PortfolioHolding {
  mint: string
  uiAmount: number
  symbol: string
  name: string
  imageUri: string | null
  priceUsd: number | null
  valueUsd: number | null
  marketCapUsd: number | null
  liquidityUsd: number | null
  priceChange24h: number | null
}

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string
          tokenAmount: { uiAmount: number | null }
        }
      }
    }
  }
}

/** Actual on-chain SPL balances for a wallet — what the holder owns right
 * now, not a list anyone chose to bookmark. */
async function getOwnedMints(owner: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>()
  if (!rpcUrl) return balances

  await Promise.all(
    [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map(async (programId) => {
      const accounts = await rpcCall<ParsedTokenAccount[]>(
        rpcUrl!,
        "getTokenAccountsByOwner",
        [owner, { programId }, { encoding: "jsonParsed" }],
      )
      for (const a of accounts ?? []) {
        const info = a.account?.data?.parsed?.info
        const amount = info?.tokenAmount?.uiAmount
        if (info?.mint && amount && amount > 0) {
          balances.set(info.mint, (balances.get(info.mint) ?? 0) + amount)
        }
      }
    }),
  )
  return balances
}

/**
 * GET /api/portfolio — SPL tokens the signed-in user's linked wallet actually
 * holds on chain (read live from Solana), not the browser-local watchlist.
 * Requires a wallet address saved during onboarding ("where do you trade").
 */
export async function GET(req: Request) {
  if (!privyConfigured())
    return NextResponse.json(
      { error: "Sign-in is not configured on this deployment" },
      { status: 503 },
    )
  const user = await verifyPrivyRequest(req)
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = await getDb().userProfile.findUnique({
    where: { privyUserId: user.userId },
  })
  const wallet = profile?.walletAddress
  if (!wallet) return NextResponse.json({ wallet: null, holdings: [] })

  if (!rpcUrl) {
    return NextResponse.json(
      { error: "No Solana RPC configured" },
      { status: 503 },
    )
  }

  const balances = await getOwnedMints(wallet)
  const mints = [...balances.keys()]
  const pairs = await getSolanaPairsBatch(mints)

  const holdings: PortfolioHolding[] = mints.map((mint) => {
    const pair = pairs.get(mint)
    const uiAmount = balances.get(mint) ?? 0
    const priceUsd = pair?.priceUsd ? Number(pair.priceUsd) : null
    return {
      mint,
      uiAmount,
      symbol: pair?.baseToken.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`,
      name: pair?.baseToken.name ?? "Unknown token",
      imageUri: pair?.info?.imageUrl ?? null,
      priceUsd,
      valueUsd: priceUsd != null ? priceUsd * uiAmount : null,
      marketCapUsd: pair?.marketCap ?? null,
      liquidityUsd: pair?.liquidity?.usd ?? null,
      priceChange24h: pair?.priceChange?.h24 ?? null,
    }
  })

  holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))

  return NextResponse.json({ wallet, holdings })
}

import type { MadeOnSolTrade } from "./kols"

// Derived views over the MadeOnSol KOL feed. Everything here is computed from
// real trades; nothing is estimated. MadeOnSol does not provide realised PnL, so
// the leaderboard ranks by the win rates MadeOnSol reports and shows only the
// volume actually seen in the feed.

export interface KolRow {
  wallet: string
  name: string
  winrate7d: number | null
  winrate30d: number | null
  trades: number
  buySol: number
  sellSol: number
  lastTradeAt: string
}

export function buildKolLeaderboard(trades: MadeOnSolTrade[]): KolRow[] {
  const byWallet = new Map<string, KolRow>()
  for (const t of trades) {
    const row =
      byWallet.get(t.wallet_address) ??
      ({
        wallet: t.wallet_address,
        name:
          t.kol_name ??
          `${t.wallet_address.slice(0, 4)}…${t.wallet_address.slice(-4)}`,
        winrate7d: null,
        winrate30d: null,
        trades: 0,
        buySol: 0,
        sellSol: 0,
        lastTradeAt: t.traded_at,
      } satisfies KolRow)
    row.trades += 1
    if (t.action === "buy") row.buySol += t.sol_amount
    else row.sellSol += t.sol_amount
    if (typeof t.kol_winrate_7d === "number") row.winrate7d = t.kol_winrate_7d
    if (typeof t.kol_winrate_30d === "number")
      row.winrate30d = t.kol_winrate_30d
    if (new Date(t.traded_at) > new Date(row.lastTradeAt))
      row.lastTradeAt = t.traded_at
    byWallet.set(t.wallet_address, row)
  }
  return [...byWallet.values()].sort(
    (a, b) => (b.winrate7d ?? -1) - (a.winrate7d ?? -1) || b.trades - a.trades,
  )
}

export interface Coordination {
  mint: string
  symbol: string
  kols: string[]
  totalSol: number
  latestAt: string
}

/** Tokens bought by at least `minKols` distinct KOL wallets within `windowMs` (default 1 hour). */
export function findCoordination(
  trades: MadeOnSolTrade[],
  minKols = 3,
  windowMs = 60 * 60 * 1000,
  now = Date.now(),
): Coordination[] {
  const byMint = new Map<string, MadeOnSolTrade[]>()
  for (const t of trades) {
    if (t.action !== "buy") continue
    if (now - new Date(t.traded_at).getTime() > windowMs) continue
    byMint.set(t.token_mint, [...(byMint.get(t.token_mint) ?? []), t])
  }

  const out: Coordination[] = []
  for (const [mint, buys] of byMint) {
    const wallets = new Map<string, string>()
    for (const b of buys)
      wallets.set(
        b.wallet_address,
        b.kol_name ?? `${b.wallet_address.slice(0, 4)}…`,
      )
    if (wallets.size < minKols) continue
    out.push({
      mint,
      symbol: buys[0].token_symbol ?? `${mint.slice(0, 4)}…`,
      kols: [...wallets.values()],
      totalSol: buys.reduce((a, b) => a + b.sol_amount, 0),
      latestAt: buys
        .map((b) => b.traded_at)
        .sort()
        .at(-1) as string,
    })
  }
  return out.sort(
    (a, b) => b.kols.length - a.kols.length || b.totalSol - a.totalSol,
  )
}

/**
 * KOL provider interface, per docs/BLUEPRINT.md section 10. Keeps MadeOnSol
 * vs. Solana Tracker (open decision #5 in AGENTS.md) swappable via env var
 * rather than hardcoded — this genuinely isn't settled yet.
 */
export interface KolTradeEvent {
  signature: string;
  kolWallet: string;
  kolName?: string;
  tokenMint: string;
  side: "buy" | "sell";
  solAmount: number;
  marketCapUsdAtTrade?: number;
  tradedAt: Date;
  source: "MADEONSOL" | "SOLANA_TRACKER" | "MOCK";
}

export interface KolProvider {
  readonly name: string;
  fetchRecentTrades(params: { limit?: number }): Promise<KolTradeEvent[]>;
}

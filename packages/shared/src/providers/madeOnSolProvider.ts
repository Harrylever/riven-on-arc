import { KolProvider, KolTradeEvent } from "./kolProvider.js";

/**
 * Verified 2026-09-20 against madeonsol.com/api-docs. Base URL, auth scheme,
 * and response shape below are from the real docs, not guessed — unlike
 * some of this repo's webhook-payload parsing elsewhere.
 *
 * Free tier: ~200 req/day, feed delayed ~5 min. WebSocket streaming
 * (wss://madeonsol.com/ws/v1/stream, channel kol:trades) is PRO-tier only —
 * not available here, hence REST polling in KolPollService, not a stream.
 */
export class MadeOnSolProvider implements KolProvider {
  readonly name = "MADEONSOL";
  private readonly baseUrl = "https://madeonsol.com/api/v1";

  constructor(private readonly apiKey: string) {}

  async fetchRecentTrades({ limit = 50 }: { limit?: number }): Promise<KolTradeEvent[]> {
    const url = new URL(`${this.baseUrl}/kol/feed`);
    url.searchParams.set("limit", String(Math.min(limit, 100)));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`MadeOnSol /kol/feed failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as {
      trades: Array<{
        wallet_address: string;
        kol_name?: string;
        token_mint: string;
        action: "buy" | "sell";
        sol_amount: number;
        market_cap_usd_at_trade?: number;
        traded_at: string;
      }>;
    };

    return json.trades.map((t) => ({
      signature: `madeonsol-${t.wallet_address}-${t.token_mint}-${t.traded_at}`, // MadeOnSol doesn't return a tx signature — see AGENTS.md note
      kolWallet: t.wallet_address,
      kolName: t.kol_name,
      tokenMint: t.token_mint,
      side: t.action,
      solAmount: t.sol_amount,
      marketCapUsdAtTrade: t.market_cap_usd_at_trade,
      tradedAt: new Date(t.traded_at),
      source: "MADEONSOL",
    }));
  }
}

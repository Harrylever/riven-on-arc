import { KolProvider, KolTradeEvent } from "./kolProvider.js";

/**
 * Base URL, auth header, and the `/trades/kols` path are verified against
 * docs.solanatracker.io/guides/kol-tracking (2026-09-20). The exact response
 * field names below are a best-effort guess at a reasonable shape — the
 * docs page didn't surface a full example response for this specific
 * endpoint. Validate against a real response before trusting this in
 * production; fix the mapping in `fetchRecentTrades` if the fields differ.
 *
 * Free tier: 2,500 requests/month. Fallback only — MadeOnSol is primary
 * per the final spec (see AGENTS.md open decision #5, still unresolved).
 */
export class SolanaTrackerProvider implements KolProvider {
  readonly name = "SOLANA_TRACKER";
  private readonly baseUrl = "https://data.solanatracker.io";

  constructor(private readonly apiKey: string) {}

  async fetchRecentTrades({ limit = 50 }: { limit?: number }): Promise<KolTradeEvent[]> {
    const url = new URL(`${this.baseUrl}/trades/kols`);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`Solana Tracker /trades/kols failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as {
      trades?: Array<{
        signature?: string;
        wallet?: string;
        name?: string;
        mint?: string;
        type?: "buy" | "sell";
        amount?: number;
        time?: number;
      }>;
    };

    return (json.trades ?? [])
      .filter((t) => t.signature && t.wallet && t.mint && t.type && t.amount != null && t.time)
      .map((t) => ({
        signature: t.signature!,
        kolWallet: t.wallet!,
        kolName: t.name,
        tokenMint: t.mint!,
        side: t.type!,
        solAmount: t.amount!,
        tradedAt: new Date(t.time! * 1000),
        source: "SOLANA_TRACKER" as const,
      }));
  }
}

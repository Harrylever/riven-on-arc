import { KolProvider, KolTradeEvent } from "./kolProvider.js";

/** For USE_MOCK_DATA=true (docs/BLUEPRINT.md's convention) — lets the frontend/backend run without a real KOL API key. */
export class MockKolProvider implements KolProvider {
  readonly name = "MOCK";

  async fetchRecentTrades({ limit = 5 }: { limit?: number }): Promise<KolTradeEvent[]> {
    const now = Date.now();
    return Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      signature: `mock-signature-${i}`,
      kolWallet: `MockKolWallet${i}111111111111111111111111`,
      kolName: `MockKOL${i}`,
      tokenMint: `MockTokenMint${i}1111111111111111111111`,
      side: i % 2 === 0 ? "buy" : "sell",
      solAmount: 1 + i,
      marketCapUsdAtTrade: 25000 + i * 1000,
      tradedAt: new Date(now - i * 60_000),
      source: "MOCK" as const,
    }));
  }
}

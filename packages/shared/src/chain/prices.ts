/**
 * Fetches the current SOL/USD price from CoinGecko with DexScreener fallback and 60s memory caching.
 */
let cachedSolPrice: { price: number; timestamp: number } | null = null;

export async function getSolPriceUsd(): Promise<number | null> {
  const now = Date.now();
  if (cachedSolPrice && now - cachedSolPrice.timestamp < 60_000) {
    return cachedSolPrice.price;
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { headers: { Accept: "application/json" } },
    );
    if (res.ok) {
      const json = (await res.json()) as { solana?: { usd?: number } };
      const usd = json.solana?.usd;
      if (typeof usd === "number" && usd > 0) {
        cachedSolPrice = { price: usd, timestamp: now };
        return usd;
      }
    }
  } catch {
    // Primary fetch failed, try DexScreener fallback
  }

  try {
    const dsRes = await fetch(
      "https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112",
      { headers: { Accept: "application/json" } },
    );
    if (dsRes.ok) {
      const dsJson = (await dsRes.json()) as { pairs?: Array<{ priceUsd?: string }> };
      const price = Number(dsJson?.pairs?.[0]?.priceUsd);
      if (price > 0) {
        cachedSolPrice = { price, timestamp: now };
        return price;
      }
    }
  } catch {
    // Both failed
  }

  return cachedSolPrice?.price ?? null;
}

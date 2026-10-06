import { withRetry } from "./withRetry.js";

/** Helius's DAS `getAsset` method — stable, documented, works for any SPL token/NFT mint. */
export interface HeliusAsset {
  id: string;
  content?: { metadata?: { name?: string; symbol?: string } };
  token_info?: { supply?: number; decimals?: number };
  authorities?: Array<{ address: string; scopes: string[] }>;
  creators?: Array<{ address: string; verified: boolean; share: number }>;
}

/**
 * Retries transient failures (withRetry) — this is called on-demand from a
 * live user request (GET /api/token/[mint]'s CA-search fallback), so a
 * couple hundred ms of retry delay on a real blip beats immediately
 * 404ing a valid token.
 */
export async function getAssetByMint(
  mint: string,
  rpcUrl: string,
): Promise<HeliusAsset | null> {
  return withRetry(async () => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "resolve-token",
        method: "getAsset",
        params: { id: mint },
      }),
    });

    if (!res.ok) {
      throw new Error(`Helius getAsset failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as { result?: HeliusAsset; error?: unknown };
    if (json.error || !json.result) return null;
    return json.result;
  });
}

const HOLDER_PAGE_SIZE = 1000;
/** 20 pages = 20k holders. Beyond that the count is reported as a floor, which
 * is far better than the silent 1000 cap the single-page version produced. */
const HOLDER_MAX_PAGES = 20;

/**
 * Number of accounts holding a non-zero balance of this mint, via Helius's DAS
 * `getTokenAccounts`.
 *
 * The response's `total` is the size of the page just returned, NOT the number
 * of holders — verified against a large mint, where page 1 and page 2 both
 * report 1000. Reading it as a grand total capped every popular token at 1000,
 * so pages are walked until one comes back short.
 *
 * Returns null when the method is unavailable (a non-Helius RPC) so callers
 * leave the field unset rather than storing a wrong number.
 */
export async function getHolderCount(mint: string, rpcUrl: string): Promise<number | null> {
  let count = 0;

  for (let page = 1; page <= HOLDER_MAX_PAGES; page++) {
    const pageCount = await withRetry(async () => {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "holder-count",
          method: "getTokenAccounts",
          params: { mint, limit: HOLDER_PAGE_SIZE, page, options: { showZeroBalance: false } },
        }),
      });
      if (!res.ok) throw new Error(`getTokenAccounts failed: ${res.status}`);
      const json = (await res.json()) as {
        result?: { token_accounts?: unknown[] };
        error?: { message: string };
      };
      if (json.error) return null;
      return json.result?.token_accounts?.length ?? 0;
    });

    // Method unavailable on this RPC — report unknown rather than a partial count.
    if (pageCount === null) return page === 1 ? null : count;

    count += pageCount;
    if (pageCount < HOLDER_PAGE_SIZE) break;
  }

  return count;
}

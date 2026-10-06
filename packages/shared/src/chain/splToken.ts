/**
 * Standard Solana JSON-RPC calls against the SPL Token program — not
 * Helius-specific, works against any RPC endpoint (including Helius's).
 * Higher confidence than the enhanced-webhook parsing elsewhere in this
 * package: these are well-documented, stable RPC methods with a fixed
 * jsonParsed response shape.
 *
 * Every call here goes through rpcCall(), which retries transient failures
 * (withRetry) before giving up — every exported function below benefits
 * automatically, no per-call-site wrapping needed. Callers (the *-checker
 * services in apps/backend) still wrap their per-token work in try/catch to
 * skip just that token for the current cycle if it fails even after retries.
 */

import { withRetry } from "./withRetry.js";

export interface ParsedMintInfo {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supply: string;
  decimals: number;
}

interface RpcResponse<T> {
  result?: { value: T | null };
  error?: { message: string };
}

export async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T | null> {
  return withRetry(async () => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    });
    if (!res.ok) {
      throw new Error(`RPC ${method} failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as RpcResponse<T>;
    if (json.error) throw new Error(`RPC ${method} error: ${json.error.message}`);
    return json.result?.value ?? null;
  });
}

/** getAccountInfo(mint, {encoding: "jsonParsed"}) — reads mint/freeze authority directly. null authority means revoked. */
export async function getParsedMint(mint: string, rpcUrl: string): Promise<ParsedMintInfo | null> {
  const value = await rpcCall<{
    data?: { parsed?: { info?: { mintAuthority: string | null; freezeAuthority: string | null; supply: string; decimals: number } } };
  }>(rpcUrl, "getAccountInfo", [mint, { encoding: "jsonParsed" }]);

  const info = value?.data?.parsed?.info;
  if (!info) return null;

  return {
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    supply: info.supply,
    decimals: info.decimals,
  };
}

export interface LargestAccount {
  address: string;
  amount: string;
}

/** getTokenLargestAccounts — returns up to the top 20 holder accounts by balance, largest first. */
export async function getTokenLargestAccounts(mint: string, rpcUrl: string): Promise<LargestAccount[]> {
  const value = await rpcCall<Array<{ address: string; amount: string }>>(
    rpcUrl,
    "getTokenLargestAccounts",
    [mint],
  );
  return value ?? [];
}

/** getTokenSupply — current circulating supply, accounting for burns since launch (unlike Token.initialSupply). */
export async function getTokenSupply(mint: string, rpcUrl: string): Promise<string | null> {
  const value = await rpcCall<{ amount: string }>(rpcUrl, "getTokenSupply", [mint]);
  return value?.amount ?? null;
}

/** getBalance — native SOL balance in lamports for any account. Standard, no account-layout parsing needed. */
export async function getSolBalance(address: string, rpcUrl: string): Promise<number | null> {
  const value = await rpcCall<number>(rpcUrl, "getBalance", [address]);
  return value;
}

/** The well-known Solana "incinerator" address — a transfer here removes tokens from circulation in
 * practice, even though it's technically a transfer, not an SPL Token Burn instruction (the tokens
 * still count toward on-chain supply, but nobody controls this address). Verified 2026-09-20. */
export const INCINERATOR_ADDRESS = "1nc1nerator11111111111111111111111111111111";

export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

export interface ClassifiedHolder {
  address: string;
  amount: string;
  owner: string | null;
  programOwner?: string | null;
  /** True when the owner is program-controlled (a PDA such as a bonding curve or pool vault), not a person's wallet. */
  programControlled: boolean;
}

/**
 * Resolves who owns each token account and whether that owner is a program-
 * controlled account. getTokenLargestAccounts returns token ACCOUNTS, so a
 * pump.fun bonding curve or an AMM vault shows up as a giant "holder"; counting
 * it as concentration penalises every legitimate token. Owners that are
 * nonexistent accounts are treated as wallets (conservative: never excludes a
 * possible real holder).
 */
export async function classifyHolders(
  accounts: LargestAccount[],
  rpcUrl: string,
): Promise<ClassifiedHolder[]> {
  if (accounts.length === 0) return [];

  const tokenAccounts = await rpcCall<Array<{ data?: { parsed?: { info?: { owner?: string } } } } | null>>(
    rpcUrl,
    "getMultipleAccounts",
    [accounts.map((a) => a.address), { encoding: "jsonParsed" }],
  );

  const owners = accounts.map((_, i) => tokenAccounts?.[i]?.data?.parsed?.info?.owner ?? null);
  const uniqueOwners = [...new Set(owners.filter((o): o is string => !!o))];

  const ownerAccounts = uniqueOwners.length
    ? await rpcCall<Array<{ owner?: string } | null>>(rpcUrl, "getMultipleAccounts", [
        uniqueOwners,
        { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
      ])
    : [];
  const programOf = new Map<string, string | null>(
    uniqueOwners.map((o, i) => [o, ownerAccounts?.[i]?.owner ?? null]),
  );

  return accounts.map((a, i) => {
    const owner = owners[i];
    const program = owner ? programOf.get(owner) ?? null : null;
    return {
      address: a.address,
      amount: a.amount,
      owner,
      programOwner: program,
      programControlled: program !== null && program !== SYSTEM_PROGRAM_ID,
    };
  });
}

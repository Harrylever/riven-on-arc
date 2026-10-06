/**
 * Read-only lookup against pump.fun's public coin API. Used to find a token's
 * bonding curve address and reserves (pump.fun and ClawPump launches settle on
 * pump.fun's curve). Returns null on any failure: callers must treat that as
 * "unknown", never as zero. This endpoint is unofficial and may be rate limited
 * or challenged in production.
 */
import { rpcCall } from "./splToken.js";
import { base58Encode } from "./pda.js";

export interface PumpCoin {
  mint: string;
  bondingCurve: string;
  creator: string | null;
  /** Market cap in SOL. */
  marketCapSol: number;
  /** Real SOL held by the curve, in SOL (not lamports). */
  realSolReserves: number;
  totalSupplyRaw: string;
  complete: boolean;
  createdAtMs: number | null;
  imageUri: string | null;
}

export async function getPumpCoin(mint: string): Promise<PumpCoin | null> {
  try {
    // The unofficial API rate-limits (429) under bursts: back off and retry.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
        headers: { accept: "application/json" },
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!res || !res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    if (typeof j.bonding_curve !== "string") return null;
    return {
      mint,
      bondingCurve: j.bonding_curve,
      creator: typeof j.creator === "string" ? j.creator : null,
      marketCapSol: Number(j.market_cap ?? 0),
      realSolReserves: Number(j.real_sol_reserves ?? 0) / 1e9,
      totalSupplyRaw: String(j.total_supply ?? "0"),
      complete: Boolean(j.complete),
      createdAtMs: typeof j.created_timestamp === "number" ? j.created_timestamp : null,
      imageUri: typeof j.image_uri === "string" ? j.image_uri : null,
    };
  } catch {
    return null;
  }
}

/** Real token reserves a fresh pump.fun curve starts with (793.1M at 6 decimals),
 * confirmed against a freshly launched coin's own API response. Graduation is
 * reached as these are sold down to zero, so it is the denominator for progress. */
export const PUMP_INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000;

export interface CurveState {
  /** Creator wallet stored in the curve account (newer pump.fun layout), when present. */
  creator: string | null;
  marketCapSol: number;
  realSolReserves: number;
  realTokenReserves: number;
  /** 0-1 share of the curve's tokens sold; 1 means it has graduated. */
  progress: number;
  complete: boolean;
}

/**
 * Reads pump.fun bonding-curve state straight from chain (one batched
 * getMultipleAccounts call per 100 curves), so scoring does not depend on the
 * rate-limited HTTP API. Account layout (Anchor): 8-byte discriminator, then
 * little-endian u64 virtual_token_reserves, virtual_sol_reserves,
 * real_token_reserves, real_sol_reserves, token_total_supply, then bool complete.
 * Pump tokens have 6 decimals; SOL has 9. Verified 2026-09-21 against
 * frontend-api-v3.pump.fun for a live token.
 */
export async function readBondingCurves(
  addresses: string[],
  rpcUrl: string,
): Promise<Map<string, CurveState>> {
  const out = new Map<string, CurveState>();
  for (let i = 0; i < addresses.length; i += 100) {
    const chunk = addresses.slice(i, i + 100);
    const accounts = await rpcCall<Array<{ data?: [string, string] } | null>>(
      rpcUrl,
      "getMultipleAccounts",
      [chunk, { encoding: "base64" }],
    );
    chunk.forEach((addr, idx) => {
      const b64 = accounts?.[idx]?.data?.[0];
      if (!b64) return;
      const buf = Buffer.from(b64, "base64");
      if (buf.length < 49) return;
      const vToken = buf.readBigUInt64LE(8);
      const vSol = buf.readBigUInt64LE(16);
      const realToken = buf.readBigUInt64LE(24);
      const realSol = buf.readBigUInt64LE(32);
      const totalSupply = buf.readBigUInt64LE(40);
      if (vToken === 0n) return;
      const pricePerToken = Number(vSol) / 1e9 / (Number(vToken) / 1e6);
      const complete = buf[48] === 1;
      out.set(addr, {
        creator: buf.length >= 81 ? base58Encode(new Uint8Array(buf.subarray(49, 81))) : null,
        marketCapSol: pricePerToken * (Number(totalSupply) / 1e6),
        realSolReserves: Number(realSol) / 1e9,
        realTokenReserves: Number(realToken) / 1e6,
        progress: complete
          ? 1
          : Math.min(1, Math.max(0, 1 - Number(realToken) / PUMP_INITIAL_REAL_TOKEN_RESERVES)),
        complete,
      });
    });
  }
  return out;
}

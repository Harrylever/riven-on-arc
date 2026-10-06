/**
 * Verified 2026-09-20 via public sources (Solscan, Helius docs, Raydium docs).
 *
 * ClawPump is deliberately NOT listed here: it is not a separate on-chain
 * program. It launches tokens through pump.fun's own program, with ClawPump
 * creating/controlling a per-launch creator wallet rather than using one
 * shared address. There is no single program ID or sponsor wallet to filter
 * on-chain for ClawPump specifically — detection goes through their public
 * API poller instead (see apps/backend/src/launch-detection/clawpump-poller.service.ts).
 */
export const PROGRAM_IDS = {
  PUMP_FUN: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  PUMP_SWAP: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  RAYDIUM_LAUNCHLAB: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
} as const;

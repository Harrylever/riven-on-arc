import { KolProvider } from "./kolProvider.js";
import { MadeOnSolProvider } from "./madeOnSolProvider.js";
import { SolanaTrackerProvider } from "./solanaTrackerProvider.js";
import { MockKolProvider } from "./mockKolProvider.js";

/**
 * Picks the KOL provider from env, keeping the still-open MadeOnSol vs.
 * Solana Tracker decision (AGENTS.md open decision #5) a config choice, not
 * a code choice. Precedence: explicit KOL_PROVIDER override > USE_MOCK_DATA
 * > whichever API key is actually set > mock (so it never hard-fails with
 * no config at all).
 */
export function createKolProvider(env: NodeJS.ProcessEnv = process.env): KolProvider {
  const forced = env.KOL_PROVIDER?.toLowerCase();
  if (forced === "madeonsol" && env.MADEONSOL_API_KEY) {
    return new MadeOnSolProvider(env.MADEONSOL_API_KEY);
  }
  if (forced === "solana_tracker" && env.SOLANA_TRACKER_API_KEY) {
    return new SolanaTrackerProvider(env.SOLANA_TRACKER_API_KEY);
  }
  if (forced === "mock") {
    return new MockKolProvider();
  }

  if (env.USE_MOCK_DATA === "true") return new MockKolProvider();
  if (env.MADEONSOL_API_KEY) return new MadeOnSolProvider(env.MADEONSOL_API_KEY);
  if (env.SOLANA_TRACKER_API_KEY) return new SolanaTrackerProvider(env.SOLANA_TRACKER_API_KEY);

  return new MockKolProvider();
}

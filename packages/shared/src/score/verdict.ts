// One definition of "what is this token's verdict": the 1-10 score, its band, and whether it is
// flagged. The scorer and the market sync write it to token_score_latest (so lists like Safest and
// Flagged are indexed lookups), and the website derives the same answer for the rows it shows.
// It used to live in the frontend only, which is why lists had to load thousands of score runs.
import { FAKE_FLAG_CODES, arcBand, impersonates, isWash, ARC_METHODOLOGY, type ArcBand, type ArcFlag } from "./arc.js";

/** arc-v2 rows predate flag codes: derive them from the (stable) flag text. */
const TEXT_CODES: Array<[RegExp, string]> = [
  [/^(Volume looks fake|Fake volume)/, "WASH"],
  [/^Holders own only/, "DEAD"],
  [/^Serial launcher/, "SERIAL"],
  [/^Creator (dumped|sold)/, "CREATOR_DUMP"],
  [/^Liquidity has already been removed/, "LP_REMOVED"],
  [/^Liquidity is not locked/, "LP_UNLOCKED"],
  [/^Contract can still create/, "MINT"],
  [/^Contract is upgradeable/, "UPGRADE"],
  [/^Someone can pause/, "RESTRICT"],
  [/^No sells seen yet/, "NO_SELLS"],
  [/wallets funded by the creator/, "INSIDERS"],
  [/^Creator holds/, "CREATOR_HEAVY"],
  [/^Snipers/, "SNIPERS"],
  [/^Copycat/, "COPYCAT"],
];

export type FlagReason = { code: string; text: string };

/** Flags with a machine code; old rows without one get it from their text. */
export function withFlagCodes(flags: ArcFlag[] | undefined | null): ArcFlag[] {
  return (flags ?? []).map((f) =>
    f.code ? f : { ...f, code: TEXT_CODES.find(([re]) => re.test(f.text))?.[1] ?? "INFO" },
  );
}

/** v2 rows were stored 0-100; v3+ store the 1-10 score directly. */
export function normalizedScore(run: { score: unknown; methodology: string | null } | undefined | null): number | null {
  if (!run) return null;
  const s = Number(run.score);
  return run.methodology === "arc-v2" || run.methodology === null ? Math.max(1, Math.round(s) / 10) : s;
}

/**
 * Flag codes from runs scored before arc-v5 carried known false positives (DEAD on busy tokens, WASH from a wrong
 * pool-USDC figure, LP_REMOVED and CREATOR_DUMP from mis-summed liquidity/burns). Until a token is rescored, only
 * trust the codes that weren't affected.
 */
const TRUSTED_LEGACY_CODES = new Set(["SERIAL", "IMPERSONATION"]);

/** The flagging codes a score run raised, trusting old runs only for the codes that were never wrong. */
export function scoreFlagReasons(flags: ArcFlag[], methodology: string | null | undefined): FlagReason[] {
  const current = methodology === ARC_METHODOLOGY;
  return flags
    .filter((f) => (FAKE_FLAG_CODES as readonly string[]).includes(f.code))
    .filter((f) => current || TRUSTED_LEGACY_CODES.has(f.code))
    .map((f) => ({ code: f.code, text: f.text }));
}

/**
 * Flags that need no holder history, so unscored tokens get caught too: the same rules as the scorer, applied to
 * market data and the token's name.
 */
export function marketFlagReasons(
  t: { name: string; symbol: string },
  volume24h: number | null,
  usdcInPool: number | null,
): FlagReason[] {
  const out: FlagReason[] = [];
  const brand = impersonates(t);
  if (brand) out.push({ code: "IMPERSONATION", text: `Impersonates ${brand} — not an official token` });
  if (isWash(volume24h, usdcInPool)) {
    out.push({
      code: "WASH",
      text: `Fake volume: $${Math.round(volume24h!).toLocaleString()} traded in 24h through a pool holding only $${usdcInPool! < 10 ? usdcInPool!.toFixed(2) : Math.round(usdcInPool!)} of USDC`,
    });
  }
  return out;
}

export interface VerdictInput {
  name: string;
  symbol: string;
  /** The latest score run, if any. */
  run: { score: unknown; methodology: string | null; flags: ArcFlag[] | undefined | null } | null;
  volume24h: number | null;
  usdcInPool: number | null;
}

export interface Verdict {
  score: number | null;
  band: ArcBand;
  /** Why the token is flagged: score-based reasons first, then market-based ones not already covered. */
  reasons: FlagReason[];
  fake: boolean;
  scoreCodes: string[];
  marketCodes: string[];
}

export function deriveVerdict(i: VerdictInput): Verdict {
  const score = normalizedScore(i.run);
  const scored = i.run ? scoreFlagReasons(withFlagCodes(i.run.flags), i.run.methodology) : [];
  const market = marketFlagReasons(i, i.volume24h, i.usdcInPool);
  const reasons = [...scored, ...market.filter((r) => !scored.some((x) => x.code === r.code))];
  return {
    score,
    band: arcBand(score),
    reasons,
    fake: reasons.length > 0,
    scoreCodes: scored.map((r) => r.code),
    marketCodes: market.map((r) => r.code),
  };
}

// When does a token get (re)scored? Scoring everything on a short timer costs more than it is worth: most
// tokens are dead or quiet and their score does not move. So the work follows demand and activity:
//
//   asked for by a visitor        -> next pass, always
//   under 1h old                  -> every 2 min   (rugs happen early)
//   under 24h old                 -> every 10 min
//   older and trading             -> every 30 min
//   older and quiet (no volume)   -> every 6 h     (still checked, so a pulled pool is noticed)
//   older, never scored, dead     -> only when asked for (liquidity under the dead floor)
//
// Every number is an environment variable so it can be tuned without a deploy.

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const MIN = 60_000;

export const SCORE_SCHEDULE = {
  /** Tokens scored per 5-minute pass. This is the compute ceiling. */
  maxPerRun: num("ARC_SCORE_MAX_PER_RUN", 300),
  newbornMs: 60 * MIN,
  freshMs: 24 * 60 * MIN,
  rescoreNewbornMs: num("ARC_RESCORE_NEWBORN_MIN", 2) * MIN,
  rescoreFreshMs: num("ARC_RESCORE_FRESH_MIN", 10) * MIN,
  rescoreActiveMs: num("ARC_RESCORE_ACTIVE_MIN", 30) * MIN,
  rescoreQuietMs: num("ARC_RESCORE_QUIET_MIN", 360) * MIN,
  /** Pool USDC below this, on a token older than a day, counts as dead. */
  deadLiquidityUsd: num("ARC_DEAD_LIQUIDITY_USD", 50),
  /** How long a visitor's "score this" stays in the queue (the history backfill may need a pass first). */
  requestWindowMs: num("ARC_SCORE_REQUEST_WINDOW_MIN", 30) * MIN,
};
export type ScoreSchedule = typeof SCORE_SCHEDULE;

export interface ScheduleToken {
  launchTime: Date;
  rescoreRequestedAt: Date | null;
  /** Null when the market sync has not read the token yet: that is "unknown", never "dead". */
  liquidityUsd: number | null;
  volume24h: number | null;
  /** ms timestamp of the latest score run, if any. */
  lastScoredAt: number | undefined;
  lastMethodology: string | null | undefined;
}

/** A token the site knows to be dead: liquidity is read and under the floor, and it is past its first day. */
export function isDead(t: ScheduleToken, now: number, cfg: ScoreSchedule = SCORE_SCHEDULE): boolean {
  return now - t.launchTime.getTime() >= cfg.freshMs && t.liquidityUsd !== null && t.liquidityUsd < cfg.deadLiquidityUsd;
}

export function isDue(t: ScheduleToken, now: number, methodology: string, cfg: ScoreSchedule = SCORE_SCHEDULE): boolean {
  const last = t.lastScoredAt;
  const requested = t.rescoreRequestedAt?.getTime();
  if (requested !== undefined && now - requested < cfg.requestWindowMs && (last === undefined || requested > last)) return true;
  // A methodology change rescores everything once, promptly.
  if (last !== undefined && t.lastMethodology !== methodology) return true;
  if (last === undefined) return !isDead(t, now, cfg);
  const age = now - t.launchTime.getTime();
  const quiet = age >= cfg.freshMs && !((t.volume24h ?? 0) > 0);
  const every =
    age < cfg.newbornMs ? cfg.rescoreNewbornMs : age < cfg.freshMs ? cfg.rescoreFreshMs : quiet ? cfg.rescoreQuietMs : cfg.rescoreActiveMs;
  return now - last > every;
}

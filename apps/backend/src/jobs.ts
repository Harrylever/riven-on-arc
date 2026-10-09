import { Cron } from "croner";
import { Logger } from "./lib/logger";
import type { Services } from "./container";

/**
 * Every schedule the NestJS @Cron decorators declared, in one place.
 * croner takes 6-field patterns (seconds first), matching @nestjs/schedule's
 * CronExpression constants. `protect: true` skips a tick if the previous run
 * of the same job is still going (same as the old behavior of not overlapping
 * a slow RPC pass with the next one); a throwing job is logged, never fatal.
 */
const logger = new Logger("Jobs");

const EVERY_MINUTE = "0 * * * * *";
const EVERY_20_SECONDS = "*/20 * * * * *";
const EVERY_5_MINUTES = "0 */5 * * * *";
const EVERY_10_MINUTES = "0 */10 * * * *";
const EVERY_30_MINUTES = "0 */30 * * * *";
const EVERY_DAY_AT_3AM = "0 0 3 * * *";

export function startJobs(s: Services): Cron[] {
  const arcIndexing: Array<[string, string, () => Promise<unknown>]> = [
    // Launches → holder/swap activity → scores. `protect` skips a tick while
    // the previous one is still catching up.
    ["arcPipeline.runOnce", EVERY_5_MINUTES, () => s.arcPipeline.runOnce({ score: false })],
    // Telegram: link /start codes and forward alerts/calls (no-op without a bot token).
    ["telegram.tick", EVERY_20_SECONDS, () => s.telegram.tick()],
    // Scores on their own loop so they stay live while slower indexing catches up.
    ["arcScoring.scoreOnce", EVERY_5_MINUTES, () => s.arcScoring.scoreOnce()],
  ];
  const legacySolanaJobs: Array<[string, string, () => Promise<unknown>]> = [
    [
      "snapshot.computeSnapshots",
      EVERY_MINUTE,
      () => s.snapshot.computeSnapshots(),
    ],
    [
      "clawPump.pollNewLaunches",
      EVERY_5_MINUTES,
      () => s.clawPumpPoller.pollNewLaunches(),
    ],
    ["scoring.scoreAll", EVERY_5_MINUTES, () => s.scoring.scoreAll()],
    ["trade.runDecisionLoop", EVERY_5_MINUTES, () => s.trade.runDecisionLoop()],
    [
      "launchIngest.backfillPendingMetadata",
      EVERY_10_MINUTES,
      () => s.launchIngest.backfillPendingMetadata(),
    ],
    [
      "authority.checkAll",
      EVERY_10_MINUTES,
      () => s.authorityChecker.checkAll(),
    ],
    [
      "holders.checkAll",
      EVERY_10_MINUTES,
      () => s.holderConcentration.checkAll(),
    ],
    ["monitoring.checkAll", EVERY_10_MINUTES, () => s.monitoring.checkAll()],
    [
      "kol.pollRecentTrades",
      EVERY_30_MINUTES,
      () => s.kolPoll.pollRecentTrades(),
    ],
    [
      "retention.pruneOldRows",
      EVERY_DAY_AT_3AM,
      () => s.retention.pruneOldRows(),
    ],
  ];
  // Arc is the product now: legacy Solana jobs (Helius, KOLs, the frozen trade
  // loop) only run when explicitly asked for — matching the frontend default.
  const schedule =
    process.env.CHAIN_MODE === "solana"
      ? [...arcIndexing, ...legacySolanaJobs]
      : arcIndexing;

  return schedule.map(
    ([name, pattern, run]) =>
      new Cron(pattern, { name, protect: true }, async () => {
        try {
          await run();
        } catch (err) {
          logger.error(`${name} failed: ${(err as Error).message}`);
        }
      }),
  );
}

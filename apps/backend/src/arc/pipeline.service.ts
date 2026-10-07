import type { FactoryLogIndexerService } from "./factory-log-indexer.service";
import type { ArcActivityIndexerService } from "./activity-indexer.service";
import type { ArcScoringService } from "./scoring.service";
import type { PoolIndexerService } from "./pool-indexer.service";
import type { MarketSyncService } from "./market-sync.service";
import type { HolderBackfillService } from "./holder-backfill.service";
import type { CalloutsService } from "./callouts.service";

/**
 * One Arc tick, in dependency order: launchpad launches → every USDC pool on
 * Arc → holder/swap/LP activity → market data → holder backfill for older
 * tokens → scores. Each step is isolated so a failing step still lets the next
 * run on whatever data is already stored.
 */
export class ArcPipelineService {
  constructor(
    private readonly launches: FactoryLogIndexerService,
    private readonly pools: PoolIndexerService,
    private readonly activity: ArcActivityIndexerService,
    private readonly market: MarketSyncService,
    private readonly backfill: HolderBackfillService,
    private readonly scoring: ArcScoringService,
    private readonly callouts?: CalloutsService,
  ) {}

  /** `score: false` when scoring runs on its own loop (jobs, dev worker). */
  async runOnce({ score = true }: { score?: boolean } = {}) {
    const step = async <T>(name: string, fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (err) {
        console.error(`[arc] ${name} failed: ${(err as Error).message}`);
        return { error: (err as Error).message };
      }
    };
    const launches = await step("launch indexing", () => this.launches.indexLaunchpadsOnce());
    const pools = await step("pool indexing", () => this.pools.indexPoolsOnce());
    const activity = await step("activity indexing", () => this.activity.indexActivityOnce());
    const market = await step("market sync", () => this.market.syncOnce());
    const backfill = await step("holder backfill", () => this.backfill.backfillOnce());
    const scoring = score ? await step("scoring", () => this.scoring.scoreOnce()) : { skipped: "own loop" };
    const callouts = this.callouts
      ? await step("X callouts", () => this.callouts!.indexOnce())
      : { skipped: "not configured" };
    return { launches, pools, activity, market, backfill, scoring, callouts };
  }
}

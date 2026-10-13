import type { FactoryLogIndexerService } from "./factory-log-indexer.service";
import type { ArcActivityIndexerService } from "./activity-indexer.service";
import type { ArcScoringService } from "./scoring.service";
import type { PoolIndexerService } from "./pool-indexer.service";
import type { MarketSyncService } from "./market-sync.service";
import type { HolderBackfillService } from "./holder-backfill.service";
import type { CalloutsService } from "./callouts.service";
import { withTimeout } from "../lib/with-timeout";

/** A step that has not finished by now is treated as hung: it is reported, and the next step runs. */
const stepTimeoutMs = () => Number(process.env.ARC_STEP_TIMEOUT_MIN ?? "8") * 60_000;
/** A step slower than this is logged, so a slow one shows up before it becomes a hung one. */
const SLOW_STEP_MS = 60_000;

export interface StepStatus {
  at: string;
  ms: number;
  ok: boolean;
  error?: string;
}

/**
 * One Arc tick, in dependency order: launchpad launches → every USDC pool on
 * Arc → holder/swap/LP activity → market data → holder backfill for older
 * tokens → scores. Each step is isolated so a failing step still lets the next
 * run on whatever data is already stored.
 */
export class ArcPipelineService {
  /** When each step last finished and how: shown on /arc/health so a stall is visible without reading logs. */
  private readonly steps: Record<string, StepStatus> = {};
  private lastStartedAt: string | null = null;
  private lastFinishedAt: string | null = null;

  getStatus() {
    return { lastStartedAt: this.lastStartedAt, lastFinishedAt: this.lastFinishedAt, steps: this.steps };
  }

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
    this.lastStartedAt = new Date().toISOString();
    const step = async <T>(name: string, fn: () => Promise<T>) => {
      const t0 = Date.now();
      try {
        const out = await withTimeout(fn(), stepTimeoutMs(), name);
        const ms = Date.now() - t0;
        this.steps[name] = { at: new Date().toISOString(), ms, ok: true };
        if (ms > SLOW_STEP_MS) console.warn(`[arc] ${name} was slow: ${Math.round(ms / 1000)}s`);
        return out;
      } catch (err) {
        const message = (err as Error).message;
        this.steps[name] = { at: new Date().toISOString(), ms: Date.now() - t0, ok: false, error: message.slice(0, 200) };
        console.error(`[arc] ${name} failed: ${message}`);
        return { error: message };
      }
    };
    const launches = await step("launch indexing", () => this.launches.indexLaunchpadsOnce());
    const pools = await step("pool indexing", () => this.pools.indexPoolsOnce());
    // Before activity: swaps are read with the right USDC decimals only once each pool's quote is known.
    const quotes = await step("pool quote check", () => this.pools.verifyQuoteCurrenciesOnce());
    const activity = await step("activity indexing", () => this.activity.indexActivityOnce());
    const market = await step("market sync", () => this.market.syncOnce());
    const backfill = await step("holder backfill", () => this.backfill.backfillOnce());
    const scoring = score ? await step("scoring", () => this.scoring.scoreOnce()) : { skipped: "own loop" };
    const callouts = this.callouts
      ? await step("X callouts", () => this.callouts!.indexOnce())
      : { skipped: "not configured" };
    this.lastFinishedAt = new Date().toISOString();
    return { launches, pools, quotes, activity, market, backfill, scoring, callouts };
  }
}

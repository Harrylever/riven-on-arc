import { AuthorityCheckerService } from "./rug-signals/authority-checker.service";
import { HolderConcentrationService } from "./rug-signals/holder-concentration.service";
import { BurnIngestService } from "./rug-signals/burn-ingest.service";
import { LaunchIngestService } from "./launch-detection/launch-ingest.service";
import { ClawPumpPollerService } from "./launch-detection/clawpump-poller.service";
import { SwapIngestService } from "./market-data/swap-ingest.service";
import { SnapshotService } from "./market-data/snapshot.service";
import { ScoringService } from "./scoring/scoring.service";
import { KolPollService } from "./kol-ingestion/kol-poll.service";
import { MonitoringService } from "./monitoring/monitoring.service";
import { RetentionService } from "./retention/retention.service";
import { TradeService } from "./trade/trade.service";
import { ContractInspectorService } from "./arc/contract-inspector.service";
import { FactoryLogIndexerService } from "./arc/factory-log-indexer.service";
import { ArcActivityIndexerService } from "./arc/activity-indexer.service";
import { ArcScoringService } from "./arc/scoring.service";
import { ArcPipelineService } from "./arc/pipeline.service";
import { CalloutsService } from "./arc/callouts.service";
import { TelegramService } from "./arc/telegram.service";
import { PoolIndexerService } from "./arc/pool-indexer.service";
import { MarketSyncService } from "./arc/market-sync.service";
import { HolderBackfillService } from "./arc/holder-backfill.service";

/**
 * Hand-wired replacement for Nest's DI container. Only LaunchIngestService
 * has constructor dependencies (the two rug-signal checkers), so a plain
 * object graph is all this needs — no framework.
 */
export function createServices() {
  const authorityChecker = new AuthorityCheckerService();
  const holderConcentration = new HolderConcentrationService();
  const burnIngest = new BurnIngestService();
  const launchIngest = new LaunchIngestService(
    authorityChecker,
    holderConcentration,
  );
  const swapIngest = new SwapIngestService();
  const arcIndexer = new FactoryLogIndexerService();
  const arcActivity = new ArcActivityIndexerService();
  const arcScoring = new ArcScoringService();

  const callouts = new CalloutsService();
  return {
    callouts,
    telegram: new TelegramService(),
    authorityChecker,
    holderConcentration,
    burnIngest,
    launchIngest,
    swapIngest,
    clawPumpPoller: new ClawPumpPollerService(),
    snapshot: new SnapshotService(),
    scoring: new ScoringService(),
    kolPoll: new KolPollService(),
    monitoring: new MonitoringService(),
    retention: new RetentionService(),
    trade: new TradeService(),
    arcInspector: new ContractInspectorService(),
    arcIndexer,
    arcActivity,
    arcScoring,
    arcPipeline: new ArcPipelineService(
      arcIndexer,
      new PoolIndexerService(),
      arcActivity,
      new MarketSyncService(),
      new HolderBackfillService(),
      arcScoring,
      callouts,
    ),
  };
}

export type Services = ReturnType<typeof createServices>;

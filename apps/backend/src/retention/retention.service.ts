import { Logger } from '../lib/logger';
import { getDb } from '@riven/shared';

/**
 * Deletes rows older than DATA_RETENTION_DAYS (default 30) from the
 * highest-volume tables, daily. This is retention only — NOT archival to
 * cold storage (S3 etc.). Deliberately not building that: no bucket
 * provisioned, no export format decided, and it's premature for
 * hackathon-scale data volume. If disk usage ever becomes a real problem
 * before archival is worth building, the fix is lowering
 * DATA_RETENTION_DAYS, not standing up infrastructure under pressure.
 *
 * Burn and Alert are excluded from pruning — both are event-driven and much
 * lower volume than the tables below (Alert also has cooldown-bounded
 * growth from MonitoringService), and both are more valuable kept longer as
 * incident history than the high-frequency snapshot/check tables are.
 *
 * Known limitation, not handled: a token that stops getting fresh checks
 * entirely (e.g. dead/abandoned) will eventually have ALL its history
 * pruned once everything ages past the cutoff, leaving it with no data
 * rather than stale-but-present data. Not worth the complexity of a
 * "keep at least the latest row per token" exception at this scale/timeline
 * — revisit if it actually causes a problem.
 */
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  async pruneOldRows() {
    const days = Number(process.env.DATA_RETENTION_DAYS ?? 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const db = getDb();

    const jobs: Array<{
      label: string;
      run: () => Promise<{ count: number }>;
    }> = [
      {
        label: 'Trade',
        run: () => db.trade.deleteMany({ where: { ts: { lt: cutoff } } }),
      },
      {
        label: 'PairSnapshot',
        run: () =>
          db.pairSnapshot.deleteMany({ where: { ts: { lt: cutoff } } }),
      },
      {
        label: 'HolderSnapshot',
        run: () =>
          db.holderSnapshot.deleteMany({
            where: { checkedAt: { lt: cutoff } },
          }),
      },
      {
        label: 'TokenAuthorityCheck',
        run: () =>
          db.tokenAuthorityCheck.deleteMany({
            where: { checkedAt: { lt: cutoff } },
          }),
      },
      {
        label: 'KolTrade',
        run: () =>
          db.kolTrade.deleteMany({ where: { tradedAt: { lt: cutoff } } }),
      },
      {
        label: 'ScoreRun',
        // Active tokens are rescored every few minutes and each run carries a JSON blob, so this table is
        // the one that grows fastest. Keep, per token: the latest 5 runs, the latest of all (always), and
        // its FIRST run per methodology (the accuracy page judges a token by how it was rated when first
        // scored). Everything else is dropped once it is older than 7 days, or beyond the latest 5.
        run: async () => ({
          count: await db.$executeRaw`
            DELETE FROM score_runs WHERE id IN (
              SELECT id FROM (
                SELECT id, calculated_at,
                       row_number() OVER (PARTITION BY token_id ORDER BY calculated_at DESC) AS newest,
                       row_number() OVER (PARTITION BY token_id, methodology ORDER BY calculated_at ASC) AS first_of_method
                FROM score_runs
              ) r
              WHERE r.newest > 1 AND r.first_of_method > 1
                AND (r.newest > 5 OR r.calculated_at < now() - interval '7 days')
            )`,
        }),
      },
    ];

    let totalDeleted = 0;

    // Independent per-table, on purpose — one table's failure (e.g. a lock
    // contention blip) must not block pruning the others.
    for (const job of jobs) {
      try {
        const { count } = await job.run();
        totalDeleted += count;
        this.logger.log(`Pruned ${count} rows from ${job.label}`);
      } catch (err) {
        this.logger.error(
          `Retention prune failed for ${job.label}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Retention pass complete: pruned ${totalDeleted} rows total (cutoff: ${days} days)`,
    );
  }
}

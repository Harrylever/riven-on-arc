import { Logger } from '../lib/logger';
import { getDb, getSolBalance, getSolPriceUsd } from '@riven/shared';

/**
 * Computes a PairSnapshot per pool from recent Trade rows, every minute.
 *
 * priceSol is exact — the most recent trade's solAmount/tokenAmount ratio.
 * liquidityUsd is computed as poolSolBalance * solUsdPrice.
 */
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  async computeSnapshots() {
    const db = getDb();
    const pools = await db.pool.findMany({ include: { token: true } });
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const solUsdPrice = await getSolPriceUsd();

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since1h = new Date(Date.now() - 60 * 60 * 1000);
    const since5m = new Date(Date.now() - 5 * 60 * 1000);

    let computed = 0;

    for (const pool of pools) {
      try {
        const recentTrades = await db.trade.findMany({
          where: { poolId: pool.id, ts: { gte: since24h } },
          orderBy: { ts: 'desc' },
        });

        if (recentTrades.length === 0) continue;

        const latest = recentTrades[0];
        if (Number(latest.tokenAmount) === 0) {
          this.logger.warn(
            `Pool ${pool.address} latest trade has zero tokenAmount — skipping`,
          );
          continue;
        }
        const priceSol = Number(latest.solAmount) / Number(latest.tokenAmount);

        let poolSolBalance: number | null = null;
        if (rpcUrl) {
          const lamports = await getSolBalance(pool.address, rpcUrl);
          if (lamports !== null) poolSolBalance = lamports / 1e9;
        }

        const liquidityUsd =
          poolSolBalance !== null && solUsdPrice !== null
            ? poolSolBalance * solUsdPrice
            : null;

        const priceUsd = solUsdPrice !== null ? priceSol * solUsdPrice : null;

        let marketCapUsd: number | null = null;
        if (
          pool.token &&
          Number(pool.token.initialSupply) > 0 &&
          priceUsd !== null
        ) {
          marketCapUsd = priceUsd * Number(pool.token.initialSupply);
        }

        const sumSol = (trades: typeof recentTrades) =>
          trades.reduce((acc, t) => acc + Number(t.solAmount), 0);

        await db.pairSnapshot.create({
          data: {
            poolId: pool.id,
            ts: new Date(),
            priceSol: String(priceSol),
            priceUsd: priceUsd !== null ? String(priceUsd) : null,
            marketCapUsd: marketCapUsd !== null ? String(marketCapUsd) : null,
            liquidityUsd: liquidityUsd !== null ? String(liquidityUsd) : null,
            volume5m: String(
              sumSol(recentTrades.filter((t) => t.ts >= since5m)),
            ),
            volume1h: String(
              sumSol(recentTrades.filter((t) => t.ts >= since1h)),
            ),
            volume24h: String(sumSol(recentTrades)),
            buys: recentTrades.filter((t) => t.side === 'buy').length,
            sells: recentTrades.filter((t) => t.side === 'sell').length,
          },
        });

        // Denormalized convenience field for quick leaderboard reads
        await db.token.update({
          where: { id: pool.tokenId },
          data: {
            currentPrice: String(priceSol),
            ...(marketCapUsd !== null
              ? { marketCap: String(marketCapUsd) }
              : {}),
          },
        });

        computed++;
      } catch (err) {
        this.logger.error(
          `Snapshot failed for pool ${pool.address}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Computed snapshots for ${computed}/${pools.length} pools`);
  }
}

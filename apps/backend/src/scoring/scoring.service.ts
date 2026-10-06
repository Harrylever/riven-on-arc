import { Logger } from '../lib/logger';
import {
  getDb,
  readBondingCurves,
  type CurveState,
  getSolBalance,
  getTokenSupply,
  computeScore,
  deriveConcentrationScore,
  deriveBurnScore,
  deriveLiquidityScore,
} from '@clawdex/shared';

/**
 * Wires phases 1-3's data into computeScore() every 5 minutes (same cadence
 * as SnapshotService — blueprint's cadence table). This is the "make
 * /api/score, /api/leaderboard, /api/token/[mint] actually live" piece of
 * phase 4: those routes already read ScoreRun/TokenAuthorityCheck/etc.
 * correctly, they just had nothing populated to read before this.
 *
 * If some rug-signal inputs are missing during cold start, compute a partial
 * score with available signals and flag with partial: true / confidence: 'low'.
 */
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  async scoreAll() {
    const db = getDb();
    const rpcUrl = process.env.SOLANA_RPC_URL;

    // Load active tokens and their pools.
    const tokens = await db.token.findMany({
      include: { pools: true },
    });

    if (tokens.length === 0) {
      this.logger.debug('No tokens to score');
      return;
    }

    // Collect all pump.fun bonding curves in one batch read rather than
    // hammering the RPC with one getAccountInfo per token.
    const pumpfunPoolAddresses = tokens
      .flatMap((t) => t.pools)
      .filter((p) => p.venue === 'PUMPFUN_CURVE')
      .map((p) => p.address);

    let curves: Map<string, CurveState> = new Map();
    if (rpcUrl && pumpfunPoolAddresses.length > 0) {
      try {
        curves = await readBondingCurves(pumpfunPoolAddresses, rpcUrl);
      } catch (err) {
        this.logger.warn(
          `Failed to batch-read bonding curves: ${(err as Error).message}`,
        );
      }
    }

    let scored = 0;
    let skipped = 0;

    for (const token of tokens) {
      try {
        const ok = await this.scoreOne(token, rpcUrl, curves);
        if (ok) {
          scored++;
        } else {
          skipped++;
        }
      } catch (err) {
        this.logger.error(
          `Scoring failed for ${token.mint}: ${(err as Error).message}`,
        );
        skipped++;
      }
    }

    this.logger.log(
      `Scored ${scored} tokens, skipped ${skipped} (insufficient data or error)`,
    );
  }

  private async scoreOne(
    token: {
      id: string;
      mint: string;
      initialSupply: unknown;
      pools: Array<{ id: string; address: string; venue: string }>;
    },
    rpcUrl: string | undefined,
    curves: Map<string, CurveState>,
  ): Promise<boolean> {
    const db = getDb();

    const [authCheck, holderSnap] = await Promise.all([
      db.tokenAuthorityCheck.findFirst({
        where: { tokenId: token.id },
        orderBy: { checkedAt: 'desc' },
      }),
      db.holderSnapshot.findFirst({
        where: { tokenId: token.id },
        orderBy: { checkedAt: 'desc' },
      }),
    ]);

    const attributedBurns = await db.burn.findMany({
      where: { tokenId: token.id, attributed: true },
    });
    const attributedBurnTotal = attributedBurns.reduce(
      (acc, b) => acc + Number(b.amount),
      0,
    );

    let currentSupply = Number(token.initialSupply);
    if (rpcUrl) {
      const supply = await getTokenSupply(token.mint, rpcUrl);
      if (supply) currentSupply = Number(supply);
    }
    const burnRatio =
      currentSupply > 0 ? attributedBurnTotal / currentSupply : 0;

    // Liquidity ratio in SOL terms: pool SOL / market cap SOL
    const pool = token.pools[0];
    let liquidityRatio: number | null = null;
    let staleSnapshot = false;

    if (!pool) {
      this.logger.warn(
        `[scoring] ${token.mint} skipped: no_pool (no liquidity pool registered yet)`,
      );
    } else if (pool.venue === 'PUMPFUN_CURVE') {
      const curve = curves.get(pool.address);
      if (curve && !curve.complete && curve.marketCapSol > 0) {
        liquidityRatio = curve.realSolReserves / curve.marketCapSol;
      } else if (!curve) {
        this.logger.warn(
          `[scoring] ${token.mint} skipped: no_bonding_curve (curve ${pool.address} unreadable)`,
        );
      }
    } else if (rpcUrl) {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const [solBalanceLamports, recentSnapshot, latestAnySnapshot] =
        await Promise.all([
          getSolBalance(pool.address, rpcUrl),
          db.pairSnapshot.findFirst({
            where: { poolId: pool.id, ts: { gte: fifteenMinutesAgo } },
            orderBy: { ts: 'desc' },
          }),
          db.pairSnapshot.findFirst({
            where: { poolId: pool.id },
            orderBy: { ts: 'desc' },
          }),
        ]);

      if (solBalanceLamports === null) {
        this.logger.warn(
          `[scoring] ${token.mint} skipped: no_sol_balance (RPC failed for pool ${pool.address})`,
        );
      }

      const activeSnapshot = recentSnapshot ?? latestAnySnapshot;
      if (!activeSnapshot) {
        this.logger.warn(
          `[scoring] ${token.mint} skipped: no_recent_snapshot (no PairSnapshot exists for pool ${pool.id})`,
        );
      } else {
        if (!recentSnapshot && latestAnySnapshot) {
          staleSnapshot = true;
          this.logger.warn(
            `[scoring] ${token.mint}: snapshot is older than 15m (${latestAnySnapshot.ts.toISOString()}), falling back with stale_snapshot flag`,
          );
        }
        if (solBalanceLamports !== null) {
          const marketCapSol = Number(activeSnapshot.priceSol) * currentSupply;
          if (marketCapSol > 0) {
            liquidityRatio = solBalanceLamports / 1e9 / marketCapSol;
          }
        }
      }
    }

    const hasAuth = !!authCheck;
    const hasConcentration = !!holderSnap;
    const hasLiquidity = liquidityRatio !== null;
    const hasBurns = attributedBurns.length > 0;

    // If no signals whatsoever can be derived, skip scoring rather than invent numbers
    if (
      !hasAuth &&
      !hasConcentration &&
      !hasLiquidity &&
      !hasBurns &&
      currentSupply <= 0
    ) {
      this.logger.warn(
        `[scoring] ${token.mint} skipped: insufficient_signals (no authority, holder, liquidity, or burn data)`,
      );
      return false;
    }

    // Single source of truth: the same computeScore() the /api/score route uses.
    // Missing signals are passed as null so it renormalizes and flags partial.
    const breakdown = computeScore({
      authorityGate: authCheck
        ? {
            mintAuthorityActive: authCheck.mintAuthorityActive,
            freezeAuthorityActive: authCheck.freezeAuthorityActive,
            lpLocked: authCheck.lpLocked,
          }
        : null,
      concentrationScore: holderSnap
        ? deriveConcentrationScore(Number(holderSnap.top10Pct))
        : null,
      burnScore: hasBurns && currentSupply > 0 ? deriveBurnScore(burnRatio) : null,
      liquidityScore:
        liquidityRatio !== null ? deriveLiquidityScore(liquidityRatio) : null,
    });

    await db.scoreRun.create({
      data: {
        tokenId: token.id,
        score: breakdown.score,
        gate: breakdown.gate,
        concentration: breakdown.concentration,
        burnScore: breakdown.burnScore,
        liquidityScore: breakdown.liquidityScore,
        partial: breakdown.partial,
        confidence: breakdown.confidence,
        staleSnapshot,
      },
    });

    return true;
  }
}

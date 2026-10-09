import { Logger } from '../lib/logger';
import { getDb, scoreBand } from '@riven/shared';
import { getSwapQuote } from './jupiter.client';

/**
 * Trade decision loop. Runs every 5 minutes, same cadence as score recompute
 * (blueprint Section 4 cadence table), so it always reads the freshest score.
 *
 * Execution is intentionally NOT wired up yet: the custody model (per-user
 * wallet vs. pooled treasury — see the blueprint's Decisions checklist) is
 * still undecided, and signing/sending a real transaction without that
 * decision made would be building on sand. This loop reads scores, decides
 * what it WOULD do, and logs it — swap it to real execution once custody
 * is resolved.
 */
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  async runDecisionLoop() {
    const db = getDb();
    const recentScores = await db.scoreRun.findMany({
      orderBy: { calculatedAt: 'desc' },
      take: 50,
    });

    for (const run of recentScores) {
      const band = scoreBand(Number(run.score));
      if (band !== 'green') continue;

      this.logger.log(
        `[decision] token ${run.tokenId} scored ${run.score.toString()} (green) — would BUY. Execution blocked: custody model not yet decided.`,
      );
      // Once custody is decided:
      // const quote = await getSwapQuote({ inputMint: SOL_MINT, outputMint: token.mint, amountLamports: '...', slippageBps: 50 });
      // then build + sign + send the swap transaction, then db.executionLog.create({ ... })
    }
  }
}

// Re-exported so the module/tests can reference it without reaching into the file directly.
export { getSwapQuote };

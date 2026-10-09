import { Logger } from '../lib/logger';
import { getDb, createKolProvider } from '@riven/shared';

/**
 * REST polling, not streaming — MadeOnSol's WebSocket (kol:trades) is
 * PRO-tier only, not available on the free plan this is built against.
 *
 * TODO: revisit if MadeOnSol is ever upgraded to a paid plan. Swap this
 * polling loop for a persistent subscription to wss://madeonsol.com/ws/v1/stream
 * (channel kol:trades, auth via a stream token from POST /stream/token) —
 * that would get live KOL trades instead of waiting up to 30 min between
 * polls. Not worth building speculatively against a tier we don't have.
 *
 * Cadence math (both providers' free tiers, whichever is active):
 * MadeOnSol ~200 req/day, Solana Tracker ~2,500 req/month (~83/day) — the
 * tighter budget. Every 20 minutes = 72 req/day, comfortably under both
 * with margin. Provider itself is a runtime choice (createKolProvider,
 * env-driven) — AGENTS.md open decision #5 is still unresolved, this just
 * keeps the code from having to care which one wins.
 *
 * A KolTrade can arrive for a token phase 1's webhook hasn't detected yet
 * (it only watches pump.fun/LaunchLab program IDs; a KOL provider watches
 * everything) — tokenId is left null in that case, not dropped, since the
 * KOL feed entry is still real data even without a Token row to attach to.
 */
export class KolPollService {
  private readonly logger = new Logger(KolPollService.name);

  async pollRecentTrades() {
    const provider = createKolProvider();
    const db = getDb();

    let trades;
    try {
      trades = await provider.fetchRecentTrades({ limit: 50 });
    } catch (err) {
      this.logger.error(
        `KOL provider (${provider.name}) fetch failed: ${(err as Error).message}`,
      );
      return;
    }

    let ingested = 0;

    for (const trade of trades) {
      try {
        const token = await db.token.findUnique({
          where: { mint: trade.tokenMint },
        });

        await db.kolTrade.upsert({
          where: { signature: trade.signature },
          update: {},
          create: {
            signature: trade.signature,
            kolWallet: trade.kolWallet,
            kolName: trade.kolName,
            tokenMint: trade.tokenMint,
            tokenId: token?.id,
            side: trade.side,
            solAmount: String(trade.solAmount),
            marketCapUsdAtTrade:
              trade.marketCapUsdAtTrade != null
                ? String(trade.marketCapUsdAtTrade)
                : null,
            tradedAt: trade.tradedAt,
            source: trade.source,
          },
        });
        ingested++;
      } catch (err) {
        // One malformed trade (e.g. a duplicate signature race) must not
        // drop the rest of this poll's batch.
        this.logger.error(
          `Failed to ingest KOL trade ${trade.signature}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `KOL poll (${provider.name}): ingested ${ingested}/${trades.length} trades`,
    );
  }
}

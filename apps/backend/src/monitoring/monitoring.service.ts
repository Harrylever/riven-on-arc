import { Logger } from '../lib/logger';
import { getDb } from '@clawdex/shared';

/**
 * "Watch this token → alert" per the final spec's Autonomous Agent Mode —
 * built as NEW code, not by repurposing TradeService (frozen, see AGENTS.md
 * top-of-file note). This produces structured, per-signal Alert rows; it
 * does NOT write the multi-signal natural-language narrative from the
 * spec's example ("Price is rising but concentration is increasing...") —
 * that's the AI agent's job (product/agent side), same boundary as the rest
 * of this codebase: chain-data produces facts, the LLM layer explains them.
 *
 * No server-side watchlist exists yet (product/agent phase 3 is
 * localStorage-only), so this runs for every tracked token, not filtered by
 * who's watching what — matching alerts to a specific user happens once
 * watchlists are DB-backed (their phase 8).
 *
 * Each check has an independent cooldown so the same signal doesn't refire
 * every 10-minute cycle while still inside its detection window (e.g. a KOL
 * coordination burst is visible for a rolling 60 minutes — without a
 * cooldown it would alert 6 times for one real event).
 */
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  private static readonly CONCENTRATION_SHIFT_PP = 0.1; // 10 percentage points
  private static readonly VOLUME_SPIKE_MULTIPLIER = 3;
  private static readonly KOL_COORDINATION_THRESHOLD = 3; // distinct KOL wallets
  private static readonly COOLDOWN_MINUTES = 60;

  async checkAll() {
    const db = getDb();
    const tokens = await db.token.findMany({ include: { pools: true } });
    let alertsRaised = 0;

    for (const token of tokens) {
      try {
        alertsRaised += await this.checkHolderConcentration(token.id);
        alertsRaised += await this.checkVolumeSpike(
          token.id,
          token.pools[0]?.id,
        );
        alertsRaised += await this.checkUnusualBurns(token.id);
        alertsRaised += await this.checkAuthorityChange(token.id);
        alertsRaised += await this.checkKolCoordination(token.id);
      } catch (err) {
        this.logger.error(
          `Monitoring check failed for ${token.mint}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Monitoring pass: checked ${tokens.length} tokens, raised ${alertsRaised} alerts`,
    );
  }

  /** Skips creating a new alert if one of this type already fired for this token within the cooldown window. */
  private async withinCooldown(
    tokenId: string,
    type: string,
  ): Promise<boolean> {
    const db = getDb();
    const since = new Date(
      Date.now() - MonitoringService.COOLDOWN_MINUTES * 60_000,
    );
    const recent = await db.alert.findFirst({
      where: { tokenId, type: type as never, createdAt: { gte: since } },
    });
    return recent !== null;
  }

  private async checkHolderConcentration(tokenId: string): Promise<number> {
    const db = getDb();
    const [latest, previous] = await db.holderSnapshot.findMany({
      where: { tokenId },
      orderBy: { checkedAt: 'desc' },
      take: 2,
    });
    if (!latest || !previous) return 0;

    const delta = Number(latest.top10Pct) - Number(previous.top10Pct);
    if (Math.abs(delta) < MonitoringService.CONCENTRATION_SHIFT_PP) return 0;
    if (await this.withinCooldown(tokenId, 'HOLDER_CONCENTRATION_SHIFT'))
      return 0;

    const direction = delta > 0 ? 'rose' : 'fell';
    await db.alert.create({
      data: {
        tokenId,
        type: 'HOLDER_CONCENTRATION_SHIFT',
        message: `Top-10 holder concentration ${direction} ${Math.abs(delta * 100).toFixed(1)}pp`,
        details: {
          previousPct: Number(previous.top10Pct),
          latestPct: Number(latest.top10Pct),
          delta,
        },
      },
    });
    return 1;
  }

  private async checkVolumeSpike(
    tokenId: string,
    poolId?: string,
  ): Promise<number> {
    if (!poolId) return 0;
    const db = getDb();
    const [latest, previous] = await db.pairSnapshot.findMany({
      where: { poolId },
      orderBy: { ts: 'desc' },
      take: 2,
    });
    if (!latest || !previous) return 0;

    const prevVolume = Number(previous.volume1h);
    const latestVolume = Number(latest.volume1h);
    if (
      prevVolume <= 0 ||
      latestVolume < prevVolume * MonitoringService.VOLUME_SPIKE_MULTIPLIER
    )
      return 0;
    if (await this.withinCooldown(tokenId, 'VOLUME_SPIKE')) return 0;

    const multiple = (latestVolume / prevVolume).toFixed(1);
    await db.alert.create({
      data: {
        tokenId,
        type: 'VOLUME_SPIKE',
        message: `1h volume jumped ${multiple}x`,
        details: { previousVolume1h: prevVolume, latestVolume1h: latestVolume },
      },
    });
    return 1;
  }

  private async checkUnusualBurns(tokenId: string): Promise<number> {
    const db = getDb();
    const since = new Date(Date.now() - 10 * 60_000); // this cron's own interval — "new since last run"
    const recentBurns = await db.burn.findMany({
      where: { tokenId, attributed: true, burnedAt: { gte: since } },
    });
    if (recentBurns.length === 0) return 0;
    // No cooldown here by design — each burn is its own newsworthy event, not a sustained condition like the others.

    let created = 0;
    for (const burn of recentBurns) {
      await db.alert.create({
        data: {
          tokenId,
          type: 'UNUSUAL_BURN',
          message: `Deployer/treasury burned ${Number(burn.amount).toLocaleString()} tokens`,
          details: { amount: Number(burn.amount), txHash: burn.txHash },
        },
      });
      created++;
    }
    return created;
  }

  private async checkAuthorityChange(tokenId: string): Promise<number> {
    const db = getDb();
    const [latest, previous] = await db.tokenAuthorityCheck.findMany({
      where: { tokenId },
      orderBy: { checkedAt: 'desc' },
      take: 2,
    });
    if (!latest || !previous) return 0;

    const changed =
      latest.mintAuthorityActive !== previous.mintAuthorityActive ||
      latest.freezeAuthorityActive !== previous.freezeAuthorityActive ||
      latest.lpLocked !== previous.lpLocked;
    if (!changed) return 0;
    if (await this.withinCooldown(tokenId, 'AUTHORITY_CHANGE')) return 0;

    // LP going from locked to unlocked, or an authority coming back active, is the dangerous direction.
    const gotWorse =
      (previous.lpLocked && !latest.lpLocked) ||
      (!previous.mintAuthorityActive && latest.mintAuthorityActive) ||
      (!previous.freezeAuthorityActive && latest.freezeAuthorityActive);

    await db.alert.create({
      data: {
        tokenId,
        type: 'AUTHORITY_CHANGE',
        message: gotWorse
          ? 'Authority/LP-lock status got WORSE since the last check'
          : 'Authority/LP-lock status changed since the last check',
        details: {
          previous: {
            mintAuthorityActive: previous.mintAuthorityActive,
            freezeAuthorityActive: previous.freezeAuthorityActive,
            lpLocked: previous.lpLocked,
          },
          latest: {
            mintAuthorityActive: latest.mintAuthorityActive,
            freezeAuthorityActive: latest.freezeAuthorityActive,
            lpLocked: latest.lpLocked,
          },
        },
      },
    });
    return 1;
  }

  private async checkKolCoordination(tokenId: string): Promise<number> {
    const db = getDb();
    const since = new Date(Date.now() - 60 * 60_000); // rolling 60-min window, per the spec's own wording
    const recentBuys = await db.kolTrade.findMany({
      where: { tokenId, side: 'buy', tradedAt: { gte: since } },
    });
    const distinctWallets = new Set(recentBuys.map((t) => t.kolWallet));
    if (distinctWallets.size < MonitoringService.KOL_COORDINATION_THRESHOLD)
      return 0;
    if (await this.withinCooldown(tokenId, 'KOL_COORDINATION')) return 0;

    await db.alert.create({
      data: {
        tokenId,
        type: 'KOL_COORDINATION',
        message: `${distinctWallets.size} KOLs bought this token in the last hour`,
        details: {
          distinctKolCount: distinctWallets.size,
          tradeCount: recentBuys.length,
        },
      },
    });
    return 1;
  }
}

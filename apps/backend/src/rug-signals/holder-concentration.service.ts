import { Logger } from '../lib/logger';
import {
  INCINERATOR_ADDRESS,
  classifyHolders,
  getDb,
  getHolderCount,
  getTokenLargestAccounts,
  getTokenSupply,
} from '@clawdex/shared';

/**
 * top10Pct = sum(top 10 largest NON-EXCLUDED holder balances) / total supply,
 * the usual "top holders excluding LP" convention. Excluded holders are
 * program-controlled owners (a pump.fun bonding curve, AMM vaults), known pool
 * addresses and the incinerator; counting them made every legitimate token
 * look concentrated. The denominator stays the total supply so a token with a
 * tiny float is not reported as 100% concentrated. Both getTokenLargestAccounts and getTokenSupply are standard,
 * stable SPL Token RPC methods — high confidence, not a heuristic.
 *
 * holderCount comes from Helius DAS getTokenAccounts (was previously left null;
 * the old note below explains why the SPL-only path could not provide it).
 * Historic note: holderCount is NOT computed from getTokenLargestAccounts — getTokenLargestAccounts only returns
 * up to 20 accounts, not a total count. Getting an exact unique-holder count
 * needs getProgramAccounts filtered by mint, which is a heavier, rate-limit-
 * sensitive call. Left null rather than faked; a real implementation is a
 * follow-up, not this pass.
 */
export class HolderConcentrationService {
  private readonly logger = new Logger(HolderConcentrationService.name);

  async checkAll() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      this.logger.warn(
        'SOLANA_RPC_URL not set — skipping holder concentration checks',
      );
      return;
    }

    const db = getDb();
    const tokens = await db.token.findMany({ include: { pools: true } });
    let checked = 0;

    for (const token of tokens) {
      try {
        await this.checkOne(token, rpcUrl);
        checked++;
      } catch (err) {
        this.logger.error(
          `Holder check failed for ${token.mint}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Holder-concentration-checked ${checked}/${tokens.length} tokens`,
    );
  }

  async checkOne(
    token: { id: string; mint: string; pools?: Array<{ address: string }> },
    rpcUrl: string,
  ) {
    const db = getDb();
    const [largest, supply, holderCount] = await Promise.all([
      getTokenLargestAccounts(token.mint, rpcUrl),
      getTokenSupply(token.mint, rpcUrl),
      // Null on a non-Helius RPC: the column stays unset rather than wrong.
      getHolderCount(token.mint, rpcUrl).catch(() => null),
    ]);

    if (!supply || Number(supply) === 0 || largest.length === 0) {
      this.logger.warn(`No supply/holder data for ${token.mint} — skipping`);
      return;
    }

    const classified = await classifyHolders(largest, rpcUrl);
    const poolAddresses = new Set((token.pools ?? []).map((p) => p.address));
    const isExcluded = (c: (typeof classified)[number]) =>
      c.programControlled ||
      (c.owner !== null &&
        (c.owner === INCINERATOR_ADDRESS || poolAddresses.has(c.owner))) ||
      poolAddresses.has(c.address);

    const top10 = classified.filter((c) => !isExcluded(c)).slice(0, 10);
    const top10Sum = top10.reduce((acc, a) => acc + Number(a.amount), 0);
    const top10Pct = top10Sum / Number(supply);

    await db.holderSnapshot.create({
      data: {
        tokenId: token.id,
        holderCount,
        top10Pct: String(top10Pct),
        topHolders: classified.map((c) => ({ ...c, excluded: isExcluded(c) })),
      },
    });
  }
}

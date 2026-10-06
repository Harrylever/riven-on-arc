import { Logger } from '../lib/logger';
import { getDb, resolveTokenByMint } from '@clawdex/shared';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuthorityCheckerService } from '../rug-signals/authority-checker.service';
import { HolderConcentrationService } from '../rug-signals/holder-concentration.service';

/** Helius "enhanced" webhook transaction shape — the parts we actually read. */
interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  source?: string;
  tokenTransfers?: Array<{
    mint: string;
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: number;
  }>;
  accountData?: Array<{
    account: string;
    tokenBalanceChanges?: Array<{
      mint: string;
      userAccount: string;
      rawTokenAmount?: { tokenAmount: string; decimals: number };
    }>;
  }>;
}

/**
 * Parses Helius enhanced-webhook payloads for pump.fun / Raydium LaunchLab
 * "new token created" transactions and upserts them into `tokens`.
 *
 * ⚠️ UNVALIDATED AGAINST REAL PAYLOADS. Built from Helius's generally
 * documented enhanced-transaction shape (tokenTransfers / accountData with
 * tokenBalanceChanges), not from a captured real pump.fun/LaunchLab create
 * event. Set DEBUG_SAVE_WEBHOOK_PAYLOADS=true to write every payload this
 * receives to fixtures/helius-webhook-samples/ — capture a handful of real
 * ones and fix the extraction heuristics below (`extractNewMint`) against
 * what Helius actually sends before trusting this in production.
 */
export class LaunchIngestService {
  private readonly logger = new Logger(LaunchIngestService.name);

  constructor(
    private readonly authorityChecker: AuthorityCheckerService,
    private readonly holderConcentration: HolderConcentrationService,
  ) {}

  async ingestHeliusTransactions(
    transactions: HeliusEnhancedTransaction[],
    options: { defaultLaunchpad: 'PUMPFUN' | 'LAUNCHLAB' | 'OTHER' },
  ) {
    if (process.env.DEBUG_SAVE_WEBHOOK_PAYLOADS === 'true') {
      await this.savePayloadForDebugging(transactions);
    }

    const db = getDb();

    for (const tx of transactions) {
      const mint = this.extractNewMint(tx);
      if (!mint) {
        this.logger.warn(
          `Could not extract a mint from tx ${tx.signature} — skipping`,
        );
        continue;
      }

      const deployerWallet =
        tx.tokenTransfers?.[0]?.toUserAccount ??
        tx.accountData?.[0]?.account ??
        'unknown';

      const token = await db.token.upsert({
        where: { mint },
        update: {},
        create: {
          mint,
          name: 'Unknown', // Helius enhanced payloads don't reliably include on-chain metadata name/symbol —
          symbol: '???', //  backfill via resolveTokenByMint (Helius getAsset) in a follow-up pass, not here.
          deployerWallet,
          initialSupply: '0', // same — needs a getAsset follow-up call to fill in accurately.
          launchTime: new Date(tx.timestamp * 1000),
          launchpad:
            this.mapSourceToLaunchpad(tx.source) ?? options.defaultLaunchpad,
          discoveredVia: 'HELIUS_WEBHOOK',
        },
        include: { pools: true },
      });

      this.logger.log(`Ingested launch: ${mint} (tx ${tx.signature})`);

      const rpcUrl = process.env.SOLANA_RPC_URL;
      if (rpcUrl) {
        // Background call to resolveTokenByMint immediately so token doesn't stay 'Unknown'
        resolveTokenByMint(mint, rpcUrl, true).catch((err) => {
          this.logger.warn(
            `Initial metadata resolution failed for ${mint}: ${(err as Error).message}`,
          );
        });

        Promise.allSettled([
          this.authorityChecker.checkOne(token, rpcUrl),
          this.holderConcentration.checkOne(token, rpcUrl),
        ]).catch((err) => {
          this.logger.error(
            `Initial checks failed for ${mint}: ${(err as Error).message}`,
          );
        });
      }
    }
  }

  async backfillPendingMetadata() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) return;

    const db = getDb();
    const pending = await db.token.findMany({
      where: {
        OR: [{ name: 'Unknown' }, { symbol: '???' }],
      },
      take: 20,
    });

    for (const token of pending) {
      try {
        await resolveTokenByMint(token.mint, rpcUrl, true);
        this.logger.log(`Backfilled metadata for ${token.mint}`);
      } catch (err) {
        this.logger.warn(
          `Backfill failed for ${token.mint}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Helius populates `source` with a known program identifier on many enhanced
   * transactions (e.g. "PUMP_FUN"). Unverified for LaunchLab specifically —
   * falls back to the webhook's own `defaultLaunchpad` when absent/unrecognized. */
  private mapSourceToLaunchpad(
    source?: string,
  ): 'PUMPFUN' | 'LAUNCHLAB' | null {
    if (!source) return null;
    if (source === 'PUMP_FUN') return 'PUMPFUN';
    if (source === 'RAYDIUM' || source === 'RAYDIUM_LAUNCHLAB')
      return 'LAUNCHLAB';
    return null;
  }

  /**
   * Best-effort: the first token mint that appears in tokenTransfers, or
   * failing that, the first mint in accountData's tokenBalanceChanges.
   * This is a heuristic, not a verified parse of pump.fun's actual create
   * instruction — see the class-level TODO.
   */
  private extractNewMint(tx: HeliusEnhancedTransaction): string | null {
    if (tx.tokenTransfers?.[0]?.mint) return tx.tokenTransfers[0].mint;

    for (const account of tx.accountData ?? []) {
      const change = account.tokenBalanceChanges?.[0];
      if (change?.mint) return change.mint;
    }

    return null;
  }

  private async savePayloadForDebugging(transactions: unknown) {
    const dir = join(
      process.cwd(),
      '..',
      '..',
      'fixtures',
      'helius-webhook-samples',
    );
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${Date.now()}.json`);
    await writeFile(file, JSON.stringify(transactions, null, 2));
    this.logger.debug(`Saved webhook payload to ${file}`);
  }
}

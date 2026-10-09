import { Logger } from '../lib/logger';
import { getDb, INCINERATOR_ADDRESS } from '@riven/shared';

interface HeliusBurnTransaction {
  signature: string;
  timestamp: number;
  type?: string;
  tokenTransfers?: Array<{
    mint: string;
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: number;
  }>;
}

/**
 * Ingests burn signals from two distinct sources, both counted as burns:
 * 1. A genuine Helius `type: "BURN"` transaction (real SPL Token Burn
 *    instruction — reduces total supply).
 * 2. A transfer to the incinerator address (does NOT reduce total supply on
 *    chain, but functionally removes tokens from circulation — see
 *    packages/shared/src/chain/splToken.ts's note on this distinction).
 *
 * `attributed` = the burn came from the token's own deployer/treasury
 * wallet, not an arbitrary holder (blueprint gap #3 — this is what makes the
 * burn score hard to fake).
 *
 * ⚠️ UNVALIDATED against a real captured burn payload, same caveat as
 * phase 1/2 — Helius's exact `type`/field shape for a burn is assumed, not
 * confirmed. Use DEBUG_SAVE_WEBHOOK_PAYLOADS to check against reality.
 */
export class BurnIngestService {
  private readonly logger = new Logger(BurnIngestService.name);

  async ingestBurn(tx: HeliusBurnTransaction) {
    const transfer = tx.tokenTransfers?.[0];
    if (!transfer?.mint || !transfer.tokenAmount) {
      this.logger.warn(
        `Burn tx ${tx.signature} missing transfer data — skipping`,
      );
      return;
    }

    const isGenuineBurn = tx.type === 'BURN';
    const isIncineratorTransfer =
      transfer.toUserAccount === INCINERATOR_ADDRESS;
    if (!isGenuineBurn && !isIncineratorTransfer) {
      return; // not actually a burn signal
    }

    const db = getDb();
    const token = await db.token.findUnique({ where: { mint: transfer.mint } });
    if (!token) {
      this.logger.warn(`Burn for undetected token ${transfer.mint} — skipping`);
      return;
    }

    const wallet = transfer.fromUserAccount ?? 'unknown';
    const attributed = wallet === token.deployerWallet;

    await db.burn.upsert({
      where: { txHash: tx.signature },
      update: {},
      create: {
        tokenId: token.id,
        wallet,
        amount: String(transfer.tokenAmount),
        attributed,
        burnedAt: new Date(tx.timestamp * 1000),
        txHash: tx.signature,
      },
    });

    this.logger.log(
      `Ingested ${attributed ? 'attributed' : 'unattributed'} burn for ${transfer.mint} (tx ${tx.signature})`,
    );
  }
}

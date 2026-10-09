import { Logger } from '../lib/logger';
import { getDb } from '@riven/shared';

interface HeliusSwapTransaction {
  signature: string;
  timestamp: number;
  feePayer?: string;
  tokenTransfers?: Array<{
    mint: string;
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: number;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number; // lamports
  }>;
}

/**
 * Ingests SWAP-type Helius transactions into `Trade` rows, lazily creating a
 * `Pool` the first time we see a given pool address for a token.
 *
 * Price per trade (solAmount / tokenAmount) is exact — derived straight from
 * the transfer amounts in the transaction, no account-layout parsing needed.
 */
export class SwapIngestService {
  private readonly logger = new Logger(SwapIngestService.name);

  async ingestSwap(
    tx: HeliusSwapTransaction,
    venue: 'PUMPFUN_CURVE' | 'PUMPSWAP' | 'LAUNCHLAB' | 'OTHER',
  ) {
    const tokenTransfer = tx.tokenTransfers?.[0];
    const nativeTransfer = tx.nativeTransfers?.[0];

    if (
      !tokenTransfer?.mint ||
      !tokenTransfer.tokenAmount ||
      !nativeTransfer?.amount
    ) {
      this.logger.warn(
        `Swap tx ${tx.signature} missing transfer data — skipping`,
      );
      return;
    }

    const db = getDb();
    const token = await db.token.findUnique({
      where: { mint: tokenTransfer.mint },
      include: { pools: true },
    });
    if (!token) {
      this.logger.warn(
        `Swap for undetected token ${tokenTransfer.mint} — skipping`,
      );
      return;
    }

    // 1. Resolve the actual pool address:
    // - For pump.fun: the bonding curve address (from Pool table where venue = PUMPFUN_CURVE).
    // - For AMMs: match fromUserAccount or toUserAccount against known pool addresses.
    let poolAddress: string | null = null;
    let side: 'buy' | 'sell' | null = null;
    let wallet = 'unknown';

    const fromAccount = tokenTransfer.fromUserAccount;
    const toAccount = tokenTransfer.toUserAccount;

    // Check against known pools for this token
    let knownPool = token.pools.find(
      (p) => p.address === fromAccount || p.address === toAccount,
    );

    // If venue is PUMPFUN_CURVE and bonding curve pool exists in DB
    if (!knownPool && venue === 'PUMPFUN_CURVE') {
      knownPool = token.pools.find((p) => p.venue === 'PUMPFUN_CURVE');
    }

    // If still not found, check global DB pool table
    if (!knownPool) {
      const candidates = [fromAccount, toAccount].filter(Boolean) as string[];
      if (candidates.length > 0) {
        knownPool =
          (await db.pool.findFirst({
            where: { address: { in: candidates }, tokenId: token.id },
          })) ?? undefined;
      }
    }

    if (knownPool) {
      poolAddress = knownPool.address;
      if (toAccount === knownPool.address) {
        // Trader sending tokens TO pool -> sell
        side = 'sell';
        wallet = fromAccount ?? 'unknown';
      } else if (fromAccount === knownPool.address) {
        // Trader receiving tokens FROM pool -> buy
        side = 'buy';
        wallet = toAccount ?? 'unknown';
      }
    }

    // Fallback: If neither matches a known pool, check SOL transfer flow against feePayer / trader wallet
    if (!side || !poolAddress) {
      this.logger.debug(
        `Neither counterparty in tx ${tx.signature} matched a known pool for ${token.mint} — checking SOL flow`,
      );

      const solFrom = nativeTransfer.fromUserAccount;
      const solTo = nativeTransfer.toUserAccount;
      const feePayer = tx.feePayer;

      if (toAccount && (toAccount === solFrom || toAccount === feePayer)) {
        // toAccount paid SOL and received tokens -> buy
        side = 'buy';
        wallet = toAccount;
        poolAddress = fromAccount ?? solTo ?? 'unknown';
      } else if (
        fromAccount &&
        (fromAccount === solTo || fromAccount === feePayer)
      ) {
        // fromAccount sent tokens and received SOL -> sell
        side = 'sell';
        wallet = fromAccount;
        poolAddress = toAccount ?? solFrom ?? 'unknown';
      } else if (solFrom && feePayer && solFrom === feePayer) {
        // Fee payer sent SOL -> buy
        side = 'buy';
        wallet = feePayer;
        poolAddress = fromAccount ?? 'unknown';
      } else if (solTo && feePayer && solTo === feePayer) {
        // Fee payer received SOL -> sell
        side = 'sell';
        wallet = feePayer;
        poolAddress = toAccount ?? 'unknown';
      } else {
        this.logger.debug(
          `Could not reliably determine swap side for tx ${tx.signature} — skipped to avoid corrupting ratios`,
        );
        return;
      }
    }

    const pool = await db.pool.upsert({
      where: { address: poolAddress },
      update: {},
      create: { address: poolAddress, tokenId: token.id, venue },
    });

    const solAmount = nativeTransfer.amount / 1e9;
    const tokenAmount = tokenTransfer.tokenAmount;

    await db.trade.upsert({
      where: { signature: tx.signature },
      update: {},
      create: {
        signature: tx.signature,
        poolId: pool.id,
        ts: new Date(tx.timestamp * 1000),
        side,
        wallet,
        solAmount: String(solAmount),
        tokenAmount: String(tokenAmount),
      },
    });

    this.logger.log(
      `Ingested ${side} trade for ${tokenTransfer.mint}: ${solAmount} SOL (tx ${tx.signature})`,
    );
  }
}

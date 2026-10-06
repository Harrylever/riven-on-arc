import { Logger } from '../lib/logger';
import { deriveBondingCurve, getDb, readBondingCurves } from '@clawdex/shared';

interface ClawPumpToken {
  mintAddress?: string;
  imageUrl?: string;
  mint?: string;
  address?: string;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  creator?: string;
  creatorWallet?: string;
  supply?: number;
  createdAt?: string;
}

/**
 * ClawPump is NOT a separate on-chain program — it launches tokens through
 * pump.fun's own program, with ClawPump creating/controlling a per-launch
 * creator wallet (confirmed via clawpump.tech/docs: "ClawPump creates and
 * controls the creator wallet"). There's no shared address to filter
 * on-chain, so detection goes through their public API instead.
 *
 * Verified 2026-09-21 against https://clawpump.tech/api/tokens (public, no auth):
 * returns { tokens: [{ mintAddress, name, symbol, imageUrl (relative path),
 * createdAt, launchPlatform, marketCap, price, volume24h, liquidity, ... }] }.
 * It exposes no creator wallet, so deployerWallet is stored as 'unknown'.
 * (The docs' /api/health returns 404; do not use it as a liveness check.)
 */
export class ClawPumpPollerService {
  private readonly logger = new Logger(ClawPumpPollerService.name);

  async pollNewLaunches() {
    const baseUrl = process.env.CLAWPUMP_API_BASE_URL;
    if (!baseUrl) {
      this.logger.warn(
        'CLAWPUMP_API_BASE_URL not set — skipping ClawPump poll',
      );
      return;
    }

    let tokens: ClawPumpToken[];
    try {
      const res = await fetch(`${baseUrl}/api/tokens?sort=new&limit=50`);
      if (!res.ok) {
        this.logger.error(`ClawPump /api/tokens failed: ${res.status}`);
        return;
      }
      const data = (await res.json()) as
        | ClawPumpToken[]
        | { tokens?: ClawPumpToken[]; results?: ClawPumpToken[] };
      tokens = Array.isArray(data) ? data : (data.tokens ?? data.results ?? []);
    } catch (err) {
      this.logger.error(
        `ClawPump /api/tokens fetch threw: ${(err as Error).message}`,
      );
      return;
    }

    const db = getDb();
    let ingested = 0;

    for (const t of tokens) {
      try {
        const mint = t.mintAddress ?? t.mint ?? t.address ?? t.tokenAddress;
        if (!mint) continue;

        await db.token.upsert({
          where: { mint },
          update: {},
          create: {
            mint,
            name: t.name ?? 'Unknown',
            symbol: t.symbol ?? '???',
            imageUri: t.imageUrl
              ? new URL(t.imageUrl, baseUrl).toString()
              : null,
            deployerWallet: t.creator ?? t.creatorWallet ?? 'unknown',
            initialSupply: String(t.supply ?? 0),
            launchTime: t.createdAt ? new Date(t.createdAt) : new Date(),
            launchpad: 'CLAWPUMP',
            discoveredVia: 'CLAWPUMP_POLLER',
          },
        });

        ingested++;
      } catch (err) {
        // One malformed token must not drop the rest of this poll's batch.
        this.logger.error(
          `Failed to upsert ClawPump token ${t.mintAddress ?? t.mint ?? t.address ?? '?'}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `ClawPump poll: checked ${tokens.length} tokens, upserted ${ingested}`,
    );
    await this.attachBondingCurves();
  }

  /**
   * ClawPump launches settle on pump.fun's bonding curve. For every ClawPump token
   * without a pool, derive the curve address locally (a PDA of the mint), confirm
   * the account exists on chain in one batched RPC read, record it as the token's
   * pool, and take the real creator wallet from the curve account. No dependency
   * on pump.fun's rate-limited HTTP API.
   */
  private async attachBondingCurves() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) return;
    const db = getDb();
    const pending = await db.token.findMany({
      where: { launchpad: 'CLAWPUMP', pools: { none: {} } },
      select: { id: true, mint: true, deployerWallet: true },
      take: 300,
    });
    if (pending.length === 0) return;

    const curveByMint = new Map(
      pending.map((t) => [t.mint, deriveBondingCurve(t.mint)]),
    );
    let states;
    try {
      states = await readBondingCurves([...curveByMint.values()], rpcUrl);
    } catch (err) {
      this.logger.error(`Bonding-curve read failed: ${(err as Error).message}`);
      return;
    }

    let attached = 0;
    for (const t of pending) {
      const curve = curveByMint.get(t.mint)!;
      const state = states.get(curve);
      if (!state) continue;
      try {
        await db.pool.upsert({
          where: { address: curve },
          update: {},
          create: {
            address: curve,
            tokenId: t.id,
            venue: 'PUMPFUN_CURVE',
            quoteMint: 'So11111111111111111111111111111111111111112',
          },
        });
        if (t.deployerWallet === 'unknown' && state.creator) {
          await db.token.update({
            where: { id: t.id },
            data: { deployerWallet: state.creator },
          });
        }
        attached++;
      } catch (err) {
        this.logger.error(
          `Failed to attach curve for ${t.mint}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Bonding curves: ${attached} of ${pending.length} unpooled ClawPump tokens attached`,
    );
  }
}

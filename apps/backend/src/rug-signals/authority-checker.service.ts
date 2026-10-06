import { Logger } from '../lib/logger';
import {
  base58Encode,
  classifyHolders,
  getDb,
  getParsedMint,
  getTokenLargestAccounts,
  getTokenSupply,
  INCINERATOR_ADDRESS,
  rpcCall,
} from '@clawdex/shared';

const LOCKER_PROGRAMS = new Set([
  'strmDQftQGddKoGV9fMkFDmLRCNFypJ5nWTS23j9886', // Streamflow
  'UNCL5Qz2WJjYn3U8oTq7dYy3z5E1T7bK9oE8gL2sK3p', // UNCX
  'LockrChL2F74mZfdmEp9vQzcx5b9K3tGjb4r2Kk1k5L', // Raydium lock
]);

const BURN_ADDRESSES = new Set([
  INCINERATOR_ADDRESS,
  '11111111111111111111111111111111',
]);

/**
 * Mint/freeze authority: standard SPL Token `getAccountInfo` jsonParsed read.
 * High confidence — this is a stable, well-documented RPC shape.
 *
 * LP lock:
 * - PUMPFUN_CURVE: liquidity is held directly by bonding curve, locked by construction.
 * - AMM Pools: resolves LP mint, checks supply == 0 or held by incinerator / known lockers.
 */
export class AuthorityCheckerService {
  private readonly logger = new Logger(AuthorityCheckerService.name);

  async checkAll() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      this.logger.warn('SOLANA_RPC_URL not set — skipping authority checks');
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
          `Authority check failed for ${token.mint}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Authority-checked ${checked}/${tokens.length} tokens`);
  }

  async checkOne(
    token: {
      id: string;
      mint: string;
      pools?: Array<{ address: string; venue: string }>;
    },
    rpcUrl: string,
  ) {
    const mintInfo = await getParsedMint(token.mint, rpcUrl);
    if (!mintInfo) {
      this.logger.warn(`No mint account found for ${token.mint}`);
      return;
    }

    const pools = token.pools ?? [];
    if (pools.length === 0) return;

    const bondingCurvePool = pools.find((p) => p.venue === 'PUMPFUN_CURVE');
    const ammPool = pools.find((p) => p.venue !== 'PUMPFUN_CURVE');

    let lpLocked = false;
    let lpLockMethod: string | null = null;

    if (bondingCurvePool && !ammPool) {
      lpLocked = true;
      lpLockMethod = 'bonding_curve_no_lp_token';
    } else if (ammPool) {
      const result = await this.checkAmmLpLock(ammPool.address, rpcUrl);
      lpLocked = result.locked;
      lpLockMethod = result.method;
    }

    const db = getDb();
    await db.tokenAuthorityCheck.create({
      data: {
        tokenId: token.id,
        mintAuthorityActive: mintInfo.mintAuthority !== null,
        freezeAuthorityActive: mintInfo.freezeAuthority !== null,
        lpLocked,
        lpLockMethod,
      },
    });
  }

  private async checkAmmLpLock(
    poolAddress: string,
    rpcUrl: string,
  ): Promise<{ locked: boolean; method: string }> {
    try {
      const lpMint = await this.resolveLpMint(poolAddress, rpcUrl);
      if (!lpMint) {
        return { locked: false, method: 'unknown' };
      }

      const supplyStr = await getTokenSupply(lpMint, rpcUrl);
      if (supplyStr === null) {
        return { locked: false, method: 'unknown' };
      }

      const supply = Number(supplyStr);
      // a) LP mint supply is 0: burned completely
      if (supply === 0) {
        return { locked: true, method: 'burned_supply_zero' };
      }

      const largest = await getTokenLargestAccounts(lpMint, rpcUrl);
      if (largest.length === 0) {
        return { locked: false, method: 'unknown' };
      }

      const classified = await classifyHolders(largest, rpcUrl);
      let burnedAmount = 0;
      let lockedAmount = 0;
      let lockerUsed: string | null = null;

      for (const holder of classified) {
        const amt = Number(holder.amount);
        const owner = holder.owner;
        const programOwner = holder.programOwner;

        if (
          (owner && BURN_ADDRESSES.has(owner)) ||
          BURN_ADDRESSES.has(holder.address)
        ) {
          burnedAmount += amt;
        } else if (owner && LOCKER_PROGRAMS.has(owner)) {
          lockedAmount += amt;
          lockerUsed = owner;
        } else if (programOwner && LOCKER_PROGRAMS.has(programOwner)) {
          lockedAmount += amt;
          lockerUsed = programOwner;
        }
      }

      const secured = burnedAmount + lockedAmount;
      if (supply > 0 && secured / supply >= 0.5) {
        if (burnedAmount >= lockedAmount) {
          return { locked: true, method: 'incinerator' };
        }
        let method = 'locker';
        if (lockerUsed === 'strmDQftQGddKoGV9fMkFDmLRCNFypJ5nWTS23j9886')
          method = 'streamflow';
        else if (lockerUsed === 'UNCL5Qz2WJjYn3U8oTq7dYy3z5E1T7bK9oE8gL2sK3p')
          method = 'uncx';
        else if (lockerUsed === 'LockrChL2F74mZfdmEp9vQzcx5b9K3tGjb4r2Kk1k5L')
          method = 'raydium_lock';
        return { locked: true, method };
      }

      return { locked: false, method: 'unlocked' };
    } catch (err) {
      this.logger.warn(
        `Failed AMM LP lock check for pool ${poolAddress}: ${(err as Error).message}`,
      );
      return { locked: false, method: 'unknown' };
    }
  }

  private async resolveLpMint(
    poolAddress: string,
    rpcUrl: string,
  ): Promise<string | null> {
    try {
      const account = await rpcCall<{
        owner: string;
        data?:
          | [string, string]
          | { parsed?: { info?: { lpMint?: string; mint?: string } } };
      }>(rpcUrl, 'getAccountInfo', [poolAddress, { encoding: 'jsonParsed' }]);

      if (!account) return null;

      if (
        account.data &&
        typeof account.data === 'object' &&
        !Array.isArray(account.data)
      ) {
        const parsedLp =
          account.data.parsed?.info?.lpMint || account.data.parsed?.info?.mint;
        if (parsedLp) return parsedLp;
      }

      let rawBuf: Buffer | null = null;
      if (Array.isArray(account.data) && account.data[0]) {
        rawBuf = Buffer.from(account.data[0], 'base64');
      } else {
        const rawAccount = await rpcCall<{
          data?: [string, string];
          owner: string;
        }>(rpcUrl, 'getAccountInfo', [poolAddress, { encoding: 'base64' }]);
        if (
          rawAccount?.data &&
          Array.isArray(rawAccount.data) &&
          rawAccount.data[0]
        ) {
          rawBuf = Buffer.from(rawAccount.data[0], 'base64');
        }
      }

      if (rawBuf) {
        // Raydium AMM V4 (752 bytes, lpMint at offset 464-496)
        if (rawBuf.length >= 496) {
          const lpBytes = rawBuf.subarray(464, 496);
          const candidate = base58Encode(new Uint8Array(lpBytes));
          const mint = await getParsedMint(candidate, rpcUrl);
          if (mint) return candidate;
        }
        // Raydium CPMM (637 bytes, lpMint at offset 200-232)
        if (rawBuf.length >= 232) {
          const lpBytes = rawBuf.subarray(200, 232);
          const candidate = base58Encode(new Uint8Array(lpBytes));
          const mint = await getParsedMint(candidate, rpcUrl);
          if (mint) return candidate;
        }
        // Meteora / PumpSwap (lpMint at offset 8-40)
        if (rawBuf.length >= 40) {
          const lpBytes = rawBuf.subarray(8, 40);
          const candidate = base58Encode(new Uint8Array(lpBytes));
          const mint = await getParsedMint(candidate, rpcUrl);
          if (mint) return candidate;
        }
      }

      const directMint = await getParsedMint(poolAddress, rpcUrl);
      if (directMint) return poolAddress;

      return null;
    } catch {
      return null;
    }
  }
}

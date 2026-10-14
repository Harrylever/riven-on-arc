-- Pools on Uniswap v3 get their own venue so the scorer can read them (price, real USDC, who holds the liquidity).
-- Existing "OTHER" pools are moved by scripts/backfill-pool-venue.ts: a new enum value cannot be used in the
-- migration that adds it.
ALTER TYPE "pool_venue" ADD VALUE 'UNISWAP_V3';

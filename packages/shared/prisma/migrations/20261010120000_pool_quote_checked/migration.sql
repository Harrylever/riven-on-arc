-- Arc's USDC exists twice: the ERC-20 (6 decimals) and the native gas coin (18).
-- A Uniswap v4 pool quotes one of them, and amounts differ by 10^12. Pools found
-- before this was tracked were all recorded as ERC-20; the backend verifies each
-- against the PositionManager registry and flips this once it has.
ALTER TABLE "pools" ADD COLUMN "quote_checked" BOOLEAN NOT NULL DEFAULT false;

-- Arc scoring: launch provenance, LP position tracking, holder balances, swaps, score breakdown.
ALTER TABLE "tokens" ADD COLUMN "launch_tx_hash" TEXT;
ALTER TABLE "tokens" ADD COLUMN "launch_block" BIGINT;

ALTER TABLE "pools" ADD COLUMN "position_id" TEXT;
ALTER TABLE "pools" ADD COLUMN "excluded_holders" JSONB;
ALTER TABLE "pools" ADD COLUMN "lp_removed_at" TIMESTAMP(3);

ALTER TABLE "score_runs" ADD COLUMN "band" TEXT;
ALTER TABLE "score_runs" ADD COLUMN "signals" JSONB;
ALTER TABLE "score_runs" ADD COLUMN "methodology" TEXT;

CREATE TABLE "arc_token_balances" (
    "token_id" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "arc_token_balances_pkey" PRIMARY KEY ("token_id","holder")
);
CREATE INDEX "arc_token_balances_token_id_balance_idx" ON "arc_token_balances"("token_id", "balance");
ALTER TABLE "arc_token_balances" ADD CONSTRAINT "arc_token_balances_token_id_fkey"
    FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "arc_swaps" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "block_number" BIGINT NOT NULL,
    "side" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "usdc_amount" DECIMAL(65,30) NOT NULL,
    "token_amount" DECIMAL(65,30) NOT NULL,
    "price_usd" DECIMAL(65,30),

    CONSTRAINT "arc_swaps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "arc_swaps_pool_id_ts_idx" ON "arc_swaps"("pool_id", "ts");
ALTER TABLE "arc_swaps" ADD CONSTRAINT "arc_swaps_pool_id_fkey"
    FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

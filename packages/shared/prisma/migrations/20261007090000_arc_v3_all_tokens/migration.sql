-- Riven v3: all Arc tokens (pool indexer + DexScreener market data), LP events, anti-rug alerts.
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'RUG_PULL';
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'CREATOR_DUMP';
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'WHALE_DUMP';
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'SCORE_DROP';
ALTER TYPE "discovery_source" ADD VALUE IF NOT EXISTS 'ARC_POOL_INDEXER';

ALTER TABLE "tokens" ADD COLUMN "creation_block" BIGINT;
ALTER TABLE "tokens" ADD COLUMN "holder_history" TEXT;

CREATE TABLE "arc_markets" (
    "token_id" TEXT NOT NULL,
    "pair_address" TEXT,
    "dex_url" TEXT,
    "price_usd" DECIMAL(65,30),
    "market_cap" DECIMAL(65,30),
    "fdv" DECIMAL(65,30),
    "liquidity_usd" DECIMAL(65,30),
    "volume_5m" DECIMAL(65,30),
    "volume_1h" DECIMAL(65,30),
    "volume_6h" DECIMAL(65,30),
    "volume_24h" DECIMAL(65,30),
    "change_5m" DECIMAL(65,30),
    "change_1h" DECIMAL(65,30),
    "change_6h" DECIMAL(65,30),
    "change_24h" DECIMAL(65,30),
    "buys_24h" INTEGER,
    "sells_24h" INTEGER,
    "image_url" TEXT,
    "socials" JSONB,
    "pair_created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arc_markets_pkey" PRIMARY KEY ("token_id")
);
CREATE INDEX "arc_markets_liquidity_usd_idx" ON "arc_markets"("liquidity_usd");
CREATE INDEX "arc_markets_volume_24h_idx" ON "arc_markets"("volume_24h");
ALTER TABLE "arc_markets" ADD CONSTRAINT "arc_markets_token_id_fkey"
    FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "arc_lp_events" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "position_id" TEXT,
    "liquidity_delta" DECIMAL(65,30) NOT NULL,
    "block_number" BIGINT NOT NULL,

    CONSTRAINT "arc_lp_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "arc_lp_events_pool_id_idx" ON "arc_lp_events"("pool_id");
ALTER TABLE "arc_lp_events" ADD CONSTRAINT "arc_lp_events_pool_id_fkey"
    FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

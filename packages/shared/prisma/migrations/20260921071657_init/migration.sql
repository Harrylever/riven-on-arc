-- CreateEnum
CREATE TYPE "launchpad" AS ENUM ('PUMPFUN', 'LAUNCHLAB', 'CLAWPUMP', 'OTHER');

-- CreateEnum
CREATE TYPE "discovery_source" AS ENUM ('HELIUS_WEBHOOK', 'CLAWPUMP_POLLER', 'ON_DEMAND_RESOLUTION');

-- CreateEnum
CREATE TYPE "pool_venue" AS ENUM ('PUMPFUN_CURVE', 'PUMPSWAP', 'LAUNCHLAB', 'OTHER');

-- CreateEnum
CREATE TYPE "kol_source" AS ENUM ('MADEONSOL', 'SOLANA_TRACKER', 'MOCK');

-- CreateEnum
CREATE TYPE "alert_type" AS ENUM ('LIQUIDITY_DROP', 'HOLDER_CONCENTRATION_SHIFT', 'VOLUME_SPIKE', 'UNUSUAL_BURN', 'AUTHORITY_CHANGE', 'KOL_COORDINATION');

-- CreateTable
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "deployer_wallet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "image_uri" TEXT,
    "decimals" INTEGER,
    "metadata_uri" TEXT,
    "launchpad" "launchpad" NOT NULL DEFAULT 'OTHER',
    "discovered_via" "discovery_source" NOT NULL,
    "launch_time" TIMESTAMP(3) NOT NULL,
    "initial_supply" DECIMAL(65,30) NOT NULL,
    "current_price" DECIMAL(65,30),
    "market_cap" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pools" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "venue" "pool_venue" NOT NULL,
    "quote_mint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "migrated_at" TIMESTAMP(3),

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "signature" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "side" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "sol_amount" DECIMAL(65,30) NOT NULL,
    "token_amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("signature")
);

-- CreateTable
CREATE TABLE "pair_snapshots" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "price_sol" DECIMAL(65,30) NOT NULL,
    "price_usd" DECIMAL(65,30),
    "market_cap_usd" DECIMAL(65,30),
    "liquidity_usd" DECIMAL(65,30),
    "volume_5m" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "volume_1h" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "volume_24h" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "buys" INTEGER NOT NULL DEFAULT 0,
    "sells" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pair_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_authority_checks" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "mint_authority_active" BOOLEAN NOT NULL,
    "freeze_authority_active" BOOLEAN NOT NULL,
    "lp_locked" BOOLEAN NOT NULL,
    "lp_lock_method" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_authority_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holder_snapshots" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "holder_count" INTEGER,
    "top10_pct" DECIMAL(65,30) NOT NULL,
    "top_holders" JSONB NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holder_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kol_trades" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "kol_wallet" TEXT NOT NULL,
    "kol_name" TEXT,
    "token_mint" TEXT NOT NULL,
    "token_id" TEXT,
    "side" TEXT NOT NULL,
    "sol_amount" DECIMAL(65,30) NOT NULL,
    "market_cap_usd_at_trade" DECIMAL(65,30),
    "traded_at" TIMESTAMP(3) NOT NULL,
    "source" "kol_source" NOT NULL,

    CONSTRAINT "kol_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "burns" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "attributed" BOOLEAN NOT NULL DEFAULT false,
    "burned_at" TIMESTAMP(3) NOT NULL,
    "tx_hash" TEXT NOT NULL,

    CONSTRAINT "burns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_runs" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "score" DECIMAL(65,30) NOT NULL,
    "gate" DECIMAL(65,30) NOT NULL,
    "concentration" DECIMAL(65,30) NOT NULL,
    "burn_score" DECIMAL(65,30) NOT NULL,
    "liquidity_score" DECIMAL(65,30) NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" TEXT NOT NULL,
    "user_id_or_email" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "type" "alert_type" NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_logs" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount_sol" DECIMAL(65,30) NOT NULL,
    "score_at_entry" DECIMAL(65,30),
    "tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_mint_key" ON "tokens"("mint");

-- CreateIndex
CREATE UNIQUE INDEX "pools_address_key" ON "pools"("address");

-- CreateIndex
CREATE UNIQUE INDEX "kol_trades_signature_key" ON "kol_trades"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "burns_tx_hash_key" ON "burns"("tx_hash");

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pair_snapshots" ADD CONSTRAINT "pair_snapshots_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_authority_checks" ADD CONSTRAINT "token_authority_checks_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holder_snapshots" ADD CONSTRAINT "holder_snapshots_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kol_trades" ADD CONSTRAINT "kol_trades_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "burns" ADD CONSTRAINT "burns_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_runs" ADD CONSTRAINT "score_runs_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

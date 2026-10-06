-- CreateEnum
CREATE TYPE "perp_exchange" AS ENUM ('BYBIT', 'MEXC', 'BINANCE');

-- CreateEnum
CREATE TYPE "perp_bias" AS ENUM ('LONG', 'SHORT');

-- CreateTable
CREATE TABLE "perp_signals" (
    "id" TEXT NOT NULL,
    "exchange" "perp_exchange" NOT NULL,
    "symbol" TEXT NOT NULL,
    "bias" "perp_bias" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "entry_price" DECIMAL(65,30) NOT NULL,
    "entry_low" DECIMAL(65,30) NOT NULL,
    "entry_high" DECIMAL(65,30) NOT NULL,
    "stop_loss" DECIMAL(65,30) NOT NULL,
    "t1" DECIMAL(65,30) NOT NULL,
    "t2" DECIMAL(65,30) NOT NULL,
    "t3" DECIMAL(65,30) NOT NULL,
    "scan_time" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perp_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "perp_signals_scan_time_idx" ON "perp_signals"("scan_time");

-- CreateIndex
CREATE INDEX "perp_signals_symbol_idx" ON "perp_signals"("symbol");

-- CreateIndex
CREATE INDEX "perp_signals_exchange_symbol_bias_idx" ON "perp_signals"("exchange", "symbol", "bias");

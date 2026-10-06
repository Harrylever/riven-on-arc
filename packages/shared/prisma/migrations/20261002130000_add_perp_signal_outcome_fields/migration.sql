-- AlterTable
ALTER TABLE "perp_signals" ADD COLUMN "entry_confirmed" INTEGER NOT NULL DEFAULT -1,
ADD COLUMN "best_target_hit" TEXT,
ADD COLUMN "sl_after_target" INTEGER NOT NULL DEFAULT 0;

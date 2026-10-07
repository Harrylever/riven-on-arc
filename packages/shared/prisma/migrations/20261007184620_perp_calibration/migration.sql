-- AlterTable
ALTER TABLE "perp_signals" ADD COLUMN     "raw_confidence" INTEGER,
ADD COLUMN     "win_prob" DECIMAL(65,30);

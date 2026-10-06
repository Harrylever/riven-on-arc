-- AlterTable
ALTER TABLE "score_runs" ADD COLUMN IF NOT EXISTS "partial" BOOLEAN DEFAULT false;
ALTER TABLE "score_runs" ADD COLUMN IF NOT EXISTS "confidence" TEXT DEFAULT 'high';
ALTER TABLE "score_runs" ADD COLUMN IF NOT EXISTS "stale_snapshot" BOOLEAN DEFAULT false;

-- The latest verdict per token, so lists (Safest, Flagged, band and score filters) are indexed lookups
-- instead of loading thousands of score runs. Filled by the scorer and the market sync; the backfill
-- script (apps/backend/scripts/backfill-score-latest.ts) fills it for existing tokens.
CREATE TABLE "token_score_latest" (
    "token_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "band" TEXT NOT NULL DEFAULT 'unscored',
    "score_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "market_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "methodology" TEXT,
    "scored_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_score_latest_pkey" PRIMARY KEY ("token_id")
);

CREATE INDEX "token_score_latest_band_score_idx" ON "token_score_latest"("band", "score");
CREATE INDEX "token_score_latest_scored_at_idx" ON "token_score_latest"("scored_at");

ALTER TABLE "token_score_latest" ADD CONSTRAINT "token_score_latest_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- "How many other tokens share this ticker" (copycat warnings) matched symbols case-insensitively
-- with a sequential scan over every token. Declared only here: Prisma cannot express an expression index.
CREATE INDEX "tokens_symbol_lower_idx" ON "tokens" (lower("symbol"));

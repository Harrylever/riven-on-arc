-- The loop that scores tokens visitors asked for runs every 20 seconds and looks up recent requests;
-- without an index that scans every token each time. Additive and instant.
CREATE INDEX "tokens_rescore_requested_at_idx" ON "tokens"("rescore_requested_at");

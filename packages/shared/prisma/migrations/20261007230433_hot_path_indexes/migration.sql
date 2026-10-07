-- CreateIndex
CREATE INDEX "alerts_created_at_idx" ON "alerts"("created_at");

-- CreateIndex
CREATE INDEX "alerts_token_id_idx" ON "alerts"("token_id");

-- CreateIndex
CREATE INDEX "arc_markets_volume_1h_idx" ON "arc_markets"("volume_1h");

-- CreateIndex
CREATE INDEX "arc_markets_volume_6h_idx" ON "arc_markets"("volume_6h");

-- CreateIndex
CREATE INDEX "arc_markets_volume_5m_idx" ON "arc_markets"("volume_5m");

-- CreateIndex
CREATE INDEX "arc_markets_market_cap_idx" ON "arc_markets"("market_cap");

-- CreateIndex
CREATE INDEX "arc_markets_updated_at_idx" ON "arc_markets"("updated_at");

-- CreateIndex
CREATE INDEX "pools_token_id_idx" ON "pools"("token_id");

-- CreateIndex
CREATE INDEX "score_runs_token_id_calculated_at_idx" ON "score_runs"("token_id", "calculated_at");

-- CreateIndex
CREATE INDEX "tokens_launch_time_idx" ON "tokens"("launch_time");

-- CreateIndex
CREATE INDEX "tokens_deployer_wallet_idx" ON "tokens"("deployer_wallet");

-- CreateIndex
CREATE INDEX "tokens_holder_history_idx" ON "tokens"("holder_history");

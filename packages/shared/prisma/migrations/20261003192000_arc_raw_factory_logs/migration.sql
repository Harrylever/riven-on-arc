CREATE TABLE "arc_factory_logs" (
    "id" TEXT NOT NULL,
    "factory_address" TEXT NOT NULL,
    "topic0" TEXT NOT NULL,
    "topics" JSONB NOT NULL,
    "data" TEXT NOT NULL,
    "block_number" BIGINT NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arc_factory_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "arc_indexer_cursors" (
    "source" TEXT NOT NULL,
    "last_block" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arc_indexer_cursors_pkey" PRIMARY KEY ("source")
);

CREATE UNIQUE INDEX "arc_factory_logs_transaction_hash_log_index_key"
    ON "arc_factory_logs"("transaction_hash", "log_index");
CREATE INDEX "arc_factory_logs_factory_address_block_number_idx"
    ON "arc_factory_logs"("factory_address", "block_number");

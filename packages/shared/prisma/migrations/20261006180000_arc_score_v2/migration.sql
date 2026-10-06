-- Arc score v2: socials, launch info, creator-funded wallets, received/first-block per holder.
ALTER TABLE "tokens" ADD COLUMN "links" JSONB;
ALTER TABLE "pools" ADD COLUMN "launch_info" JSONB;
ALTER TABLE "pools" ADD COLUMN "creator_funded" JSONB;
ALTER TABLE "arc_token_balances" ADD COLUMN "received" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "arc_token_balances" ADD COLUMN "first_block" BIGINT;

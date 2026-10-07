-- KOL callouts: social posts that name an Arc token.
CREATE TABLE "arc_callouts" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "author_name" TEXT,
    "text" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "likes" INTEGER,
    "reposts" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'x_api',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arc_callouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "arc_callouts_posted_at_idx" ON "arc_callouts"("posted_at");
CREATE INDEX "arc_callouts_token_id_idx" ON "arc_callouts"("token_id");

ALTER TABLE "arc_callouts" ADD CONSTRAINT "arc_callouts_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

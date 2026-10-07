-- CreateTable
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "device_key" TEXT NOT NULL,
    "link_code" TEXT NOT NULL,
    "chat_id" TEXT,
    "username" TEXT,
    "linked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_watches" (
    "id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_sent" (
    "key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_sent_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_device_key_key" ON "telegram_links"("device_key");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_link_code_key" ON "telegram_links"("link_code");

-- CreateIndex
CREATE INDEX "telegram_links_chat_id_idx" ON "telegram_links"("chat_id");

-- CreateIndex
CREATE INDEX "telegram_watches_kind_target_idx" ON "telegram_watches"("kind", "target");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_watches_link_id_kind_target_key" ON "telegram_watches"("link_id", "kind", "target");

-- AddForeignKey
ALTER TABLE "telegram_watches" ADD CONSTRAINT "telegram_watches_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "telegram_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

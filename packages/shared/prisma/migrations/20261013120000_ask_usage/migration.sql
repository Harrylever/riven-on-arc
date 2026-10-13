-- Ask Riven daily quota counters (wallet / anonymous-IP / IP ceiling).
CREATE TABLE "ask_usage" (
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ask_usage_pkey" PRIMARY KEY ("kind","key","day")
);

CREATE INDEX "ask_usage_day_idx" ON "ask_usage"("day");

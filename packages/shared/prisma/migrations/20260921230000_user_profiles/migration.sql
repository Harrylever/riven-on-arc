-- CreateEnum
CREATE TYPE "trading_platform" AS ENUM ('FOMO', 'PADRE', 'JUPITER', 'OTHER');

-- CreateEnum
CREATE TYPE "login_method" AS ENUM ('WALLET', 'GOOGLE', 'APPLE', 'EMAIL');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "privy_user_id" TEXT NOT NULL,
    "login_method" "login_method" NOT NULL,
    "email" TEXT,
    "wallet_address" TEXT,
    "trading_platform" "trading_platform",
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_privy_user_id_key" ON "user_profiles"("privy_user_id");

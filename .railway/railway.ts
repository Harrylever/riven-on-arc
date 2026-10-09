import { defineRailway, github, postgres, preserve, project, service } from "railway/iac"

/**
 * Riven on Railway: the Arc indexer/worker (apps/backend) plus its Postgres.
 * The frontend deploys to Vercel and reads the same database through
 * DATABASE_PUBLIC_URL (see docs/DEPLOY.md).
 *
 * Review with `railway config plan`; nothing here applies itself.
 * Secrets are preserve()d: set them in the dashboard, never in this file.
 */
export default defineRailway(() => {
  const db = postgres("postgres")

  const backend = service("backend", {
    // TODO(before first plan): replace with the real GitHub repo. It must be public for the grant.
    source: github("REPLACE_OWNER/riven", { branch: "main" }),
    build: "bun install --frozen-lockfile && bun run build:shared",
    // Migrations run from exactly one place: here, before each deploy (idempotent).
    preDeploy: "bun run --filter @riven/shared db:migrate:deploy",
    start: "bun apps/backend/src/index.ts",
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      CHAIN_MODE: "arc",
      // Railway injects PORT; the app falls back to 6053 locally.
      CRON_SECRET: preserve(),
      ARC_RPC_URL: preserve(),
      ARC_RPC_URLS: preserve(),
      ANTHROPIC_API_KEY: preserve(),
      TELEGRAM_BOT_TOKEN: preserve(),
      X_BEARER_TOKEN: preserve(),
    },
  })

  return project("riven", { resources: [db, backend] })
})

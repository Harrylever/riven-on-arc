import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  volume,
} from "railway/iac"

/**
 * Riven on Railway: the Arc indexer/worker (apps/backend), the perp-signal
 * scanner worker (services/sakz, Python) and their shared Postgres.
 * The frontend deploys to Vercel and reads the same database through
 * DATABASE_PUBLIC_URL (see docs/DEPLOY.md).
 *
 * Review with `railway config plan`; nothing here applies itself.
 * Secrets are preserve()d: set them in the dashboard, never in this file.
 */
export default defineRailway(() => {
  // Names must match the live project exactly: a different name plans a delete + create (data loss).
  const db = postgres("Postgres")

  const backend = service("backend", {
    // The repo must be public for the grant (and Railway needs its GitHub app installed on it).
    source: github("Harrylever/riven-on-arc", { branch: "main" }),
    build: {
      buildCommand: "bun install --frozen-lockfile && bun run build:shared",
      // the backend reads packages/shared/dist, so shared changes must redeploy it
      watchPatterns: ["/apps/backend/**", "/packages/shared/**"],
    },
    // Migrations run from exactly one place: here, before each deploy (idempotent).
    preDeploy: "bun run --filter @riven/shared db:migrate:deploy",
    start: "bun run --filter=backend start",
    healthcheck: "/health",
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

  // sakz-bot's signal engine, headless: scans the perp markets every 10 minutes and
  // mirrors its calls into the shared Postgres. Python, so it builds from its own Dockerfile.
  // /data holds its SQLite history and the trained models; without the volume every
  // deploy would start from zero and the self-training would never accumulate data.
  const sakzData = volume("sakz-data", { sizeMB: 1024 })
  const sakz = service("sakz", {
    source: github("Harrylever/riven-on-arc", { branch: "main" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["/services/sakz/**"],
    },
    // Build context = services/sakz, so the Dockerfile only sees the scanner.
    rootDirectory: "services/sakz",
    volumeMounts: { "sakz-data": { mountPath: "/data" } },
    env: {
      RIVEN_DATABASE_URL: db.env.DATABASE_URL,
      // One scan every 10 minutes (seconds). Lower values hit the exchanges' rate limits.
      SAKZ_SCAN_INTERVAL_S: "600",
    },
  })

  return project("riven", { resources: [db, backend, sakzData, sakz] })
})

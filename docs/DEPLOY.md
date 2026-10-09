# Deploying Riven

Riven runs as three pieces that share one Postgres:

| Piece | Where | What it does |
|---|---|---|
| `apps/backend` | Railway (this repo's `.railway/railway.ts`) | Bun + Hono worker: Arc indexers, scoring, alerts, cron jobs |
| `apps/frontend` | Vercel | Next.js 16 UI and read APIs (`/api/arc/*`) |
| Postgres | Railway | One database, **UTF-8**. The backend writes, the frontend reads |

The grant needs the project **live on Arc mainnet** with a **public repository**. Read-only is fine; trading is off by default (`NEXT_PUBLIC_TRADING_ENABLED`).

## 1. Backend + database (Railway, Infrastructure as Code)

`.railway/railway.ts` declares the Postgres and the `backend` service. The legacy `railway.toml` files were removed: Config as Code stops being read on 2026-12-01.

1. Push the repo to a **public** GitHub repo, then replace `REPLACE_OWNER/riven` in `.railway/railway.ts`.
2. Install the authoring SDK once at the repo root: `bun add -d railway`.
3. Link the project: `railway link` (create the project first with `railway init --name riven` if needed).
4. Review: `railway config plan`. Apply only when the plan shows what you expect: `railway config apply`.
5. In the Railway dashboard set the secrets the file marks `preserve()`:
   - `CRON_SECRET` (any long random string; guards `POST /arc/callouts`)
   - `ARC_RPC_URL` / `ARC_RPC_URLS` (a paid or Blockdaemon RPC avoids public rate limits)
   - Optional: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `X_BEARER_TOKEN`

What the service runs:

```text
build      bun install --frozen-lockfile && bun run build:shared   (prisma generate + tsc)
preDeploy  bun run --filter @riven/shared db:migrate:deploy        (the only place migrations run)
start      bun apps/backend/src/index.ts
```

Notes:
- Railway provides `PORT`; locally the backend defaults to `6053`.
- Build the shared package before the backend: the backend reads `packages/shared/dist`.
- The build runs from the **repo root** (leave Root Directory blank). A sub-directory root hides `packages/shared`.
- The first boot starts indexing about 24 hours back (or from `ARC_INDEX_START_BLOCK`). Expect a sparse screener for the first hours.

## 2. Frontend (Vercel)

Project settings:

| Setting | Value |
|---|---|
| Root Directory | `apps/frontend` |
| Install Command | `cd ../.. && bun install --frozen-lockfile` |
| Build Command | `cd ../.. && bun run build:shared && cd apps/frontend && bun run build` |
| Output | Next.js default |

Environment variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Railway Postgres **public** URL (`DATABASE_PUBLIC_URL`), UTF-8 |
| `ARC_RPC_URL` | same RPC the backend uses |
| `NEXT_PUBLIC_CHAIN_MODE` | `arc` |
| `NEXT_PUBLIC_TRADING_ENABLED` | `false` until the swap encoder has been tried with real funds |
| `NEXT_PUBLIC_PERPS_ENABLED` | `true` (paper trading) or `false` to hide the perps terminal |
| `NEXT_PUBLIC_APP_URL` | the public site URL |
| `ANTHROPIC_API_KEY` | optional; Ask Riven falls back to its rule-based answers |

Do **not** run migrations from the frontend build.

## 3. Verify before you submit

- `GET <backend>/health` returns ok and the cursor is advancing.
- The site loads on a phone, the home page shows scored tokens first, and a token page opens.
- `GET <site>/api/arc/tokens/<0x…>` returns JSON, and `<site>/api/arc/badge/<0x…>` returns an SVG.
- `/accuracy` renders (it may say there is nothing to measure for the first hours).
- Open a few explorer links (`explorer.arc.io`) from a token page to show it reads Arc mainnet.

## 4. CI

`.github/workflows/ci.yml` runs type checks and all three test suites on every push and pull request.

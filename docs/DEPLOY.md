# Deploying Riven

Riven runs as four pieces that share one Postgres:

| Piece | Where | What it does |
|---|---|---|
| `apps/backend` | Railway (this repo's `.railway/railway.ts`) | Bun + Hono worker: Arc indexers, scoring, alerts, cron jobs |
| `services/sakz` | Railway (same `.railway/railway.ts`) | Python worker: the perp-signal scanner (sakz-bot's engine, headless) |
| `apps/frontend` | Vercel | Next.js 16 UI and read APIs (`/api/arc/*`) |
| Postgres | Railway | One database, **UTF-8**. The backend writes, the frontend reads |

The grant needs the project **live on Arc mainnet** with a **public repository**. Read-only is fine; trading is off by default (`NEXT_PUBLIC_TRADING_ENABLED`).

## 1. Backend + database (Railway, Infrastructure as Code)

`.railway/railway.ts` describes the `backend` service and its `Postgres` database. The legacy `railway.toml` files were removed: Config as Code stops being read on 2026-12-01.

The Railway project is **`poetic-success`** (environment `production`), which already holds a `backend` service sourced from `Harrylever/riven-on-arc` and a `Postgres` database.

**Names must match the live project exactly.** The file uses `postgres("Postgres")` and `service("backend")`. A different name (even `postgres` in lower case) plans a delete-and-create, which would destroy the database.

Steps:

1. Install the authoring SDK (already a root dev dependency): `bun install`.
2. Link: `railway link --project poetic-success`.
3. Review: `railway config plan`. The last plan was **0 to add, 4 to change, 0 to destroy**: it sets `CHAIN_MODE` and `DATABASE_URL` (a reference to `Postgres.DATABASE_URL`), the build command and watch patterns, a `/health` health check and the migration pre-deploy command. Anything that says "destroy" must be understood before going further.
4. Apply only when the plan is what you expect: `railway config apply`.
5. In the Railway dashboard set the secrets the file marks `preserve()` (they are never written to the repo):
   - `CRON_SECRET` (any long random string; guards `POST /arc/callouts`)
   - `ARC_RPC_URL` / `ARC_RPC_URLS` (a paid or Blockdaemon RPC avoids public rate limits)
   - Optional: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `X_BEARER_TOKEN`

What the service runs:

```text
build      bun install --frozen-lockfile && bun run build:shared   (prisma generate + tsc)
preDeploy  bun run --filter @riven/shared db:migrate:deploy        (the only place migrations run)
start      bun run --filter=backend start                          (bun src/index.ts)
health     GET /health
```

Notes:
- Railway provides `PORT`; locally the backend defaults to `6053`.
- Build the shared package before the backend: the backend reads `packages/shared/dist`.
- The build runs from the **repo root** (leave Root Directory blank). A sub-directory root hides `packages/shared`.
- The first boot starts indexing about 24 hours back (or from `ARC_INDEX_START_BLOCK`). Expect a sparse screener for the first hours.
- On the first tick after a deploy the backend verifies each pool's USDC type (ERC-20 or native) from the PositionManager. This needs a working `ARC_RPC_URL`.
- The repo is private. The grant needs it public: rotate the MadeOnSol key in git history first.

### Perp scanner worker (`services/sakz`)

`.railway/railway.ts` also defines a `sakz` service and a `sakz-data` volume. It builds from `services/sakz/Dockerfile` (Python 3.11) and runs `headless.py`: a scan every 10 minutes, outcome tracking, and a mirror of each call into `perp_signals` in the shared Postgres. It never places an order.

- `RIVEN_DATABASE_URL` is a reference to `Postgres.DATABASE_URL`; no other secret is needed (no exchange keys, no Telegram token).
- The volume is mounted at `/data`: sakz-bot's SQLite history (`SAKZ_DB_PATH`) and the trained models (`SAKZ_DATA_DIR`). Without it every deploy forgets its history and the self-training never has data.
- The first deploy starts with an empty history. To carry over the existing history, upload your local `sakz_data.db` to `/data/sakz_data.db` once (for example `railway ssh`, or a one-off deploy that copies it), then restart the service.
- Run **one** scanner. A local `headless.py` or a backend started with `SAKZ_DIR` set would write the same calls twice: leave `SAKZ_DIR` unset on the backend service.
- Plan first (`railway config plan`): adding this service shows `+ Create volume sakz-data` and `+ Create service sakz`.

See `services/sakz/README.md` for running it locally.

## 2. Frontend (Vercel)

`apps/frontend/vercel.json` sets the build command (`cd ../.. && bun run build`, which builds `@riven/shared` and then Next.js). This was run locally from a clean checkout and passes in about a minute.

Project settings:

| Setting | Value |
|---|---|
| Root Directory | `apps/frontend` (keep "Include source files outside of the Root Directory" on) |
| Framework Preset | Next.js |
| Install Command | **leave on auto-detect** (Vercel runs `bun install` for `bun.lock`). Do not override it: an overridden install command uses the *oldest* Bun in the build image, which may not read the text lockfile |
| Build Command | from `vercel.json` |
| Output | Next.js default |

Check the first build log: it should show a Bun install of the whole workspace. If the install only covers `apps/frontend`, switch the Install Command to `cd ../.. && bun install` and check the Bun version in the log.

Environment variables (Production and Preview):

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Railway Postgres **public** URL (`DATABASE_PUBLIC_URL`), UTF-8. Needed **at build time too** (Prisma generate), though the build makes no connection |
| `ARC_RPC_URL` | same RPC the backend uses |
| `NEXT_PUBLIC_CHAIN_MODE` | `arc` |
| `NEXT_PUBLIC_TRADING_ENABLED` | `false` until the swap encoder has been tried with real funds (see `docs/TRADING-TEST.md`) |
| `NEXT_PUBLIC_PERPS_ENABLED` | `true` (paper trading) or `false` to hide the perps terminal |
| `NEXT_PUBLIC_APP_URL` | the permanent public site origin, with no path (for example `https://riven.app`). Required for canonical URLs, Open Graph URLs, robots.txt and sitemaps; do not use a preview deployment URL |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | optional Google Search Console HTML-tag verification token (the `content` value only) |
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

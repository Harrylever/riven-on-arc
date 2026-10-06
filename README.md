# ClawDex for Arc

ClawDex is being ported to Arc mainnet (chain ID `5042`) as a read-only launch-intelligence terminal. The goal is to score launches on Arc using deterministic on-chain signals, surface them in a terminal-like app, and provide a plain-English explanation for each launch without selling the score or trading on behalf of users.

## Arc port status

This repo is still in the migration phase from the older Solana assumptions. The port work follows the Arc build plan in `CLAWDEX_ARC_BUILD_PLAN.md` and the repo-level `docs/PORT_NOTES.md` summary.

## Architecture

```
apps/
  frontend/   Next.js — UI and public APIs for token search, feed and score display
  backend/    worker/indexer — launch detection, scoring runs and monitoring tasks
packages/
  shared/     Prisma schema, chain-agnostic types and shared scoring utilities
config/       Arc chain config and scoring thresholds for the port
```

## Arc config

Use the chain constants in `config/arc.ts` and tuning values in `config/scoring.ts` as the starting point for Arc work.

## Current Arc backend slice

- `GET /arc/health` reports the connected RPC's chain ID and current block.
- `GET /arc/tokens/:address/inspect` reads ERC-20 metadata, the EIP-1967 implementation slot, `owner()` when available, and a limited bytecode-selector heuristic. It is investigative output, not a score and not proof that a contract is safe.
- `GET /api/cron/index` is protected by `Authorization: Bearer $CRON_SECRET`. It scans bounded Memespad factory block ranges, persists raw logs idempotently and advances a database cursor only after persistence succeeds. The backend also schedules this scan every five minutes.
- The Memespad factory event ABI could not be verified from available sources during this port, so raw logs are intentionally **not decoded as launches** and no token/score is fabricated from them. Arc log/cursor schema changes need to be migrated before running the index tick.
- Set `CHAIN_MODE=arc` on the backend to run only the Arc indexer; otherwise the legacy Solana worker jobs remain enabled during the transition.

## Setup

```bash
bun install
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env
bun run --filter @clawdex/shared build
bun run dev
```

## Important guardrails

- Do not implement trade execution or custody flows; this repo remains a monitoring and alerting product.
- Keep the score grounded in on-chain facts that anyone can re-check.
- Never hard-code unknown Arc verifier values without an explicit `TODO(verify)` comment and a fresh runtime check against the Arc RPC or an explorer source.

## Product direction

- Terminal pages show Arc launch data and score bands.
- Search accepts EVM addresses (`0x...`) instead of Solana base58 keys.
- Score methodology stays deterministic and additive, with config values allowed to change as the Arc launchpads are verified.

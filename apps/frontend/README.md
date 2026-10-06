# ClawDex — Frontend Application (`apps/frontend`)

This is the Next.js frontend for ClawDex: the mobile-first, AI-native launch intelligence terminal for Arc.

---

## 1. Quick Start

Ensure dependencies are installed and the shared package is built from the repository root:

```bash
# From repo root
pnpm install
pnpm --filter @clawdex/shared build

# Start the frontend development server
pnpm --filter frontend dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 2. Environment Variables

Create `.env.local` inside `apps/frontend/` (or set environment variables in your Vercel project settings).

### Required in Production
- **`DATABASE_URL`**: PostgreSQL connection string (e.g. Railway/Neon). Next.js API routes query this directly through `@clawdex/shared` (`getDb()`).
- **`ARC_RPC_URL`**: Arc mainnet RPC endpoint for on-demand token resolution and launchpad verification.

### Optional & Feature Toggles
- **`USE_MOCK_DATA`**: Set to `"true"` for local offline development using 5 pre-configured mock token fixtures.
  - *Trust Guard*: `USE_MOCK_DATA` is **automatically ignored when `VERCEL_ENV=production`**.
  - In non-production environments with mock mode enabled, a prominent warning banner is displayed across all pages.
- **`ANTHROPIC_API_KEY`**: API key for Anthropic Claude (Product Phase 2 `POST /api/agent/analyze`).
- **`AGENT_MODEL`**: Model selector for agent analysis (e.g. `"claude-haiku-4-5-20251001"` or `"claude-sonnet-5"`).
- **`UPSTASH_REDIS_REST_URL`** & **`UPSTASH_REDIS_REST_TOKEN`**: Upstash Redis credentials for shared rate-limiting.
- **`NEXT_PUBLIC_PRIVY_APP_ID`** & **`PRIVY_APP_SECRET`**: Privy authentication credentials (Product Phase 8).
- **`NEXT_PUBLIC_BUBBLEMAPS_PARTNER_ID`**: Partner ID for embedded BubbleMaps graph iframe (Product Phase 9).

---

## 3. Architecture & Data Flow

- **Read-Only API Layer:** The Next.js App Router API handlers (`app/api/`) connect directly to PostgreSQL using `@clawdex/shared` (`getDb()`).
- **Backend Separation:** Ingestion, market aggregations, scoring runs, and KOL syncing are handled by `apps/backend` (NestJS). The frontend never triggers on-chain writes or talks directly to Helius RPC except for on-demand metadata fallback via `resolveTokenByMint`.
- **KOL Data Cadence:** KOL trade data is synced by the backend approximately every 30 minutes. All KOL UI components must display an "as of [time]" stamp and show buys and sells with equal prominence.

---

## 4. Code & Folder Conventions

- **Pages & Routes:** Located in `app/`. Use React Server Components (RSC) where appropriate and client components (`"use client"`) for interactive widgets.
- **Components:** Shared UI components in `components/`. Follow mobile-first styling principles with Tailwind CSS.
- **Imports from `@clawdex/shared`:**
  - Import the database client using `import { getDb } from "@clawdex/shared";` in server code only.
  - In client components, import scoring utilities exclusively from `"@clawdex/shared/score"`. Never import from the package root in client components.
  - **Prisma Decimal Handling:** Prisma Decimal fields (e.g. `score`, `gateMultiplier`, `priceSol`) must be serialized or converted using `Number()` or `.toString()` before passing them across the server/client boundary or returning them in JSON responses.

---

## 5. Development Boundaries

- **Do NOT edit files in `apps/backend/`**: Owned by the Chain & Data track.
- **Do NOT edit `packages/shared/prisma/schema.prisma` without cross-track coordination**: This schema is shared between frontend and backend.
- **Frozen Models:** `Trade` and `ExecutionLog` are frozen backend models. Do not use or expose them in frontend routes.
- **Testing and Verification:** Run `pnpm --filter frontend lint` and `pnpm --filter frontend build` to verify changes before submitting PRs.

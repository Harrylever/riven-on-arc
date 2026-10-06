# Vercel Deployment Guide — ClawDex Frontend

This document details how to configure and deploy the Next.js frontend (`apps/frontend`) on Vercel.

---

## 1. Project Configuration in Vercel

Because this repository is a **pnpm Turborepo monorepo**, the frontend depends on `@clawdex/shared` (which compiles its Prisma client and TypeScript dist prior to the Next.js build).

In the Vercel Project Settings:

| Setting | Value | Notes |
| --- | --- | --- |
| **Framework Preset** | Next.js | Automatically detected by Vercel |
| **Root Directory** | `apps/frontend` | Set to `apps/frontend` so Vercel tracks frontend commits. (verify against Vercel monorepo docs) |
| **Include Source Files Outside Root Directory** | Enabled (Checked) | Required so Vercel can access `packages/shared` during the build. |
| **Build Command** | `pnpm --filter @clawdex/shared build && pnpm --filter frontend build` | Overrides the default `next build`. Builds `@clawdex/shared` first, ensuring Prisma client and compiled TypeScript dist are available. |
| **Output Directory** | `.next` | Default for Next.js |
| **Install Command** | `pnpm install` | Default |

> [!IMPORTANT]
> **Do not run database migrations from Vercel!**
> Per `AGENTS.md` and `docs/DECISIONS.md`, Prisma migrations (`db:migrate:deploy`) must run exclusively from the persistent NestJS backend deploy pipeline on Railway to avoid race conditions against the database schema.

---

## 2. Environment Variables

Configure these in the Vercel dashboard (**Settings $\rightarrow$ Environment Variables**):

### Required for Production & Previews
- **`DATABASE_URL`**: PostgreSQL connection string (Postgres / Neon).
- **`SOLANA_RPC_URL`**: Mainnet Solana RPC endpoint (Helius: `https://mainnet.helius-rpc.com/?api-key=...`).

### Optional / Future Unlocks
- **`ANTHROPIC_API_KEY`**: Required for the AI Agent route (`POST /api/agent/analyze`).
- **`AGENT_MODEL`**: (e.g. `claude-haiku-4-5-20251001` or `claude-sonnet-5`).
- **`USE_MOCK_DATA`**: Can be set to `true` on Preview environments for isolated UI testing without live database credentials.
  - *Trust Guard*: Ignored automatically whenever `VERCEL_ENV=production`.
- **`NEXT_PUBLIC_PRIVY_APP_ID`** & **`PRIVY_APP_SECRET`**: Required once Privy authentication is integrated (Phase 8).
- **`NEXT_PUBLIC_BUBBLEMAPS_PARTNER_ID`**: Required for live BubbleMaps embeds (Phase 9).

---

## 3. Trust Guard & Security Audits

1. **Production Guard**: `lib/api.ts` enforces `if (process.env.VERCEL_ENV === "production") return false;` for mock mode. Even if `USE_MOCK_DATA=true` is accidentally set in production environment variables, mock tokens will never appear on a live domain.
2. **Mock Banner**: Any non-production preview deployment running with mock mode displays a persistent header banner: `"MOCK DATA MODE ACTIVE — Not connected to live chain"`.
3. **Secret Leakage Prevention**:
   - Only variables prefixed with `NEXT_PUBLIC_` are bundled into client-side scripts.
   - All database queries and external RPC resolution occur strictly server-side in Next.js Server Components or API route handlers.

---

## 4. Note on pnpm Version Specification

### Issue Detected:
In the root `package.json`:
```json
"devEngines": {
  "packageManager": {
    "name": "pnpm",
    "version": "^11.17.0",
    "onFail": "download"
  }
}
```
Meanwhile, `apps/frontend/package.json` specifies:
```json
"packageManager": "pnpm@11.17.0"
```

### Risk & Recommendation for the Co-Dev:
The caret range specification in `devEngines.packageManager.version: "^11.17.0"` causes Corepack and newer Node.js toolchains to fail with:
`Invalid package manager specification in package.json (pnpm@^11.17.0); expected a semver version`

**Action item to request from the co-dev:**
Change root `package.json` to use an exact semver pin:
```json
"packageManager": "pnpm@11.17.0"
```
and remove the non-standard `^` prefix from `devEngines`. This guarantees identical pnpm behavior across local Windows machines, Railway backend builders, and Vercel frontend runners.

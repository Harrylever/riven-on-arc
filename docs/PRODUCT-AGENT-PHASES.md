# Product & agent — phase breakdown

For the frontend/agent side of Riven. Mirrors the chain-and-data side's phase structure (`AGENTS.md` → "Chain & data phase roadmap", `docs/PHASE-STATUS.md`) — one branch per phase, dependency-ordered, PR into a shared integration branch. Suggested branch naming to match: `product-agent/<n>-<slug>`.

**Read `AGENTS.md` first** — it has the full product spec, the resolved trade-vs-monitoring decision, and what's already built on the chain/data side. This file just breaks *your* side into phases.

## What's already live for you to build against

Don't re-derive these — they're built, type-checked, and (as of this writing) merged through phase 4 on `chain-and-data`:

- `GET /api/leaderboard` → `{ tokens: [{ tokenId, mint, name, symbol, score, calculatedAt }] }`
- `GET /api/token/[mint]` → `{ token, score, authorityCheck, z500Rank, recentBurns }` (resolves on-demand via Helius if not yet indexed — no 404 for a valid but undetected mint)
- `POST /api/agent/analyze` → currently a `501` stub with a comment pointing here — **this is yours to build**, Phase 2 below
- Prisma models available via `@riven/shared`: `Token` (with `launchpad`, `imageUri`, `decimals`, `metadataUri`), `ScoreRun`, `TokenAuthorityCheck`, `HolderSnapshot`, `Burn`, `Pool`/`Trade`/`PairSnapshot` (swap/price data), `KolTrade` (KOL feed, phase 5 just landed), `Watchlist`, `Alert`. Full schema: `packages/shared/prisma/schema.prisma`.
- Score formula + sub-score derivation live in `@riven/shared` (`computeScore`, `deriveConcentrationScore`, etc.) if you ever need to explain the math, not just display the number.

**Not yet available:** `PairSnapshot.liquidityUsd`/`marketCapUsd` are null (SOL-denominated ratios are used internally for scoring, no USD feed wired up yet); z500 rank data (phase 6, blocked on confirming the real data source); exact unique holder counts (`HolderSnapshot.holderCount` is null, only `top10Pct` is populated).

---

## Phase 1 — Core screens (Market Terminal MVP)

Feed (`/`) and Token page (`/token/[mint]`), per the spec's design principles: mobile-first, single-column cards, one big score + plain-English verdict, thumb-reach nav. Chart is embedded (don't rebuild). Reads `/api/leaderboard` and `/api/token/[mint]` directly — no new API routes needed.

**Depends on:** nothing on your side — the APIs are already live.

## Phase 2 — AI agent (the moat)

Build `POST /api/agent/analyze` for real, replacing the 501 stub. This is the highest-priority phase after core screens — it's the product's stated differentiator, not a nice-to-have.

- System rules (non-negotiable, from the spec): never buy/sell advice, always end with "Not financial advice. DYOR.", cite data sources/timestamps, admit when data is insufficient rather than guessing.
- Context: pull from `GET /api/token/[mint]`'s response (score breakdown, authority gate, recent burns) — don't re-query the DB yourself, that route already assembles it.
- Chat is the **main entry point** per design principles, not a hidden widget — factor that into where it sits in Phase 1's screens.
- **Open decision (yours to make, not mine):** model stack — Claude-only vs. also wiring in the ClawPump/Hermes agent and/or UsePod. See `AGENTS.md` open decisions list.

**Depends on:** Phase 1 (needs somewhere to put the chat UI).

## Phase 3 — Watchlist (no-auth first)

localStorage-based watchlist, matching the original research doc's own reasoning: launches are public data, no server storage needed yet, auth adds complexity the MVP doesn't need. Migrates to DB-backed once Phase 8 (accounts) lands — don't over-build this now.

**Depends on:** Phase 1.

## Phase 4 — KOL Intelligence UI

Consumes `KolTrade` (chain-and-data phase 5, just shipped — real MadeOnSol/Solana Tracker data, or mock trades if `USE_MOCK_DATA=true` and no API key is set yet). You'll likely need new thin read routes here (e.g. `GET /api/token/[mint]/kols`, `GET /api/kols/leaderboard`) — follow the existing pattern in `apps/frontend/app/api/*` (query `@riven/shared`'s Prisma client directly, no need to round-trip through the backend).

- Live KOL feed, per-token KOL activity tab, PnL leaderboard.
- Rule from the spec: show sells as prominently as buys — a KOL buy is not a safety signal. Include a "not financial advice" note.

**Depends on:** Phase 1 (token page needs a slot for the KOL tab).

## Phase 5 — Natural language search

AI translates free text ("find tokens under 5M market cap") into filters against the existing leaderboard/feed data. A lightweight LLM call, not a new data pipeline.

**Depends on:** Phase 1, and reuses whatever model-stack decision Phase 2 lands on.

## Phase 6 — Ecosystem Intelligence dashboard

Dedicated view: ANSEM ecosystem activity, ClawPump launches (`Token.launchpad === 'CLAWPUMP'`), ecosystem volume, trending projects. Mostly an aggregation view over data that already exists.

**Depends on:** Phase 1.

## Phase 7 — Agent Feed + Smart Alerts UI

Daily report display + alert notifications. **Depends on chain-and-data phase 7** (monitoring/alerts — builds the actual alert-detection logic as new code, does not touch the frozen `TradeService`). Coordinate timing with that side; this phase is mostly UI once the alerts exist to display.

## Phase 8 — Accounts & login (Privy)

Email/Apple/Google/wallet sign-in per the spec. Includes the "Where do you trade?" self-declared wallet-linking flow (Fomo/Padre auto-detection was investigated and found infeasible — see `AGENTS.md`, don't redo that research). This is when Watchlist (Phase 3) migrates from localStorage to DB-backed, and needs new schema (`User`, `LinkedWallet` — not in `packages/shared` yet, will need adding when this phase starts).

**Open decisions relevant here (see `AGENTS.md`):** Bubblemaps partner ID for production embedding; Privy setup specifics.

## Phase 9 — Polish & hardening

Responsive pass across all screens, loading/error states, Bubblemaps embed with a real partner ID (currently would be the free/demo iframe), performance (leaderboard virtualization, etc.).

---

## A few things worth syncing on before you start

- **Trade execution is paused, not repurposed** — if you build anything that touches `apps/backend/src/trade/`, don't. It stays frozen. See `AGENTS.md`'s resolved-conflict note at the top.
- **z500 is a project rank, not a wallet balance** — if any UI copy or agent prompt says "founder's z500 holdings," that's the exact mistake the original planning docs made. It's a token's own rank (burn size + airdrop market cap).
- Chain-and-data phases 1–5 are built but several pieces are explicitly flagged as unvalidated against real production traffic (webhook payload parsing, ClawPump's API path, Solana Tracker's response shape). `docs/PHASE-STATUS.md` has the exact list — worth knowing so you don't assume perfect data quality on day one.

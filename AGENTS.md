# Riven (Arc) — Agent & Developer Guide

## ⚡ Read this first: current state (October 2026). This section overrides everything below it.

This repo is **Riven**: Riven ported from Solana to **Arc mainnet** (chain 5042, USDC gas) for **Arc Microgrants (DoraHacks)**. Everything below the line "Legacy Riven (Solana) guide" is the original Solana-era guide. Its rules still apply only where this section doesn't override them.

**Stack (actual):**
- **Package manager:** bun workspaces (`bun.lock`). No pnpm and no Turborepo.
- **Backend:** Bun + **Hono** (`apps/backend/src/app.ts`, jobs via croner). No NestJS.
- **Frontend:** Next.js 16 (`params`/`searchParams` are Promises). **Prisma 7** with `@prisma/adapter-pg`, unchanged.
- **Chain mode:** Arc by default in both apps. Legacy Solana jobs run only with `CHAIN_MODE=solana`.

**Commands:**
- Tests: `bun run --filter @riven/shared test`, `bun run --filter backend test`, `bun run --filter frontend test`.
- Types: `bunx tsc --noEmit -p apps/<app>`.
- Schema: `DATABASE_URL=... bun run --filter @riven/shared build` (prisma generate + tsc). Rebuild after any change in `packages/shared`, because the backend reads its `dist`.

**Scoring:**
- The single source of truth is `packages/shared/src/score/arc.ts` (methodology `arc-v5`). The 1–10 score is built from 5 sub-scores, plus caps, flag codes and `FAKE_FLAG_CODES`.
- Fake-detection helpers (`isWash`, `impersonates`) are exported from shared. **Never re-implement them in the frontend.**
- Flags from runs scored under an older methodology are not trusted until the token is rescored (`apps/frontend/lib/arc-data.ts`, `scoredReasons`).
- Pool USDC comes from on-chain `StateView` liquidity × price (`usdcInRange`). It is never derived from summed swaps.
- "LP removed" is judged on the launch position only (`launchLiquidityPulled`).

**Added 2026-10-09:** the ClawDex name is gone (package scope is `@riven/shared`; `RIVEN_DATABASE_URL` is the sakz mirror variable, with the old `CLAWDEX_DATABASE_URL` still passed through because the external sakz-bot module reads it). Deployment is Railway Infrastructure as Code (`.railway/railway.ts`, no `railway.toml`) plus Vercel for the frontend: see `docs/DEPLOY.md`. New surfaces: `/accuracy`, `/creator/[wallet]`, exit check on token pages, `/api/arc/tokens/[address]` and `/api/arc/badge/[address]`, "Liquidity gap" sort. Profile/Community/Boosted screener filters are hidden until the market sync fills their fields.

**Owner decisions (2026-10-06), superseding "monitoring only" below:**
- **Non-custodial buy/sell is allowed** behind `NEXT_PUBLIC_TRADING_ENABLED` (default off since 2026-10-09 until the swap encoder is exercised with real funds). The user signs every tx in their own wallet; Riven never holds keys, signs or broadcasts.
  - Approvals are exact-amount and short-lived.
  - `assertSafeTx` in `hooks/use-arc-wallet.ts` refuses unknown contract calls.
  - `apps/backend/src/trade/` (autonomous TradeService) stays **frozen**.
- **Perps is a paper-trading terminal**: Hyperliquid prices plus sakz-bot signals, behind `NEXT_PUBLIC_PERPS_ENABLED` (default on). Nothing is sent to an exchange.
- **Flag wording is evidence, not accusation**: "flagged", "liquidity pulled", "creator sold out". Never "scam" or "fake".

**Data rules:**
- Creator-supplied strings must go through `cleanText` before storage (NUL bytes stall the indexer).
- Local Postgres must be **UTF-8**.
- A failed read must render an error state, never an empty "all clear".

**Removed in the port:**
- Solana pages (`/terminal`, `/kol`, `/landing`, `/login`), which now redirect home.
- Legacy APIs (`/api/leaderboard`, `/api/token/*`, `/api/feed`, …).
- `lib/deployer.ts` (fabricated wallet reputations).

The live APIs are `/api/arc/*`, `/api/perp-signals` and `/api/perps/*`. Design tokens are documented in `docs/design-system.md`, and audit reports are in `docs/audit/`.

---

# Legacy Riven (Solana) guide

One file for both: AI coding agents working in this repo (Claude Code, Cursor, etc. — many tools read `AGENTS.md` by convention) and the human developer reading it before writing code. This file is self-contained — no external doc access required. It supersedes any earlier version of this file.

**Sources this is built from:** the product spec is now in-repo at `docs/SPEC.md` (identical to the final `AI_Native_Solana_Intelligence_Terminal (1).md`). `docs/BLUEPRINT.md` and `docs/DECISIONS.md` (from the `chore/spec-and-rules` PR, likely a teammate's own agent) add an organizational/architecture layer on top and are the source of the phase-2 schema reconciliation below. A separate technical blueprint doc (not in-repo, hosted externally) originally refined the scoring formula and reviewed the earliest planning docs for gaps — its corrections are folded in below since that doc isn't accessible from this repo.

---

## ✅ Resolved: trade execution is paused, not repurposed

Riven is a **monitoring and alerting** product, not a trading agent: users say "watch this token" and the agent tracks liquidity/holders/burns/whales/volume and sends alert summaries — it never buys or sells anything. Confirmed from two independent directions: the final product spec (below), and `docs/DECISIONS.md` ("Trade execution is PAUSED... TradeService stays log-only").

**`apps/backend/src/trade/`** (the earlier "Riven Trader" direction — autonomous trading via Jupiter) is **frozen, not repurposed**. Per `docs/DECISIONS.md`: leave `TradeService` untouched, don't delete it, don't wire up signing or execution, don't add custody/wallet-key handling. If a monitoring/alert loop is needed later, build it as new code (phase 7), don't mutate `TradeService` into it.

---

## Perpetual futures signals — a second, non-workspace project mirrored in

Riven now shows read-only perp-futures signals at `/perps` (`GET /api/perp-signals`, `PerpSignal` in `packages/shared/prisma/schema.prisma`). **Gated behind `NEXT_PUBLIC_PERPS_ENABLED` (`apps/frontend/lib/flags.ts`), off by default.** This is a deliberate branch off the core dex-screener product, held back until the screener itself has traction — while the flag is off (default), the nav links are hidden, `/perps` 404s, and `GET /api/perp-signals` returns before ever touching the DB, not just an empty result. Flip it to `"true"` when ready to launch this surface.

**The signal-generation logic itself lives outside this repo** — `sakz-bot-main`, a separate, mature Python Telegram trading-signal bot at a sibling path (`../sakz-bot-main`, not a pnpm workspace member, not even a git repo). It was evaluated for a perpetual-trading layer via Hyperliquid; Hyperliquid execution and reimplementing a trading engine natively in TypeScript were both rejected in favor of this.

**What it is and why it's mirrored, not rewritten.** sakz-bot-main already has a real signal engine — multi-timeframe TA scoring, conviction/confidence scoring, correlation-based gating, Kelly position sizing, walk-forward and Monte Carlo statistical validation, and an ML layer (RF/XGBoost) trained on resolved outcomes — for Bybit, MEXC and Binance perpetuals. **It has no Hyperliquid support today** (its `ExchangeAdapter` interface in `exchange_adapters.py` is pluggable, so a `HyperliquidAdapter` could be added later, but that's unbuilt). Reimplementing this logic in TypeScript would be pure risk for no benefit — Riven only needs to *display* its output, not reproduce it. It deploys as its own Railway worker (`Procfile`: `worker: python sakz_bot.py`) and keeps its own SQLite/libsql DB for the Telegram bot's own state; none of that changes.

**The one-way mirror mechanism** (`sakz-bot-main/clawdex_sync.py`): best-effort, no-ops silently if `RIVEN_DATABASE_URL` is unset, never raises out of its own bot's scan/outcome loops. Two hooks:
- `mirror_signals()` — called in `sakz_engine_scan.py` right after the existing `db_register_outcome()` loop, whenever a batch of signals is finalized. Independently dedups against Postgres (sakz-bot's own SQLite dedup only protects its own table) so a pair sitting in the top-20 across multiple ~10-minute scan cycles doesn't get a duplicate row.
- `mirror_outcome_update()` — called in `sakz_engine_outcomes.py` right after its own `signal_outcomes` SQLite `UPDATE`, whenever a pending call resolves (`t1_hit`/`t2_hit`/`t3_hit`/`sl_hit`) or expires after 48h. Updates the matching Riven row in place rather than inserting a new one.

Both hooks generate their own `id` (Python `uuid.uuid4()`) rather than relying on a DB-side default — same as everywhere else in this schema, `PerpSignal.id`'s `@default(uuid())` is Prisma-client-side only, not a Postgres column default (confirmed in the migration SQL: plain `"id" TEXT NOT NULL`).

**Signals-never-execution posture, restated.** This feature is read-only on the Riven side, exactly like `TradeService`'s freeze above — nothing here ever places, cancels or manages an order. sakz-bot's own `SAKZ_ALLOW_MAINNET` env var (defaults to `0`, paper/testnet only) is the precedent this mirrors, not a new pattern.

**Railway topology.** Two independent services share one Postgres: `apps/backend` (NestJS, runs `prisma migrate deploy`) and `sakz-bot-main` (Python, set `RIVEN_DATABASE_URL` to the same database — copy the existing backend service's `DATABASE_URL`/`DATABASE_PUBLIC_URL` depending on whether they end up in the same Railway project or not, since Railway's internal `*.railway.internal` hostnames only resolve within one project). `sakz-bot-main` never runs a migration — it only INSERTs/UPDATEs into a table Riven's own migration created, consistent with this repo's "migrations run from exactly one place" rule (see Deployment, below).

---

## Vision

Most crypto tools show users data — DexScreener shows charts, Birdeye shows transactions, RugCheck shows risks, Bubblemaps shows wallet relationships. Users still have to interpret everything themselves.

Riven is **the first AI-native market terminal for Solana**: an autonomous agent that watches tokens, explains market movements, detects risks, finds opportunities, monitors wallets, tracks launchpads, generates reports, and sends intelligent alerts. Users don't just browse charts — they assign tasks to agents. Agents gather intelligence; humans make the decisions.

Positioning: **the AI Operating System for Solana markets** / **the Bloomberg Terminal for Solana, powered by autonomous AI agents.**

## Scope & decisions (locked)

- **Solana only.** No multi-chain.
- **Independent of DexScreener** — no dependency on its API, not a reseller of its data. **One deliberate, narrow exception (2026-09-21):** `apps/frontend/lib/api.ts`'s `getLeaderboard`/`getTokenByMint` fall back to a direct DexScreener fetch (`apps/frontend/lib/dexscreener.ts`) when Riven's own DB has no scored tokens yet for a mint — a display-only fallback so the feed/token page aren't empty before the real ingestion pipeline has caught up, not a data dependency the scoring pipeline relies on. It never fabricates a score, authority check, or burn data for these tokens — `score`/`authorityCheck` are returned `null` and rendered as "Unscored"/"Not yet scored", matching the backend's own rule of skipping a token rather than guessing missing inputs. If this fallback is ever promoted beyond a demo convenience, revisit — it's real production data flowing outside the locked architecture.
- **Data source: Helius** (RPC and webhooks) is primary. Market data (price, market cap, liquidity) is derived in-house from bonding-curve/pool reserves and swap events — not pulled from a third party.
- **Launchpad-first**: pump.fun, Raydium LaunchLab, ClawPump, and other launchpads.
- **Free first.** No payments at launch. The moat is transparency, trust, and AI-powered insight on every token.
- Paid features (claim & enhance a token, boosts, ads) are a **future phase** — see Monetization (Later).
- **Hackathon hook:** keep one small $ANSEM-gated premium feature — agent monitoring — so there's a net-new $ANSEM use case to demo. This is a premium unlock, not a listing fee.

## Current build scope (Week 1 — this is what to actually build first)

- **Detection**: Helius webhooks catch new launches on pump.fun, LaunchLab, and ClawPump, stored in Riven's own DB.
- **Market data**: price, market cap, liquidity derived from bonding-curve or pool reserves plus swap events. Cover pump.fun and PumpSwap first.
- **Token page**: price, market cap, liquidity, holders with top-10 concentration, txns, KOL activity, Bubblemaps embed, and a 0–100 score with a plain-English AI explanation.
- **Feed**: new launches, each with a score.
- **Not now**: claim & enhance, boosts, ads, long-tail DEXs, multi-chain.

## Design principles

- **Mobile-first, then desktop.** Most users open this on a phone.
- **Normie-friendly**: plain English everywhere, no unexplained jargon.
- **One big score and one plain-English verdict** per token (e.g. "Looks healthy" or "Risky").
- **Single-column cards and thumb-reach navigation**, not dense tables.
- **The agent chat is the main entry point**, not a hidden widget.
- Agents gather intelligence, humans make the decisions.

---

## Core product — three layers

### Layer 1: Market Terminal
A complete Solana token screener — new token discovery, trending, gainers/losers, new pairs, volume/liquidity/market-cap leaderboards, holder statistics, whale activity, buy/sell tracking, DEX/pool tracking, token age, launchpad origin, watchlists, advanced filtering. Like DexScreener, but focused on intelligence.

### Layer 2: Scoring Engine
Every token gets a score, 0–100, from:
- **Holder Distribution** — top-10 concentration, whale accumulation, whale exits
- **Liquidity Health** — liquidity/market-cap ratio, liquidity changes
- **Burn Metrics** — founder burns, treasury burns
- **Market Activity** — volume growth, new holders, buy/sell pressure
- ~~Founder Reputation — z500 rank, historical launches, wallet behaviour~~ **Dropped as a score input entirely** (2026-09-20) — see the scoring formula note below.

**z500, for context (no longer a score input):** z500 is a leaderboard that ranks **projects** — by $ANSEM burn size and the market cap of the token supply airdropped to $ANSEM holders — not a per-wallet balance. That correction (it's not "founder wallet z500 holdings," a mistake the original planning docs made) still stands as a fact about the ecosystem, even though the scoring formula no longer uses it: the real `ansem.io/api/coins` endpoint (found in phase 6) sits behind a Cloudflare JS challenge that blocks reliable server-side fetching, so the score doesn't depend on it. See phase 6 in the roadmap table below for the full history.

**Scoring formula, gated on rug-detection fundamentals** (this closes two gaps the original planning docs had — no mint/freeze-authority check, no LP-lock check):

```
SCORE = gate(mint, freeze, lp) × (40·C + 35·B_attr + 25·L)
```

- `gate(mint, freeze, lp)` = **1.0** if mint authority revoked AND freeze authority revoked AND LP locked/burned; **0.5** if one of the three fails; **0.0** (hard red, score capped at 20) if two or more fail. A token cannot reach "green" on concentration/burn/liquidity alone if mint authority is still live or LP is unlocked.
- `C` = concentration score (0–10): `1 - (top10_balance / total_supply)`, scaled.
- `B_attr` = burn score (0–10) using **only burns attributed to the deployer/treasury wallet** — not aggregate supply burn. (Aggregate burn can be faked by anyone burning dust from an unrelated wallet.)
- `L` = liquidity-to-market-cap score (0–10), unchanged from the naive ratio.

No z500 term — dropped as a score input (2026-09-20). It was originally 10 of 100 weighted points; those points are folded back into C/B_attr/L (40/35/25, matching the project's very first formula proposal before z500 was ever added). See phase 6 in the roadmap table for why: the real data source was found, but sits behind a Cloudflare JS challenge that blocks reliable server-side fetching, and the score shouldn't depend on an unreliable third party.

Thresholds: 70+ green, 50–69 yellow, <50 red. **Not yet validated** against real launch outcomes — re-tune weights and gate penalties after backtesting, don't treat these as final.

Output shape (plain-English, shown on the token page):
```
Score: 78/100

Strengths:
✓ Healthy liquidity
✓ Growing holders
✓ Low concentration

Risks:
⚠ Moderate whale ownership
```

### Layer 3: AI Agent — the moat
Users ask things like "Why is this token pumping?", "Why did score drop?", "Is liquidity healthy?", "Compare this token to another", "Find me low-risk launches." The AI explains market activity in plain English:

> Token volume increased 240%. Liquidity increased by 18%. Holder count increased by 12%. Top wallets have not exited. This move appears broad-based rather than whale-driven.

**Agent behavioral rules (non-negotiable, from the original safety spec):**
1. Never give specific buy/sell recommendations.
2. Always end responses with "Not financial advice. DYOR."
3. Cite data sources (score snapshot time, burn amounts, timestamps) — never assert a number without saying where it came from.
4. Acknowledge when there isn't enough data to make a judgment, rather than guessing.
5. Tone: casual but professional, direct about red flags ("this looks like a rug setup") without being rude, jargon explained on first use.
6. Response length: concise, under ~200 words, bullet points for risk factors.

---

## Token listing & display

Tokens are indexed **automatically** — nobody applies to be listed.

- **Indexed (free)**: every token detected at creation on a supported launchpad appears with basic onchain data (name, ticker, image, price, market cap, liquidity, holders, txns).
- **Enhanced (paid, later)**: a verified owner adds profile info and can buy boosts.

Rules:
- Detection happens at launch through Helius webhooks on launchpad programs.
- Any token can be opened by contract-address search — tokens not caught at launch are resolved on demand.
- An unclaimed token shows the basic page, a "Trade on pump.fun" (or relevant launchpad) link, and a "Claim this token" button once claiming exists.
- Quality filters (minimum liquidity, holders, age, freeze authority, etc.) control who appears in Trending/New Pairs — they never control whether a token *exists* in the system.
- ClawPump is a launchpad. Tokens launched there get a "Launched on ClawPump" badge and appear in the ecosystem dashboard.

## Token page

Tabs (DexScreener parity, Solana only):
- Chart (embedded, not rebuilt)
- Txns
- Holders and top-10 concentration
- Bubblemaps (embedded — needs a real partner ID for production, not just the free iframe)
- KOL activity
- Top traders
- Score and AI explanation
- Token info (onchain data by default; owner-supplied once claiming exists)

Lists: Trending, New Pairs, Gainers/Losers, Volume, Liquidity — with filters and watchlists.

---

## Autonomous Agent Mode (monitoring/alerting — NOT trading, see the conflict flag above)

User: "Watch this token." Agent tracks liquidity, holders, burns, whales, volume. When something changes, it sends an alert:

```
AGENT ALERT

Token: ABC

Changes:
• Liquidity -12%
• Whale ownership +8%
• Volume +300%

Summary:
Price is rising but concentration is increasing.
Exercise caution.
```

## Natural language search

Users type things like "Find tokens under 5M market cap," "Show tokens with healthy liquidity," "Find launches with growing holders." AI translates natural language into filters — easier than a traditional screener's filter UI.

## Wallet intelligence

Users monitor whale wallets, founder wallets, smart money, KOL wallets, ecosystem wallets. Agent answers: "What is this wallet buying?", "Which launches are founders entering?", "Which wallets are accumulating?"

## KOL Intelligence

Track what Solana KOLs (key opinion leaders) are buying and selling.

**Features:**
- Live KOL feed: buys and sells, with size and market cap at time of trade
- KOL leaderboard: who actually makes money (today/7d/30d PnL, win rate)
- Per-token view: which KOLs bought or sold this token, and when
- Coordination alerts: several KOLs entering the same token
- KOL activity as one input to the token score

Plain-English examples: "3 KOLs bought this token in the last hour." / "2 KOLs sold in the last 30 minutes."

**Rules:**
- Show sells as prominently as buys — a KOL buy is not a safety signal.
- Only labeled wallets are tracked; KOLs use side wallets, so this is a signal, not the full picture.
- Include a "not financial advice" note.

**Data sources:**
- **Primary (team suggestion): MadeOnSol API** — 2,000+ tracked KOL wallets (Solana + Robinhood Chain), REST/WebSocket/webhooks plus an MCP server for AI agents, KOL PnL leaderboards, per-token breakdown, coordination detection, deployer profiles and alpha-wallet scoring (could feed Founder Reputation). Free API key; KOL feed ~5 min delayed on free tier, sub-second on paid; free tier ~200 requests/day.
- **Fallback: Solana Tracker Data API** — `/trades/kols` and `/trades/kols/{token}`, `/v2/pnl/leaderboard/kols`, wallet PnL/positions endpoints, WebSocket room `transaction:kol`. Free tier: 2,500 requests/month.
- Stream over WebSocket and cache — don't poll. Verify current free-tier limits before building. MadeOnSol appears to be a single-operator service (per its site footer) — keep Solana Tracker wired in as a fallback, don't depend on MadeOnSol alone.

## Ecosystem Intelligence

A dedicated dashboard tracking the ANSEM ecosystem, ClawPump launches, ecosystem volume, builder activity, trending projects. Agent answers: "What is happening in ANSEM today?", "What launches are gaining traction?", "Which projects are attracting whales?"

## Agent Feed

Daily report to users:
```
Market Summary

24h:
• 35 launches
• 4 strong tokens
• 8 risky tokens
• Whale activity increased 14%
• Liquidity up 22%

Top Opportunities:
ABC
XYZ

Highest Risks:
DEF
GHI
```

## AI-generated research reports

Every token automatically gets: risk summary, holder analysis, liquidity analysis, founder analysis, burn analysis. No manual research required.

## Smart alerts

Not just "price > X" — AI alerts on whale accumulation, liquidity drop, holder concentration shift, founder exit, unusual volume.

---

## Token utility & monetization

**Free tier**: screener, charts, basic AI.
**Premium tier** (token-gated): unlimited AI, agent monitoring, wallet tracking, API, smart alerts, portfolio intelligence.

Token unlocks premium features. **The score itself is never sold** — credibility is the moat. Near-term $ANSEM hook: gate agent monitoring behind $ANSEM (hold or pay); everything else stays free at launch.

**Monetization (later, not at launch):** nobody pays an unknown app, so trust and traffic come first. Design should leave room for: Token Info (profile picture, banner, name/ticker display, website/socials, description — display only, never changes onchain metadata), Boosts (paid trending multiplier + badge), Ads (manually-approved banner slots), Community takeover (later — needs dispute handling).

Requirements before any of that ships: ownership verification (only the deployer/authority wallet can edit a token, proven by a signed message), a moderation queue + report button (prevent impersonation), payments as a plain onchain transfer ($ANSEM, SOL, or USDC), verified onchain.

**Go-to-market**: hackathon teams tokenize in the same window and want attention — a free Clawrena tracker page that scores every team's token is the first source of traffic.

## Accounts & login

Proposed: **Privy** (auth + embedded wallets). Login options: continue with Email, Apple, Google/X, or Connect Wallet (Sign in with Solana).

**Team ask investigated and found infeasible**: auto-detecting whether a user has a Padre.gg and/or Fomo account after email/Google login. No public lookup exists for either; Padre runs its own accounts on Turnkey-managed wallets, each Privy app has its own separate user list, and a lookup like this would also leak whether an email has a trading account. A real "Continue with Fomo/Padre" button would only work through a partnership issuing standard JWT/OIDC tokens — ask both teams, don't count on it for the hackathon.

**Proposed alternative (user-declared, read-only)**: user logs in with email/Google/wallet → prompt "Where do you trade?" (Fomo / Padre / Other) → user pastes their public wallet address → if more than one, they pick a primary, which drives portfolio view, alerts, and KOL comparisons. **Never ask for private keys or seed phrases.**

---

## Technical stack (per the final spec)

| Layer | Choice |
| --- | --- |
| Frontend | Next.js, React, Tailwind |
| Backend | PostgreSQL, Redis |
| Blockchain | **Helius** (RPC, webhooks, streaming) — primary. Solana RPC. |
| Market data | Derived in-house from Helius events (bonding-curve/pool reserves, swap events) — no DexScreener dependency. GeckoTerminal/Birdeye are optional fallbacks only, never primary. |
| KOL data | MadeOnSol (primary), Solana Tracker (fallback) |
| Wallet graph | Bubblemaps (embedded iframe; real partner ID needed for production) |
| AI | ClawPump agent (Hermes-based), Claude, OpenAI, local models |
| Automation | Trigger.dev |
| Auth | Privy (proposed) |
| Hosting | Vercel (frontend) + a **long-running worker for streaming ingestion** — serverless functions can't hold open streams; webhooks can still hit an API route directly |

**Package-level reality in this repo (may lag the spec above — this is what's actually implemented right now):**

```
apps/
  frontend/   Next.js — UI + chain-data API routes
  backend/    NestJS — the "long-running worker" the spec calls for (currently holds a
              trade-execution module that needs repurposing — see the conflict flag)
packages/
  shared/     Prisma schema + client, score formula — single source of truth both apps import
```

- **Package manager: pnpm workspaces + Turborepo.** Never use `npm`/`yarn` — internal deps use `workspace:*`.
- **ORM: Prisma 7.** Not Drizzle — settled, don't revisit without discussion.
- **ESM throughout** — `packages/shared` and `apps/backend` use `moduleResolution: nodenext`. Relative imports inside `packages/shared/src` need explicit `.js` extensions even though the files are `.ts`.

### Versioning policy
When adding or upgrading any dependency: use the **latest stable, widely-adopted** release — not a bleeding-edge RC/beta, not a stale pinned major. Check the current stable dist-tag before pinning (`npm view <package> version`). Example already applied: Prisma 8 was an RC when this repo was set up, so we deliberately stayed on Prisma 7 (stable).

### Prisma 7 specifics (this bit us once already — don't redo the mistake)
- Generator provider is `"prisma-client"`, **not** `"prisma-client-js"` (that's the old v6 generator).
- The datasource `url` does **not** go in `schema.prisma` — it lives in `packages/shared/prisma.config.ts`.
- `PrismaClient` requires a driver adapter — we use `@prisma/adapter-pg` (see `packages/shared/src/db/client.ts`). Don't instantiate `PrismaClient` without `{ adapter }`.
- Regenerate after any schema change: `pnpm --filter @riven/shared db:generate`. Migrate (dev, interactive): `db:migrate`. Migrate (CI/production, non-interactive): `db:migrate:deploy`.

### `packages/shared` compiles to `dist/` — this matters for production builds
`@riven/shared`'s `package.json` (`main`/`types`/`exports`) points at `./dist`, not `./src`. In dev, `nest start --watch` and `next dev` are TS-aware enough to not care, but a real production run (`node dist/main.js`, no ts-node) needs the compiled output to actually exist first. `pnpm --filter @riven/shared build` runs `prisma generate && tsc`. `turbo.json`'s `dev` and `build` tasks both `dependsOn: ["^build"]`, so `pnpm dev` / `pnpm build` from the root build `packages/shared` automatically — but if you ever run an app directly with `pnpm --filter <app> build` in isolation, build `@riven/shared` first or you'll ship stale or missing `dist` output.

## Deployment

**Backend → Railway.** `railway.toml` (and `nixpacks.toml`) live at the **true repo root**, not inside `apps/backend/` — this matters and was hard-won (2026-09-24 incident, see below). Root Directory on the service is left blank (empty string, confirmed via the API), so Railway builds from the repo root, and `railway.toml`/`nixpacks.toml` sitting right there are picked up by Railway's zero-config auto-discovery with no per-service "Config File" override needed.

```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm --filter @riven/shared build && pnpm --filter backend build"

[deploy]
preDeployCommand = "pnpm --filter @riven/shared db:migrate:deploy"
startCommand = "node apps/backend/dist/main"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

Migrations run in `preDeployCommand`, not `buildCommand` — `prisma migrate deploy` needs a live `DATABASE_URL` connection, which is reliably available at deploy time; it's idempotent, so running it on every deploy is safe.

`startCommand` is `node apps/backend/dist/main` (not `dist/src/main`, and not bare `dist/main`) — two things about it are easy to get wrong. `nest build` flattens `apps/backend/src/main.ts` straight to `apps/backend/dist/main.js` (no `src/` segment in the output, per `nest-cli.json`'s `sourceRoot: "src"` + `tsconfig.json`'s `outDir: "./dist"`), and `startCommand` runs from the true repo root (same as everything else now), so the path needs the `apps/backend/` prefix too — omitting either half produces `Cannot find module` and an immediate crash loop.

`nixpacks.toml` overrides Nixpacks' auto-generated install phase to install pnpm as a plain global npm package (`npm install -g pnpm@12.6.0`) instead of letting Nixpacks resolve it through corepack — corepack's shim for pnpm's CJS entrypoint crashes with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` in this build image, independent of Node version (confirmed on Node 24, 22 and `>=20`, and confirmed again on 12.6.0). `builder = "NIXPACKS"` itself is also required: Railway's newer default builder, Railpack, runs its own internal dependency-caching pre-step before `buildCommand` ever executes that copies only the detected package's `package.json` (not sibling workspace packages) into an early layer — fundamentally incompatible with `workspace:*` dependencies.

**`pnpm-lock.yaml` is a multi-document YAML file — this is pnpm's own stable format (from pnpm 11.17+, once self-pinning support exists), not corruption. Do not strip or "fix" it.** pnpm 12.x self-pins its own version into `pnpm-lock.yaml` as a *second* leading YAML document (a `packageManagerDependencies` block plus `@pnpm/exe.*` platform packages), triggered by `package.json#packageManager`/`devEngines.packageManager` (needed for Railway/Vercel's own version detection, `onFail: "download"`). **An earlier version of this file documented this as corruption and shipped `scripts/fix-lockfile.mjs` to strip the leading document — that was wrong and has been removed (2026-09-25 incident).** Proven directly on a version that understands the format: `pnpm install --frozen-lockfile` (pnpm 12.6.0) succeeds against the natural 2-document lockfile every time (`Lockfile is up to date, resolution step is skipped`), and a plain `pnpm install` converges to that same 2-document state and stops touching the file further — it's stable, not something that "keeps happening." Stripping the leading document, however, broke Vercel's build outright: `Cannot update packageManagerDependencies with frozen-lockfile because the lockfile is not up to date` — Vercel's `vercel build` bootstraps pnpm via corepack-style self-pinning to match `devEngines.packageManager`, that bootstrap step needs to find the `packageManagerDependencies` entry already present and correct, and `--frozen-lockfile` forbids it from writing one in if it's missing (confirmed by reproducing the exact failure locally through `corepack prepare pnpm@12.6.0 --activate` against the stripped, single-document lockfile).

**Any pnpm older than ~11.17 cannot parse the multi-document lockfile at all** and fails hard with `ERR_PNPM_BROKEN_LOCKFILE: expected a single document in the stream, but found more` — this is a second, genuinely different failure mode from the stripping incident above, and it bit Railway specifically (2026-09-25): Nixpacks auto-detects a `pnpm-lock.yaml` and silently adds its *own* pnpm to the base `setup` phase's Nix packages (observed: `pnpm-9_x`, i.e. 9.15.9) regardless of what `[phases.install]` does, and that stray, much-older pnpm won either the PATH race or the actual invocation against our explicitly-installed 12.6.0. Confirmed against a **freshly recreated Railway service** (no stale build-plan cache possible), so this was never the plan-caching bug either — a third, independent failure mode. Fixed by pinning `[phases.setup].nixPkgs` in `nixpacks.toml` explicitly (`["nodejs_24", "openssl"]`, no pnpm entry), so Nixpacks never installs a second pnpm in the first place.

That fix had its own side effect, also caught the same day: pinning `nixPkgs` also drops whatever PATH plumbing Nixpacks' own pnpm-detection (backed by `railwayapp/nix-npm-overlay`) would otherwise set up for npm's default global-install location — the very next `RUN` step (each `[phases.install]` cmd is its own shell) then failed with plain `pnpm: command not found`, exit 127. Each `cmds` entry is a separate shell, so exporting `PATH` in one doesn't carry to the next.

Two fix attempts, in order, so the next person doesn't retry the first one: (1) `npm install -g --prefix=/usr/local pnpm@12.6.0`, guessing `/usr/local/bin` would be on `PATH` — **confirmed NOT reliably on PATH in this build image**, failed with the identical `pnpm: command not found`. (2) **What actually works**: stop guessing a fixed path and instead symlink into wherever `node`/`npm` themselves already resolve — proven reliable across every single RUN step in every one of these build logs, including the later `buildCommand`/`preDeployCommand`/`startCommand` steps (Nixpacks carries the build filesystem into the runtime image, it isn't a discarded build stage):
```toml
cmds = [
  "npm install -g --prefix=/usr/local pnpm@12.6.0 && ln -sf /usr/local/bin/pnpm \"$(dirname $(command -v node))/pnpm\"",
  "pnpm install --frozen-lockfile",
]
```

If `pnpm install` ever changes `pnpm-lock.yaml` (adds/updates the leading `packageManagerDependencies` document, or anything else), just commit it as pnpm produced it — don't hand-edit or script around it.

**Why these files live at the repo root and not `apps/backend/`:** the original setup (documented in an earlier version of this file) had `apps/backend/railway.toml` with an explicit "Config File" path set in the Railway dashboard, Root Directory left blank. That actually worked for a while — until the Root Directory was accidentally toggled to `apps/backend` while debugging a `workspace:*` resolution failure (Root Directory scopes the *build context* Railway hands the builder, so `apps/backend` as Root Directory meant `packages/shared` and the root lockfile were never present in the container — a `pnpm-workspace.yaml` `packages: ["apps/*", "packages/*"]` glob can't match directories that were never copied in). Clearing Root Directory back to blank fixed workspace visibility, but the dashboard's "Config File" override silently stopped saving — turns out Railway deprecated per-service "Config as Code" (the explicit config-file-path override) in favor of "Infrastructure as Code" (`.railway/railway.ts`, applied via `railway config apply`), and **blocks new opt-ins** for any service that never used the override before 2026-08-28 (confirmed directly via `railway api`: `serviceInstanceUpdate` on `railwayConfigFile` returns `BAD_USER_INPUT`, "Config as Code ... is deprecated ... cannot opt in"). Root-level `railway.toml`/`nixpacks.toml` sidesteps the deprecated override entirely — it's the *default* auto-discovery path, not the deprecated one — and also keeps the build context at the true repo root, fixing both problems with one change. If another service ever needs its own distinct Railway config in this repo, it'll need the `.railway/railway.ts` Infrastructure-as-Code path (`railway config init` / `railway config apply`), not a per-service `railway.toml`.

**Frontend → the product spec calls for Vercel**, not Railway (`Hosting: Vercel (frontend) + a long-running worker for streaming ingestion` — the backend above *is* that worker). So `apps/frontend` does **not** need a `railway.toml` by default. If you deploy it to Vercel: Vercel's zero-config Next.js detection doesn't know about the monorepo's shared package, so set a custom Build Command in the Vercel project settings — `pnpm --filter @riven/shared build && pnpm --filter frontend build` — same reasoning as the backend. **Do not** also run `db:migrate:deploy` from the frontend's build — migrations should run from exactly one place (the backend) to avoid two deploy pipelines racing on the same migration history.

If frontend ever does move to Railway instead of Vercel: a second service can't reuse the same root-level `railway.toml` (that file is already the backend's config, and per-service Config File overrides pointing elsewhere are the deprecated path — see above), so it would need Railway's Infrastructure-as-Code flow instead (`railway config init` / `.railway/railway.ts` / `railway config apply`), with `buildCommand = "pnpm --filter @riven/shared build && pnpm --filter frontend build"` and `startCommand = "pnpm --filter frontend start"` — same shared-monorepo reasoning, still no migration step.

## API contracts already built (chain & data side)

- `GET /api/leaderboard` → `{ tokens: [{ tokenId, mint, name, symbol, score, calculatedAt }] }` — top 100 by each token's latest score, highest first.
- `GET /api/token/[mint]` → `{ token, score, authorityCheck, recentBurns, recentAlerts }` — full breakdown for one token. `recentAlerts` (phase 7) is structured per-signal facts, not a bundled narrative.
- `POST /api/score` → internal-use, takes `{ tokenId, authorityGate, concentrationScore, burnScore, liquidityScore }`, computes and stores a `ScoreRun` row. This does NOT gather the raw numbers itself — that's the still-unbuilt indexer's job.
- `POST /api/agent/analyze` → currently a `501` stub. This is the agent endpoint's real home — build it against the Layer 3 spec and behavioral rules above, using `GET /api/token/[mint]`'s response as context.

## Data model — what's built vs. what the final spec needs

`packages/shared/prisma/schema.prisma` currently has: `Token` (with `launchpad`/`discoveredVia`), `TokenAuthorityCheck`, `HolderSnapshot`, `Burn`, `Pool`, `Trade` (swap events), `PairSnapshot`, `KolTrade`, `ScoreRun`, `Watchlist`, `Alert` (token-scoped event log, redesigned in phase 7 — was an unused per-user-subscription shape), `ExecutionLog` (the frozen trade-execution log — renamed from `Trade` in phase 2 to avoid the swap-event model's name). No `TokenZ500Rank` — z500 was dropped as a score input (phase 6) and the model removed with it.

**Not yet modeled, needed for the final spec's actual scope:** user accounts (Privy-based, plus the self-declared "where do you trade" wallet links), and whatever the "enhanced/claimed token" profile fields end up being once that phase starts.

---

## Hackathon context

Entry: **AnsemHack Clawrena** ($350K prize pool). Registration requires: register on the Clawrena registry, post an X announcement following @clawpumptech, and tokenize on ClawPump — the token itself is the entry, no tokenization means no award eligibility.

**Primary track: ClawPump × pump.fun.** "Novel tooling" fits what Riven is; scored on new tech (the spec's "ClawPump agent (Hermes-based)" stack choice directly targets this track's "new technology on the Hermes DeFi harness" scoring factor), onchain volume, and risk management. **Overall Winner** comes automatically with ClawPump tokenization. **Inference Markets (UsePod)** is a stretch, only if the agent's inference is made genuinely load-bearing through UsePod. **EasyA Kickstart** doesn't fit — different tokenize platform, different (utility-token-adoption) scoring metric.

**Early deployment timing is itself a judging criterion** — launching sooner earns a longer evaluation window. Don't hold tokenization for a "finished" product; ship a minimum tokenizable product early and keep shipping in public afterward.

---

## Commands

```bash
pnpm install
pnpm dev                                     # frontend + backend in parallel, via turbo
pnpm --filter @riven/shared db:generate    # regenerate Prisma client after a schema change
pnpm --filter @riven/shared db:migrate     # apply migrations
pnpm --filter <app> exec tsc --noEmit        # type-check a single app (frontend | backend)
```

## Reuse before you add

- DB access, table shapes, the score formula → `packages/shared` (`@riven/shared`). Never duplicate a Prisma model or re-implement `computeScore` locally in either app.
- UI primitives → `apps/frontend/components/ui` already has a full shadcn set. Check there before adding a new component or UI library.
- Env vars → copy the nearest `.env.example`, don't invent a new var name for something already named elsewhere.

## Open decisions

1. ~~Trade execution vs. monitoring~~ — resolved, see the top of this file. Monitoring only; `TradeService` stays frozen.
2. ~~Custody model~~ — moot now that trading is paused rather than pursued.
3. Model stack for the agent endpoint: Claude-only vs. also wiring in the ClawPump/Hermes agent and/or UsePod.
4. ~~z500 project-rank data source~~ — **resolved by scrapping it (2026-09-20).** The real endpoint was found and confirmed (`GET https://ansem.io/api/coins`), but it sits behind a Cloudflare JS challenge that blocks reliable server-side fetching (confirmed directly — scripted fetches with browser-like headers all 403'd; only a real browser session gets through). Rather than depend the score on an unreliable third-party fetch, z500 was dropped as a score input entirely: `TokenZ500Rank`/`Z500Tier` removed from the schema, `Z500PollService` deleted, formula weights redistributed to 40/35/25 (concentration/burn/liquidity). Full history in phase 6 below and in `docs/DECISIONS.md`. If ansem.io ever grants official API access, this could be re-added as a bonus signal — but it's not a gap blocking anything now.
5. KOL data provider: confirm MadeOnSol free-tier limits (~200 req/day) are workable, or lead with Solana Tracker instead.
6. Bubblemaps partner ID for production embedding.
7. Privy setup + the "where do you trade" wallet-linking flow.

## Chain & data phase roadmap (one branch per phase)

Dependency-ordered, not arbitrary — later phases build on earlier ones except where noted as parallelizable. Branch names: `chain-data/<n>-<slug>`.

| # | Branch | Scope | Depends on |
| --- | --- | --- | --- |
| 1 | `chain-data/1-launch-detection` | Helius webhook ingestion across pump.fun, Raydium LaunchLab, ClawPump; on-demand CA-search resolution for tokens missed at launch | none |
| — | ↳ status | **Built, not yet validated against real traffic.** See `apps/backend/src/launch-detection/`. Two known unverified pieces, both flagged in code comments: (1) the mint-extraction heuristic in `LaunchIngestService` — capture real payloads via `DEBUG_SAVE_WEBHOOK_PAYLOADS=true` (lands in `fixtures/helius-webhook-samples/`) and fix against reality; (2) `ClawPumpPollerService`'s API base URL/path — ClawPump has no on-chain program (it launches through pump.fun's own program with a per-launch creator wallet), so detection is API-polling only, and the exact REST path was never confirmed against their full API reference. pump.fun/LaunchLab program IDs in `packages/shared/src/chain/programIds.ts` ARE verified. Webhook auth guard smoke-tested (403 on missing/wrong header, 200 on correct). | |
| 2 | `chain-data/2-market-data` | Swap-event ingestion; price/market-cap/liquidity derived in-house from bonding-curve/pool reserves (pump.fun + PumpSwap first) | 1 |
| — | ↳ status | **Schema reconciled with `docs/BLUEPRINT.md` first** (see below), then built. `Pool`/`Trade`/`PairSnapshot` added; old flat `Swap` model removed (nothing depended on it yet). `apps/backend/src/market-data`: `SwapIngestService` ingests swaps into `Trade` (price per trade is exact — solAmount/tokenAmount ratio, no account-layout guessing needed); `SnapshotService` computes `PairSnapshot` every minute from recent trades. **`liquidityUsd`/`marketCapUsd` are deliberately left null, not faked** — both need a SOL/USD price feed and a real pool-reserve balance read, neither wired up yet. Same unverified-heuristic caveat as phase 1 applies to the pool-address extraction in `SwapIngestService` — validate against real captured payloads before trusting it. | |
| — | ↳ schema reconciliation | `docs/BLUEPRINT.md` (from the `chore/spec-and-rules` PR) proposed a richer model than phase 1 shipped with. Reconciled: added `Pool`, `Trade` (swap events), `PairSnapshot`; renamed the old trade-*execution* `Trade` model to `ExecutionLog` to avoid the name collision (TradeService itself untouched, still frozen); kept `TokenAuthorityCheck` as a history table rather than flattening to current-state fields on `Token`, since it's strictly more useful. `HolderSnapshot`/`KolTrade`/`User`/`LinkedWallet` from that doc are deferred to the phases that actually need them (3, 5, accounts). | |
| 3 | `chain-data/3-rug-signals` | Mint/freeze authority checker, LP-lock/burn detector, attributed-burn tagging, top-10 holder concentration | 1 (parallel with 2) |
| — | ↳ status | **Built.** `apps/backend/src/rug-signals/`. Confidence varies by piece: mint/freeze authority (`AuthorityCheckerService`) and top-10 concentration (`HolderConcentrationService`) use standard, stable SPL Token RPC methods (`getAccountInfo` jsonParsed, `getTokenLargestAccounts`, `getTokenSupply`) — high confidence, not heuristics. LP-lock is venue-aware: pre-migration bonding-curve pools are treated as locked by construction (no separate LP token exists to un-lock); AMM pools only check for the LP sitting at the verified incinerator address — locker-program detection (Streamflow etc.) is explicitly NOT implemented. Burn ingestion (`BurnIngestService`) counts both genuine `type: "BURN"` transactions and incinerator-address transfers, attributing to the deployer wallet; same unvalidated-against-real-payloads caveat as phases 1–2. Added `HolderSnapshot` to the schema (deferred from phase 2, needed now). `holderCount` is left null — exact unique-holder counts need a heavier `getProgramAccounts` call, not implemented yet. | |
| 4 | `chain-data/4-scoring-pipeline` | Wire 1–3 into `computeScore` via cron; make `/api/score`, `/api/leaderboard`, `/api/token/[mint]` actually live | 2, 3 |
| — | ↳ status | **Built and sanity-tested.** `apps/backend/src/scoring/ScoringService`, every 5 min. Closed a real gap left open in phase 2: `PairSnapshot.liquidityUsd` was null because a SOL/USD feed wasn't verified — but the formula only needs a *ratio*, so `packages/shared/src/score/inputs.ts` computes liquidity ratio in SOL terms (pool balance via `getBalance`, a standard/trivial RPC call — no USD conversion needed, units cancel). Concentration and burn ratios also converted to 0-10 sub-scores there (10% burned / 15% liquidity ratio = full score — documented, reasonable, **not validated against real outcomes**, same caveat as the formula's own weights). Per the product's "don't guess missing data" rule: a token with no `TokenAuthorityCheck`/`HolderSnapshot` yet is **skipped**, not scored with fabricated defaults. Manually verified the formula end-to-end with realistic healthy (score 74, green) and risky (score 0, hard-red gate, mint authority + unlocked LP flagged) inputs. `/api/leaderboard` and `/api/token/[mint]` needed no code changes — they already read real data, they just had nothing populated before this. | |
| 5 | `chain-data/5-kol-ingestion` | New KOL wallet/trade schema; MadeOnSol (primary) + Solana Tracker (fallback) ingestion | 1 |
| — | ↳ status | **Built.** Added `KolTrade` model. Followed `docs/BLUEPRINT.md`'s own suggested design: a `KolProvider` interface (`packages/shared/src/providers`) with `MadeOnSolProvider`, `SolanaTrackerProvider`, and `MockKolProvider` — the still-open "which provider" question (#5 below) becomes a runtime/env choice via `createKolProvider()`, not a code fork. MadeOnSol's base URL/auth/response shape are verified against their real docs (2026-09-20); their API doesn't return a tx signature, so `KolTrade.signature` is a synthesized composite key for that source — flagged in code, not silently assumed unique. Solana Tracker's base URL/auth/path are verified, but the exact response field names weren't available in what I could fetch — flagged as best-effort in code, validate before trusting. **REST polling, not streaming**: MadeOnSol's WebSocket is PRO-tier only. Poll cadence (30 min) is sized against Solana Tracker's tighter free-tier budget (2,500/mo ≈ 83/day) with real margin, not guessed. `USE_MOCK_DATA=true` (unset by default) runs the whole pipeline with no API key at all — verified end-to-end (provider selection + mock trades) without needing real credentials. | |
| 6 | `chain-data/6-z500-rank` | ~~z500 project rank~~ **Scrapped as a score parameter** | 1 |
| — | ↳ status | **Closed, not shipped.** Full arc: no data source found → real endpoint found and confirmed (`GET ansem.io/api/coins`) → confirmed the endpoint is Cloudflare-JS-challenge-protected and won't reliably fetch server-side → decided not to depend the score on an unreliable third party → z500 removed entirely (schema, `Z500PollService`, the `Z_f` formula term). Formula weights redistributed to 40/35/25. See open decision #4 above and `docs/DECISIONS.md` for the full history. Nothing else in the pipeline depended on this — z500 was always additive, never load-bearing. | |
| 7 | `chain-data/7-monitoring-alerts` | Build "watch this token → alert" (liquidity/holders/burns/whales/volume deltas) as **new** code — not by repurposing `TradeService`, which stays frozen per the resolved trade-vs-monitoring decision (see top of file) | 4 — unblocked now that decision 1 is resolved |
| — | ↳ status | **Built.** `apps/backend/src/monitoring/MonitoringService`, every 10 min, five independent signals: holder-concentration shift (≥10pp delta between consecutive `HolderSnapshot`s), volume spike (1h volume ≥3x the previous snapshot), unusual attributed burns (each one its own alert, no cooldown — every burn is newsworthy), authority/LP-lock change (any flip between consecutive `TokenAuthorityCheck`s, flagged as "got worse" when the dangerous direction), and KOL coordination (≥3 distinct KOL wallets buying in a rolling 60-min window, matching the spec's own wording). Each signal has an independent cooldown so a sustained condition (e.g. a KOL burst still inside its 60-min window) doesn't refire every cycle. **Deliberately outputs structured facts only** (`type`/`message`/`details` per `Alert` row) — not the spec's multi-signal narrative summary ("Price is rising but concentration is increasing..."); that bundling is the AI agent's job (product/agent side), same chain-data-produces-facts/LLM-explains-them boundary as the rest of this codebase. Redesigned the `Alert` model from an unused per-user-subscription shape to a token-scoped event log first, since nothing in code referenced the old shape and no server-side watchlist exists yet to target a specific user anyway. Wired into `GET /api/token/[mint]` as `recentAlerts`. | |
| 8 | `chain-data/8-hardening` | Redis wiring (unused so far), retention/archival for high-volume tables, graceful degradation for stale/unreachable RPC data, verified Railway deploy against a real Postgres instance | 4 |
| — | ↳ status | **Done.** All four pieces built and verified against the real production DB/Redis, not just locally. **Redis + rate limiting**: `packages/shared/src/redis` (`getRedisConnectionParams`, fixed a real bug in the team-supplied helper first — it logged "falling back to individual env variables" but then `throw`'d instead, never actually falling back), `@nestjs/throttler` + `@nest-lab/throttler-storage-redis` in `apps/backend`, global 100 req/60s, in-memory fallback when Redis isn't configured. `/health` and `/webhooks/helius` are `@SkipThrottle()`'d — the webhook's auth header is the real security boundary, and dropping a legitimate burst of Helius events would silently lose chain data. Verified against the real Redis: rate-limit count survived a full process restart (99→98→97, then 96 on a fresh process) instead of resetting, proving it's genuinely persisted. **Graceful degradation**: audited every cron service rather than assuming — found `SnapshotService`, `KolPollService`, and `ClawPumpPollerService` all processed a batch with no per-item try/catch, so one bad row could silently abort the whole cycle for every other item; brought them in line with the pattern already used correctly elsewhere (`AuthorityCheckerService` etc.). Added `withRetry` (`packages/shared/src/chain`) inside the actual RPC call sites (`splToken.ts`'s `rpcCall`, `heliusRpc.ts`'s `getAssetByMint`) so every caller gets transient-failure retries automatically. `/health` now reports basic staleness (tokens with no `ScoreRun` in the last 15 min) using timestamps every table already has — no new mechanism needed. **Retention**: `RetentionService`, daily, deletes rows older than `DATA_RETENTION_DAYS` (default 30) from the six highest-volume tables. Deliberately NOT archival to cold storage (S3 etc.) — no bucket, no format decided, premature for hackathon-scale data; documented as a conscious "not now." **Migration**: discovered along the way that no migration had EVER been run against the real Railway Postgres (`/health` returned `"the table public.tokens does not exist"`) — ran the actual first migration (`prisma/migrations/20260921071657_init`) against it. Re-verified `/health` afterward: `{"status":"ok","dataFreshness":{"totalTokens":0,...}}` — the database is live and working end-to-end for the first time this project has existed. | |

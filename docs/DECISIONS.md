# Decisions

## 2026-09-20 (proposed, pending repo owner confirmation)
- Product: ClawDex is a Solana-only AI intelligence terminal. It explains tokens; it does not trade.
- Trade execution is PAUSED. The custody model (per-user wallet vs pooled treasury) is unresolved. TradeService stays log-only.
- Stack is fixed: pnpm + Turborepo, Next.js, NestJS, Prisma/Postgres.
- Data source: Helius (webhooks). Market data is derived in-house. No DexScreener dependency.
- Free first. Payments and paid listing features come later.

## 2026-09-20 (chain-and-data side, phase 2)
- Accepted: trade execution paused, monitoring-only product. `TradeService` left untouched.
- Schema reconciled: BLUEPRINT.md's `Pool`/`Trade`/`PairSnapshot` model adopted for market data (phase 2), since it correctly separates bonding-curve pools from post-migration AMM pools — phase 1's flatter `Swap` model didn't capture that distinction and nothing depended on it yet, so it was removed rather than kept alongside. The trade-*execution* log (formerly named `Trade`, collided with BLUEPRINT's swap-event `Trade`) is renamed `ExecutionLog`. `TokenAuthorityCheck` kept as a history table rather than flattened to current-state fields on `Token` — see AGENTS.md for the full reconciliation notes.
- `liquidityUsd`/`marketCapUsd` on `PairSnapshot` are nullable and currently unpopulated (need a SOL/USD feed + real pool-reserve reads) — not faked as 0.

## 2026-09-20 (chain-and-data side, phase 6 — z500 found, then scrapped)
- Real z500 endpoint confirmed: `GET https://ansem.io/api/coins`, returns each ansem.io coin's `mint`, `tier` (free/gold/diamond), `status` (on_curve/migrated), `airdropTotal`, `priceUsd`, etc. Team captured a live response directly. `TokenZ500Rank` schema was rebuilt to match and `Z500PollService` built and wired into scoring.
- Then found a real problem: the endpoint sits behind Cloudflare's JS challenge. Confirmed directly — scripted fetches (with browser-like headers) all 403; a real browser session gets through. Would likely fail in production the same way.
- **Final decision: scrap z500 as a score parameter entirely**, rather than ship a scoring input that depends on an unreliable third-party fetch. `TokenZ500Rank`, `Z500Tier`, `Z500PollService`, and the `Z_f` formula term are all removed. Formula weights redistributed to 40/35/25 (concentration/burn/liquidity) — matches the project's original pre-z500 formula proposal. Nothing else depended on z500 (it was always additive, never load-bearing), so removal was clean.
- Not revisited unless ansem.io ever grants official API access, at which point it could come back as a bonus signal — not a current gap.

## 2026-09-20 (chain-and-data side, phase 7 — monitoring/alerts built)
- Built "watch this token → alert" as new code (`MonitoringService`), per the resolved decision that `TradeService` stays frozen and doesn't get repurposed into this.
- Redesigned `Alert` from an unused per-user-subscription row (userIdOrEmail + threshold + notifiedAt — nothing in code referenced it) to a token-scoped event log (type, message, details JSON, createdAt), matching docs/BLUEPRINT.md's original proposed shape minus the user link. No server-side watchlist exists yet (product/agent phase 3 is localStorage-only), so there's no reliable way to target a specific user server-side — matching alerts to watched tokens is a frontend concern once watchlists are DB-backed.
- Five signals, each with an independent cooldown to avoid refiring on a sustained condition: holder-concentration shift, volume spike, unusual attributed burns, authority/LP-lock change, KOL coordination (3+ distinct KOL wallets buying in a rolling hour).
- Scope boundary: this produces structured per-signal facts only, not the spec's bundled natural-language narrative ("Price is rising but concentration is increasing...") — that's the AI agent's job on the product/agent side.

## 2026-09-21 (chain-and-data side, phase 8 — Redis + rate limiting)
- Redis config (`packages/shared/src/redis`) built from a team-supplied helper, with one real bug fixed before adopting it: the original caught a `REDIS_URL` parse failure, logged "falling back to individual env variables," then `throw`'d anyway — never actually falling back. Now it does.
- Rate limiting: `@nestjs/throttler` + `@nest-lab/throttler-storage-redis`, global 100 req/60s, Redis-backed when configured, in-memory fallback otherwise (tested by booting with no Redis at all — works). `/health` and `/webhooks/helius` are exempted — the webhook's auth header is the real security boundary, and dropping real Helius events would be worse than any abuse a limit prevents there.
- Verified with curl, not just a type-check: confirmed real rate-limit headers on a normal route and their absence on the two exempted ones.

## 2026-09-21 (chain-and-data side, phase 8 — verified against the real production Redis)
- Team supplied the live Railway Redis URL. Connected directly first (PING/SET/GET round-trip, both succeeded) before trusting it through the app.
- Then proved the throttler storage is genuinely Redis-backed, not silently falling back to in-memory: hit the rate limit 3 times (99→98→97), killed and restarted the process, hit it again — remaining was 96, not reset to 99. In-memory storage cannot survive a process restart, so this confirms real persistence.
- One transient `ETIMEDOUT` logged on the very first raw connection attempt, succeeded on retry after. Worth knowing this proxy can have a slow first connection — not treated as a blocker.
- `REDIS_URL` is in `apps/backend/.env` (local only, not committed).

## 2026-09-21 (chain-and-data side, phase 8 — retention, graceful degradation, and the first real migration)
- Retention: `RetentionService`, daily, deletes rows older than `DATA_RETENTION_DAYS` (default 30) from the six highest-volume tables (`Trade`, `PairSnapshot`, `HolderSnapshot`, `TokenAuthorityCheck`, `KolTrade`, `ScoreRun`). `Burn`/`Alert` excluded — lower volume, more valuable kept longer. Deliberately not building archival to cold storage (S3 etc.): no bucket provisioned, no format decided, premature for hackathon-scale data. If disk ever becomes a real problem before that's worth building, lower the retention window first.
- Graceful degradation: audited every cron service instead of assuming they were all fine. Found `SnapshotService`, `KolPollService`, and `ClawPumpPollerService` all processed their batch with no per-item try/catch — one bad row could silently abort the whole cycle for everything else in it. Fixed to match the pattern already used correctly in the rug-signals/scoring/monitoring services. Also added `withRetry` inside the actual RPC call sites (not at every call site individually) so transient Helius/RPC blips get retried automatically everywhere.
- **Found along the way**: no migration had ever been run against the real Railway Postgres — `/health` returned "the table public.tokens does not exist." Ran the actual first migration (`20260921071657_init`) against it using the real `DATABASE_URL` the team had already shared. Re-verified `/health` afterward: connects cleanly, reports `dataFreshness` correctly on an empty DB. This is the first time the database has actually worked end-to-end.

## Still open
- Model stack for the agent endpoint (Claude-only vs UsePod).

## 2026-09-21 (audit fixes: data honesty, feed, score inputs)
- **Feed source:** the home feed is ClawDex's own index (`/api/leaderboard`, newest launch first, unscored tokens included). DexScreener enriches missing price/mcap/volume for display only and is a labelled fallback when the index is empty. "Trending" = 24h volume then score; "New" = launch time. Tokens created by on-demand CA resolution are excluded from the feed (their launch time is the lookup time).
- **API contract:** `/api/token/[mint]` and `/api/leaderboard` now map Prisma rows onto the BLUEPRINT section 4 shape (`lib/contract.ts`). Before this, the UI read fields that did not exist on DB rows and a fully revoked token rendered as "authority live".
- **No fabricated UI data:** removed the canned agent replies, fake alert/stat cards and fake ecosystem numbers. The agent page now calls `POST /api/agent/analyze` (grounded facts; uses the Claude API when `ANTHROPIC_API_KEY` is set, otherwise returns a deterministic facts summary). Ecosystem stats are counted from the database.
- **Score gate 0:** a token failing two or more authority/LP checks now scores its component total capped at 20. Previously `0 x total` made the documented cap of 20 dead code and every such token scored 0.
- **Concentration:** top-10 excludes program-controlled owners (bonding curve, AMM vaults), pool addresses and the incinerator; denominator is total supply. Owners that are nonexistent accounts are treated as wallets (never excludes a possible real holder).
- **Unknown is not zero:** no pool means LP status is unknown, so no authority check is written and the token is not scored; liquidity that cannot be determined skips the token instead of scoring 0.
- **pump.fun curves:** ClawPump tokens get a `PUMPFUN_CURVE` pool at ingestion (bonding curve address from pump.fun's coin API, which rate-limits with 429 and needs backoff). Reserves are read on-chain (`readBondingCurves`, batched `getMultipleAccounts`) and validated against pump.fun's API. Liquidity ratio = real SOL reserves / market cap (SOL). A completed (migrated) curve is treated as unknown.
- **ClawPump poller** uses the real public endpoint `GET https://clawpump.tech/api/tokens` (`mintAddress`, `imageUrl`, `createdAt`). The old `/tokens_list` path returned 404.
- **Still open:** weights and thresholds are unvalidated (no backtest); burns carry 35% of the score; pump.fun/LaunchLab ingestion needs the Helius webhook on a public URL; trading, Privy login, watchlist and the sakzbot futures tab are unbuilt.

## 2026-09-22 (ideas ported from C:\dev\clawdex, rebuilt on real data)
- **Auth:** real Privy only (`components/auth/auth-provider.tsx`, `lib/privy-server.ts`). With no `NEXT_PUBLIC_PRIVY_APP_ID` the UI says sign-in is unavailable; the old fake localStorage login (hardcoded wallet, any email code accepted) was not ported. `/api/profile` verifies the Privy access token server-side and derives login method, email and wallet from Privy, never from the client; it returns 503 when `PRIVY_APP_SECRET` is not set.
- **Onboarding:** "Where do you trade?" (FOMO / Padre / Jupiter / other) plus an optional public trading wallet, stored in the new `user_profiles` table (migration `20260921230000_user_profiles`, additive). Self-declared, optional, used for personalisation and market research.
- **Terminal:** `/terminal` is master-detail (token list beside a detail panel with score, authority checks, market data, KOL trades and an inline agent box) plus KOL Intel and Signals views. KOL leaderboard ranks by MadeOnSol's 7d win rate and shows only volume seen in the feed (no PnL: not available). Coordination = 3+ distinct KOL wallets buying one token in an hour, computed from the feed. Signals = the `Alert` table.
- **Agent:** `POST /api/agent/analyze` also answers market questions without a mint as a filter over the feed (states the filters applied and how many tokens matched). Home page has an ask bar wired to it.
- **Landing:** `/landing` is an animated intro with counts read live from the database and MadeOnSol.
- **Not verified:** the live Privy login and onboarding save (no app id or secret in this environment). Verified: unconfigured behaviour, the configured render path with a dummy id (no crash, "Sign in" button shown), API 503 paths.

## 2026-09-22 (score shown out of 10)
- The score is displayed out of 10 (one decimal) everywhere in the UI, the agent's answers and the screener. Storage and API values stay 0-100 (`score_runs.score`, `/api/*` `score`), so the formula, bands (7+ healthy, 5-6.9 caution, below 5 risky) and gate cap (2/10) are unchanged. Use `score10()` in `lib/format.ts` for display.

## 2026-09-22 (terminal UI rebuild)
- **One app surface.** `/terminal` is the product: token list beside a detail
  pane, with KOL Intel and Signals as sibling views. Desktop keeps master-detail;
  below `lg` it becomes a drill-down (tap a row → full-screen detail → "Back to
  list") because a stacked master-detail is unusable on a phone.
- **Detail pane is tabbed** (Chart · Safety · Holders · KOL) with the header,
  trade links and stat grid always visible. Chart is the default tab: a trading
  terminal that hides the chart behind a click is the wrong default.
- **Embeds instead of rebuilding.** Price chart is the DexScreener pair embed and
  the holder cluster map is the Bubblemaps iframe (`iframe.bubblemaps.io`, whose
  `frame-ancestors` allows localhost). Both verified frame-embeddable before use.
  Bubblemaps runs in demo mode until `NEXT_PUBLIC_BUBBLEMAPS_PARTNER_ID` is set,
  so a missing map is surfaced with a link out, not hidden.
- **Holder bars are scaled to the largest holder, not to 100%.** Typical
  concentration here is a few percent, so absolute-width bars all collapse to a
  hairline and the distribution is unreadable. The scale is stated on the panel
  and every row still carries its true percentage. Excluded (bonding-curve, pool,
  incinerator) accounts are listed separately with the reason.
- **No swap of our own yet, so trade links hand off** to pump.fun / Jupiter /
  DexScreener / Solscan rather than implying ClawDex executes the trade.
- **Watchlist is real** (`hooks/use-watchlist.ts`, browser-local, every
  localStorage access guarded). Stars on every row; `/watchlist` was a dead
  placeholder before.
- **Navigation aligned.** The mobile bar and desktop nav now name the same
  destinations; the "Scoring" slot pointed at a marketing anchor and became
  Watchlist, and the landing CTA opens the terminal rather than the agent page.
- **Feed enrichment is parallel.** DexScreener lookups are chunked 30 at a time
  and were being awaited in sequence, so first paint cost the sum of every chunk.

## 2026-09-22 (terminal navigation: Tokens / Perps / Watchlist + token categories)
- **Top menu** is Tokens · Perps · Watchlist · KOL Intel · Signals. Watchlist is a
  view over the same feed rather than a separate fetch, so the ★ state is shared.
  KOL Intel and Signals were kept rather than dropped — both are built and carry
  real data.
- **Token categories**, each ranked by the signal it is named after, and each
  dropping tokens that lack that signal instead of padding the list:
  - *Crypto* — CoinGecko reference prices for majors. Explicitly not ClawDex-scored.
  - *Trending* — 6h volume first, then 24h, then score (the "2-48h" window).
  - *Most held* — wallet count, newly available: `holderCount` was always null
    until `HolderConcentrationService` started reading Helius DAS
    `getTokenAccounts`. Counts above one page are "at least" that many.
  - *Graduated* — bonding curve complete, or the token has a non-curve pool.
  - *Bonding* — still on the curve, closest to graduating first. Progress is
    `1 - realTokenReserves / 793.1M`, the curve's own initial reserve, read from
    the account rather than inferred from a SOL threshold.
  - *King of the hill* — highest market cap still on the curve. Labelled as that
    rather than claiming to mirror pump.fun's internal KOTH state.
  - *Gainers* — 24h change, restricted to tokens with real volume.
  - *Community* — has a linked X account, site or Telegram, from ClawPump's list
    (the only source that reports socials for these tokens); X-verified first.
- **Perps is a deliberate placeholder.** Nothing is wired up and the panel says so,
  pending a decision on venue and the scanner behind it.
- **The homepage no longer features a specific token.** It singled out whichever
  token happened to top the feed, and cost an extra per-request token lookup. The
  "problem" section now always uses the labelled sample illustration.

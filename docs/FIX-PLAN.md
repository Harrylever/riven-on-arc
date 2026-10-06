# ClawDex fix and build path

> Status 2026-09-21: Phase 1 and most of Phase 2 done; agent endpoint (Phase 4) built without LLM verification; score fixes 3.1, 3.2, 3.4 done; see the 2026-09-21 audit entry in DECISIONS.md. Still open: backtest and reweighting (3.3, 3.6), extra rug signals (3.5), swap (Phase 5), futures (Phase 6), Privy/watchlist (Phase 8), webhook ingestion for pump.fun/LaunchLab.

Compiled 2026-09-21 from the audit session. Hard deadline: registration and tokenization close **2026-10-01 24:00 EST**; winners 2026-10-08. Earlier shipping gets a longer judging window.

Owners follow the README split: **C&D** = chain and data (`packages/shared`, `apps/backend`, score/leaderboard/token API routes), **P&A** = product and agent (rest of `apps/frontend`), **G&O** = growth and ops (no code).

## 0. Decisions to make first (blockers)

| # | Decision | Recommendation | Unblocks |
|---|---|---|---|
| D1 | Reverse "explains, doesn't trade" in `DECISIONS.md` and `BLUEPRINT.md` | Yes. Trading volume is a judging metric and the product is now "FOMO + DexScreener with AI" | Phase 4 |
| D2 | Custody | Non-custodial. The user's wallet signs, ClawDex never holds keys. Privy embedded wallet for one-click | Phase 4 |
| D3 | Agent model stack | Start Claude-only behind `explainToken(facts, question)`. Add ClawPump/Hermes or UsePod later behind the same function | Phase 3 |
| D4 | Futures (sakzbot) | Read-only scanner, separate tab, feeds an agent tool. No execution. Confirm venue (Drift, Jupiter Perps or CEX) | Phase 6 |
| D5 | Score is "passes these checks", not "safe" | Adopt the wording change | Phase 2 |

## 1. Stop the bleeding (day 1, about half a day)

1. **Rotate and remove the hardcoded MadeOnSol key.** `apps/frontend/lib/kols.ts:33` has a fallback `msk_...`. Rotate at MadeOnSol, delete the fallback, fail soft when the env var is missing. (P&A)
2. **Mock mode must not be silent.** `.env.local` was set to `USE_MOCK_DATA="true"` during the demo, which made real CAs return "Token not found". Keep it `false` by default and keep the banner. Add a visible live/mock indicator that names the data source of the feed. (P&A)
3. **Stop trusting example env values.** Provide a real `DATABASE_URL` (Railway) and `SOLANA_RPC_URL` (Helius) in `apps/frontend/.env.local`. The example credentials return 500 on `/api/leaderboard` and `/api/token/[mint]` and add 3-10 seconds to every page. (C&D)
4. **Protect `POST /api/score`.** It has no auth. Add a shared-secret header check or remove the route now that `ScoringService` writes scores. (C&D)
5. **Reconcile `.env.example` files** with what the code reads (`MADEONSOL_API_KEY`, `CLAWPUMP_API_BASE_URL`, `ANTHROPIC_API_KEY`, `AGENT_MODEL`). (both)

## 2. Make the data honest and the feed work (days 1-3)

### 2.1 Feed and search bugs (P&A + C&D)
- **DB leaderboard drops market data.** `app/api/leaderboard/route.ts` returns only id, mint, name, symbol, score, calculatedAt. Cards then show `— — —`. Join the latest `PairSnapshot` per token and return price, market cap, liquidity, volume and 24h change, plus `imageUri`, `launchpad` and `firstSeenAt`. Also compute the latest score per token in SQL instead of loading every `scoreRun` row into JS.
- **"Trending" is not trending.** The DexScreener fallback in `lib/api.ts` uses `token-profiles/latest`, which is a paid-profile feed and contradicts "no paid boosts". Replace it with ClawDex's own launches from the DB (Helius webhooks), ranked by volume growth, holder growth and score. Keep DexScreener only as an explicitly labeled temporary fallback until ingestion is live, or drop it.
- **"New" tab is a no-op.** Fallback tokens all get `calculatedAt = now`. Sort by `firstSeenAt` / `pairCreatedAt`, and make "New" a real new-pairs list.
- **Feed size and speed.** Only 9 cards, sequential per-token DexScreener calls (N+1). Batch (`/tokens/v1/solana/{a,b,c}`, up to 30 addresses) and cache. Add pagination or infinite scroll.
- **Any string opens a token page.** `getTokenByMint` never returns null in live mode, so garbage renders a "Solana Token" page. Validate base58 and length, then confirm the mint exists on chain (mint account lookup) before rendering. Return the not-found page for real misses.
- **Search.** Verify the top-bar search and ⌘K (not tested in the audit). It says "token, wallet, or ask anything" but only handles mints. Add ticker/name search against the DB.
- **Dead nav.** "KOL Intel" links to `/#kol` and nothing has that id. Build the KOL tab (Product phase 4) or remove the link.

### 2.2 Stale or stub things presented as live (P&A)
- `/api/agent/analyze` is a 501; the agent page and landing chat use canned replies on a `setTimeout` (`app/agent/agent-client.tsx`, `components/landing/DemoAgentChat.tsx`). Label them "demo" until Phase 3 ships.
- Watchlist page is a placeholder (Phase 3 in product numbering).
- Ecosystem page claims everything is "fully live". Reword until the data is real.
- Landing page copy: "Every launch hits the scanner the block it's created" and "updated every block" are not true (5 and 10 minute crons). Correct them.
- `docs/PRODUCT-STATUS.md` and `docs/PHASE-STATUS.md` should be updated to reflect what this plan changes.

### 2.3 Backend unvalidated pieces (C&D)
- Set `CLAWPUMP_API_BASE_URL=https://clawpump.tech` and test the public `GET /api/tokens` (`limit`, `offset`, sort `new|hot|mcap|volume`) against `clawpump-poller.service.ts` parsing.
- Validate Helius webhook parsing and mint extraction against real payloads (`fixtures/helius-webhook-samples`).
- Validate the Solana Tracker / MadeOnSol response shapes used by `kol-poll.service.ts`.
- Run the backend for real (needs Postgres, Redis, Helius) so the DB actually fills. Today the DB is empty, which is why the frontend leans on DexScreener.
- Populate `liquidityUsd` / `marketCapUsd` on `PairSnapshot` (needs a SOL/USD feed).
- Compute `holderCount` (currently null).

## 3. Make the score defensible (days 2-5)

Current formula: `score = gate x (40*C + 35*B + 25*L)`. Findings and fixes:

1. **Dead cap.** With gate 0 the score is `0 x anything = 0`, so `Math.min(x, 20)` never applies. Docs and UI say "capped at 20". Either make gate-0 tokens floor at their computed value capped at 20 (change the formula), or change the docs and UI to say 0. Pick one and align `formula.ts`, `BLUEPRINT.md` and the UI. (C&D)
2. **Concentration counts curve and pool accounts.** `holder-concentration.service.ts` sums the top 10 token accounts, including the pump.fun bonding-curve account and AMM vaults, which can hold most of the supply. Exclude bonding-curve, pool vault, incinerator and known program accounts before computing `top10Pct`. (C&D)
3. **Burn is 35% of the score.** A token with zero burns can never exceed 65 and cannot reach "Healthy". Burns are gameable by a deployer. Reweight after the backtest, and consider using burns as a bonus rather than a core term. (C&D)
4. **Liquidity silently becomes 0 on RPC failure** in `scoring.service.ts`. Treat as unknown: skip the term and say so, do not lower the score. (C&D)
5. **Add missing rug signals**, each behind the same "skip and say so" rule:
   - dev/creator holdings and sells
   - sniper and bundled-wallet share in the first blocks
   - wallets that appear to be the same owner (Bubblemaps-style clustering)
   - creator's launch history
   - Token-2022 extensions (transfer fee, permanent delegate) and mutable metadata
   - LP lock duration and expiry
6. **Backtest before trusting any weight.** Collect 200-500 past launches, label outcomes (e.g. price down 90% or more within 24 hours, or LP pulled), compute score at t+5 minutes and t+1 hour, and report precision/recall by band. Publish the hit rate. Retune weights and thresholds from it. (C&D)
7. **Trust and wording.** Show gate results plus the three component values, a confidence label, and a "data as of" timestamp on every score. Replace "safe" and "Healthy" wording with "passes these checks" (D5). Document the formula on the Scoring page.

## 4. The agent, the moat (days 3-6, P&A)

- Implement `POST /api/agent/analyze` (`{ mint, question? }`) behind `explainToken(facts, question)`; build `TokenFacts` from `GET /api/token/[mint]` plus recent `PairSnapshot` and `KolTrade`.
- Guardrails from `BLUEPRINT.md` section 6: no buy/sell recommendations, always end with "Not financial advice. DYOR.", cite score components and snapshot timestamps, say when data is missing, under about 200 words.
- Replace the canned chat in `agent-client.tsx` and the landing chat with the real endpoint; stream responses.
- Add a second tool for futures data from sakzbot (Phase 6) and for pre-filling a swap (Phase 5). The agent proposes, the user confirms.
- Natural-language search ("healthy liquidity low risk") after the base agent works (Product phase 5).
- Add tests: a fixture-based check that the agent never emits a buy/sell recommendation and always cites data.

## 5. Native swap and trading (days 5-8)

Depends on D1 and D2.

1. **Replace the dead Jupiter client.** `apps/backend/src/trade/jupiter.client.ts` uses `quote-api.jup.ag/v6`, which no longer connects. `lite-api.jup.ag/swap/v1/quote` returned 200 in the audit; confirm the current endpoints and the referral-fee mechanism before building.
2. **Swap panel on `/token/[mint]`, frontend-side.** Quote, build the transaction, wallet signs, send. Fall back to the pump.fun route for bonding-curve tokens Jupiter cannot route.
3. **Risk gate in the trade flow.** Before confirming, show authority gate, top-10 concentration, LP lock and a one-line verdict. Warn or block under a user-set score threshold. This is the differentiator against FOMO/Padre.
4. **Privy embedded wallet** (Product phase 8) for one-click with pre-approved signing; wallet-adapter as fallback.
5. **Settings:** slippage, priority fee, Jito tip / MEV protection, default buy presets (0.1 / 0.5 / 1 SOL), block-under-score threshold, RPC choice, notification channels.
6. **Log signed swaps** to the DB (do not reuse the frozen `Trade` / `ExecutionLog` models without agreeing on it) for positions and PnL.
7. **Referral fee** on swaps as the revenue line for the demo.
8. Remove or repurpose `TradeService`'s "would BUY" logging loop, which conflicts with the non-custodial model.

## 6. Futures layer from sakzbot (days 6-9, optional stretch)

- Confirm with Sakz: read-only (yes), venue, language (TypeScript fits the monorepo), how often it runs, the schema of a ranked pair.
- Run it on a schedule and write results to a new table or a JSON feed. Do not mix it into the memecoin score.
- Add a `/futures` tab (ranked pairs, why each scored high) and an agent tool that reads it.
- Label the "moon potential" score as a signal with the same "Not financial advice" disclaimer.

## 7. Product parity with Padre/Axiom/GMGN/Photon/BullX (rolling, prioritize by demo value)

Sources for this list are general knowledge, not verified for this audit; re-check the live products.

Priority now: three-column board (New / About to Graduate / Graduated), holder tags (dev, sniper, bundler, insider %), bonding-curve progress, one-click quick-buy on cards, trade markers on the chart, hotkeys.
Later: wallet tracker and copy-trade, positions and PnL, limit and take-profit/stop-loss orders, Telegram bot and push alerts, mobile polish, multi-wallet, filters, comments.

## 8. Accounts, watchlist, alerts (days 4-8, P&A)

- Watchlist in `localStorage` first (Product phase 3), then DB sync after Privy.
- Login page (none exists; Sakz confirmed).
- Surface `recentAlerts` from `/api/token/[mint]` (already returned, not shown).
- Daily agent summary and smart-alert UI (Product phase 7) depending on the backend `MonitoringService` events.

## 9. Hackathon requirements (G&O, do before 2026-10-01)

- Tokenize on ClawPump (sign in with Google at clawpump.tech, `npx clawpump launch` or the dashboard). Without the token there is no award eligibility.
- Register on the Clawrena registry and post the X announcement following @clawpumptech (per `AGENTS.md` line 328; confirm with the organizers, the public page did not list these steps).
- Get a `cpk_` key from `clawpump.tech/dashboard/api` only if the ClawPump/Hermes agent or ClawPump launch API will be used. It is not needed for the Claude-based agent or for the public `/api/tokens` poller.
- Deploy the frontend (`docs/DEPLOY-FRONTEND.md`) and the backend (Railway) early; earlier shipping means a longer evaluation window. Real onchain volume and users are judged, so get the swap live and get real users on it.
- Prepare the demo narrative: risk gate before a swap, grounded agent, feed no one can pay to rank in, futures tab.

## 10. Suggested calendar (today is 2026-09-21)

| Days | Work |
|---|---|
| Sep 21-22 | Phase 0 decisions, Phase 1, start Phase 2.1 and 2.3 (live data), tokenize on ClawPump |
| Sep 23-25 | Finish Phase 2, score fixes 3.1-3.4, agent endpoint (Phase 4) |
| Sep 26-28 | Swap with risk gate (Phase 5), Privy, deploy |
| Sep 29-30 | Backtest and reweight, futures tab if time, polish, demo |
| Oct 1 | Registration and tokenization close (24:00 EST), submit |

## 11. Definition of done for each phase

- **Phase 1:** no secret in source, `USE_MOCK_DATA=false` in the running app, DB reachable, no 500s from `/api/leaderboard` or `/api/token/[mint]`.
- **Phase 2:** home feed shows at least 20 tokens with price, MC, liquidity and 24h, sorted by a real trending metric; "New" differs from "Trending"; a random string returns not-found; pages load under 2 seconds warm.
- **Phase 3:** a documented formula whose gate-0 behavior matches the UI, curve/pool accounts excluded, and a published backtest result.
- **Phase 4:** the agent answers real questions on real tokens with citations and passes the no-advice tests.
- **Phase 5:** a mainnet swap of a small amount completes through the app with the risk gate shown first.

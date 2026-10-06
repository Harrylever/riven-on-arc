# Product & agent — phase status

Quick export of `docs/PRODUCT-AGENT-PHASES.md`. One branch per phase, `product-agent/<n>-<slug>`. Full details and design principles live in `docs/BLUEPRINT.md` and `AGENTS.md`.

| # | Branch | Status | What it is |
| --- | --- | --- | --- |
| 1a | `product-agent-dev` | ✅ Built | Feed screen (`/`): single-column cards, score badge and plain-English verdict. Consumes `GET /api/leaderboard` via `lib/api.ts`, with a mock-data fallback (`USE_MOCK_DATA`) and a live DexScreener fallback when the DB has no scored tokens yet — see the open question on the DexScreener fallback in `AGENTS.md`. |
| 1b | `product-agent-dev` | ✅ Built | Token breakdown page (`/token/[mint]`): score card, authority gate indicators, sub-score breakdown, recent burns, market data. Consumes `GET /api/token/[mint]` via `lib/api.ts`. Does not yet surface `recentAlerts` (phase 7 data) — `TokenDetailResponse` has no field for it. |
| 1c | `product-agent-dev` | ✅ Built | Contract-address search page (`/search`) with base58 validation and on-demand resolution via `/token/[mint]`. |
| 2 | `product-agent/2-agent-analyze` | 🟡 Built, LLM path untested | `POST /api/agent/analyze` + chat UI, grounded on `TokenFacts` (`lib/agent.ts`). Deterministic facts summary works without a key; the Claude call activates with `ANTHROPIC_API_KEY` and has not been exercised against the live API. |
| 3 | `product-agent/3-watchlist-local` | ⏳ Unbuilt | Watchlist (`/watchlist`) backed by browser `localStorage`. No authentication required. |
| 4 | `product-agent/4-kol-intelligence-ui` | 🟡 Partial | `/kol` page shows the MadeOnSol feed (buys and sells equal, delay and as-of, disclaimer). The per-token KOL tab reads the same feed. Not yet reading `KolTrade` rows. |
| 5 | `product-agent/5-natural-language-search` | ⏳ Unbuilt | Natural language search bar translating text queries (e.g., "healthy liquidity low risk") into filter parameters. |
| 6 | `product-agent/6-ecosystem-dashboard` | ⏳ Unbuilt | Dedicated ANSEM / ClawPump ecosystem screen (`/ecosystem`) showing ClawPump launches, volume, and community rankings. |
| 7 | `product-agent/7-agent-feed-alerts` | ⏳ Unbuilt | Daily agent summary report and smart alerts notification UI. Depends on chain-and-data phase 7 (`Alert` model events). |
| 8 | `product-agent/8-privy-accounts` | 🟡 Built, live login untested | Privy sign-in, "Where do you trade?" onboarding stored in `user_profiles`, verified `/api/profile`. Needs `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_SECRET`. Watchlist DB sync not done. |
| 9 | `product-agent/9-polish-hardening` | ⏳ Unbuilt | Mobile-first responsive polish, loading/error skeleton states, Bubblemaps iframe embed with partner ID, and virtualization for large lists. |

**Current Branch:** `product-agent-dev`

# Review Council Report

**Scope:** full codebase, working tree == baseline commit `38dc96c` (local repo created for this audit; `origin` is a local bare backup at `../riven-backup.git`)
**Files considered:** 370 tracked (node_modules / .next / dist ignored)
**Specialists run:** correctness, security, policy-boundary, test-evidence, architecture, interface
**Verdict:** CHANGES_REQUIRED — six High correctness findings (scorer/indexer produce false "fake"/"rug" verdicts), two High policy findings.

## Findings

### High (8)

| # | Where | Finding | Specialist |
|---|---|---|---|
| H1 | `apps/backend/src/arc/scoring.service.ts:589-598` | "USDC in the pool" = Σbuys − Σsells; ignores liquidity adds/removes, clamps to 0 → false WASH ("only $0 stayed in the pool"), false UNPROVEN, hides real tokens. | correctness |
| H2 | `apps/backend/src/arc/scoring.service.ts:333-337` | LP_REMOVED sums raw liquidity units across all positions/LPs; any third-party add+remove of a narrow range flips the token to "rug", fires RUG_PULL and poisons the creator's track record. | correctness |
| H3 | `apps/backend/src/arc/scoring.service.ts:555-560` | Creator `soldPct` counts burns, LP seeding and locker transfers as selling → false CREATOR_DUMP (fake, capped 4.9). | correctness |
| H4 | `apps/backend/src/arc/activity-indexer.service.ts:143-154`, `market-sync.service.ts:123` | Tokens leave the activity follow-set while the global cursor advances; their transfers are lost forever but balances stay "complete". | correctness |
| H5 | `apps/backend/src/arc/activity-indexer.service.ts:281-293` | WHALE_DUMP fires on initial pool seeding / liquidity adds (any ≥5% transfer into PoolManager). | correctness |
| H6 | `apps/frontend/hooks/use-portfolio.ts:256-266, 441` | Paper perp positions are never marked to market: PnL always 0, TP/SL/liquidation never trigger. | correctness |
| H7 | `apps/frontend/lib/deployer.ts:64-80, 208-251`, `app/api/deployer/[wallet]`, `app/api/agent/analyze` | Fabricated deployer track records seeded from a hash of the wallet string; labels wallets "scammer" / "VERIFIED SAFE", says "Avoid trading". Violates agent rules + no-fabrication rule. | policy |
| H8 | `apps/frontend/lib/arc-trade.ts`, `app/api/arc/trade`, trade UI | Wallet buy/sell contradicts README/AGENTS/GEMINI "monitoring only — never buys or sells". Needs an explicit team decision + doc update, or a flag. | policy |

Also confirmed by the audit's own DB check: all 95 scored local tokens were `risk` (avg 3.2/10) with 92 carrying DEAD — the `circulatingPct < 1` rule (`packages/shared/src/score/arc.ts:283`) marks young launchpad tokens and busy flipped tokens (ARCIA: 3,278 trades/24h) as dead. **The "99% caught faking" headline is substantially an artefact of H1–H3 + DEAD, not a finding.**

### Medium (selected, consolidated)

- **Unlimited approvals** — `maxUint256` to Permit2 and 30-day `maxUint160` to the router, labelled "(one time)" (`arc-trade.ts:176,178,189`). Standard Permit2-drainer precondition. *(security)*
- **Raw RPC/DB error text returned to anonymous callers** (`apps/backend/src/app.ts:61,76,118`) — leaks RPC URL/key if a keyed provider is used. *(security)*
- **Heavy unauthenticated read endpoints, in-memory filtering, 600/1500-row caps** (`lib/arc-data.ts:286-322,443`; shell polls `/api/arc/status` every 30s). Wrong totals and slow pages. *(security, architecture, correctness, test-evidence)*
- **Backend rate limiter keys on client-controlled first X-Forwarded-For hop** (`apps/backend/src/lib/rate-limit.ts:43-46`). *(security)*
- **Fake detection split between shared scorer and frontend** (BRANDS impersonation, duplicated wash rule, symbol-only copycat count, English-text code matching) → screener can hide a token the scorer rates healthy. *(architecture)*
- **Perps flag defaults ON**, contradicting AGENTS.md and `.env.example`; nav links ignore the flag. *(policy, interface)*
- **Error states masquerade as "all clear"** — alerts "Quiet for now", search "No match", watchlist "Nothing saved", wallet "Loading…" forever on API failure. *(interface)*
- **~15 Solana-era API routes and 4 pages still public in Arc mode** with stale/wrong answers; sitemap advertises them. *(interface, architecture)*
- **Backend defaults to Solana jobs when `CHAIN_MODE` unset; retention prunes Arc ScoreRuns after 30 days.** *(architecture)*
- **Two design-token systems; second `:root` silently overrides the first** (`globals.css:48-220` vs `:421-461`); two different "healthy" greens. *(architecture)*
- **`pools[0]` without ordering** — a second USDC pool makes price/LP/trade routing pick a random pool. *(correctness)*
- **No frontend tests at all** — swap encoder, portfolio maths, screener params, API routes. *(test-evidence)*
- **Docs (AGENTS.md, GEMINI.md, README) describe Solana/pnpm/NestJS; repo is Arc/bun/Hono.** *(policy)*

### Low (selected)
Creator links rendered without scheme allowlist; remote token images leak viewer IP; non-constant-time secret compare; client signs any `to`; `slippageBps=NaN` → 503; RugWatcher re-toasts old alerts on watch; PerpWatch drops the first new signal; EURC counted as $1; future-dated migration name; generic error-boundary copy.

## Deterministic Check Results

| Check | Status | Notes |
|---|---|---|
| shared `bun test` | NOT_RUN | (by specialists; run during fixes) |
| backend `bun test` | NOT_RUN | |
| frontend tests | UNAVAILABLE | no test script / files |
| frontend `tsc --noEmit` | NOT_RUN | |
| CI | UNAVAILABLE | none configured |
| secret scan | PASS | no live secrets tracked |

## Review-Integrity Observations
None. No reviewer-manipulation content found.

## Strengths
Non-custodial trade flow (server never signs; recipient is the user; live-quote minOut, clamped slippage, 20-min deadline); RPC range-halving and atomic cursor commits in indexers; correct v4 sign convention and decimal handling; score withheld when core inputs are missing; alerts suppressed on methodology change; parameterised/validated DB inputs; React-escaped agent output; backend tests check behaviour, not implementation.

---

## Fix log (same session, commits a1982eb → 4747882)

| Finding | Status |
|---|---|
| H1 pool USDC = buys − sells | **Fixed**: read from on-chain `StateView` liquidity × price (`usdcInRange`); it matches DexScreener's USDC figure exactly. Tested. |
| H2 LP_REMOVED summed across positions | **Fixed**: judged on the launch position only (`launchLiquidityPulled`). Tested. |
| H3 burns counted as creator dumping | **Fixed**: the creator's own burns are subtracted. Locker and LP-seed transfers are still counted (documented limitation). |
| H4 stale balances after leaving follow-set | **Fixed**: tokens are marked `partial` (scorer stops trusting them, backfill rebuilds). Market sync keeps the last snapshot on DexScreener gaps. |
| H5 WHALE_DUMP on launch seeding | **Fixed**: only transfers in a swap transaction without a liquidity change count. |
| H6 paper perps never marked to market | **Fixed**: `lib/paper-perps.ts` (PnL, TP1–3 scale-out, SL, liquidation, close fee). Tested. |
| H7 fabricated deployer profiles | **Fixed**: `lib/deployer.ts` and all legacy routes removed. |
| H8 trading vs "monitoring only" | **Resolved by owner decision**: non-custodial trading behind `NEXT_PUBLIC_TRADING_ENABLED`, documented in AGENTS.md. |
| DEAD on busy and young tokens (audit DB check) | **Fixed**: DEAD requires no trading in 24h and age over 6h; busy tokens are flagged CHURN instead. Tested. |
| Unlimited approvals | **Fixed**: exact amount, 30-minute Permit2 expiry. |
| Error text leaking RPC/DB details | **Fixed**. |
| XFF rate-limit bypass | **Fixed**: keyed on the last hop. |
| Fake detection split between scorer and UI | **Fixed**: `isWash` and `impersonates` live in shared. IMPERSONATION is a scorer flag. Pre-v5 flags are untrusted until rescored. |
| Perps flag / nav inconsistency | **Fixed**: nav, /more, page and API all honour the flags. |
| Error states that look like "all clear" | **Fixed** on alerts, search, watchlist and wallet. |
| Legacy Solana routes and pages | **Removed**: about 22k lines. Sitemap and robots updated. |
| Backend defaults to Solana jobs; retention prunes Arc scores | **Fixed**. Tested. |
| Two design-token systems | **Fixed**: one `:root` with primitives → `--rv-*` → aliases. See `docs/design-system.md`. |
| `pools[0]` unordered | **Fixed**: ordered by `createdAt`, so the launch pool is canonical. Non-USDC pools are refused for trading. |
| No frontend tests / no CI | **Partly fixed**: 15 frontend tests (encoder, paper perps, params) and a `test` script. CI is still to do. |
| Creator links, images, tx allowlist | **Fixed**: https only, shown as "creator link", `no-referrer` images, `assertSafeTx`. |
| RugWatcher re-toasts; PerpWatch drops the first signal; EURC counted at $1; 100% size button; hit rates | **Fixed**. |
| Docs describe Solana/pnpm/NestJS | **Fixed**: README rewritten; AGENTS/GEMINI have a current-state section. |
| NUL / non-Latin token names stall the indexer (found during fixes) | **Fixed**: `cleanText` sanitizer. The local DB was recreated as UTF-8 (`riven_u8`). |
| Remaining | 12 React-compiler lint rules (impure `Date.now()` in server pages, `setState` in effects); CI workflow; deploy. |

**Deterministic checks after fixes:**

| Check | Status |
|---|---|
| shared tests (30) | PASS |
| backend tests (39) | PASS |
| frontend tests (15) | PASS |
| backend tsc | PASS |
| frontend tsc | PASS |
| frontend eslint | FAIL (12 react-compiler rules; formatting fixed) |

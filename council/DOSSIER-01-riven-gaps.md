# DOSSIER 01: What Riven is missing and where the last 7 days go

**Convened:** 2026-10-08. **Question:** What is missing from Riven, and which gaps should the remaining days before the Arc Microgrants deadline go to?

This is the identical factual record every member works from. **Check it and report where it is
wrong, incomplete or mis-posed.** Later numbered addenda (ADDENDUM-01A, 01B, ...) win where
they conflict with this file. The codebase is at `riven on arc/` (one level up from this folder) and members may read it.

## 0. The question in one line

Of the gaps listed below (and any the council finds), which should be closed before 2026-10-15, which left, and is "submit what exists" acceptable?

## 1. Options on the table

| Option | What it means | Reversible? | Rough cost / time |
|---|---|---|---|
| Do nothing more | Submit the current build as is (local only today) | Yes | 0 |
| Ship-first | Deploy publicly (Vercel frontend + Railway worker + hosted Postgres), record a demo, write the BUIDL page; no new features | Yes | est. 1–3 days |
| Data-depth | Raise score coverage on actively traded tokens, verify scorer accuracy on labelled tokens | Yes | est. 2–4 days |
| Feature-breadth | Keep adding features (perps execution with Arc USDC, more AI, mascot polish, more filters) | Partly | open-ended |
| Members may propose others | | | |

## 2. Market or domain

- Arc is Circle's Layer-1; gas is paid in USDC (fact; Arc docs, public).
- Launchpads indexed by Riven on Arc: Argus and Tolly (fact; `apps/backend/src/arc/config.ts`).
- Competitor types: DexScreener (lists Arc pairs), launchpad UIs, other microgrant submissions (unknown).
- Arc Microgrants on DoraHacks: 20 grants × 500 USDC, deadline 2026-10-15 (fact per project notes; the written rubric was not found in the repo — see §6).

## 3. Goal, constraints and success measures

- **Goal:** win a microgrant; keep real users after.
- **Measure:** grant awarded; a public URL with non-zero real visitors.
- **Constraints:** one builder, 7 days; non-custodial only; no buy/sell advice; flags are evidence, not accusations.
- **Who decides, and by when:** the builder; submission closes 2026-10-15.

## 4. Facts

Database counts from the local database `riven_u8`, queried 2026-10-08 (single snapshot, not a trend).

| # | Fact | Source | Date |
|---|---|---|---|
| F1 | 38,107 tokens indexed on Arc mainnet | DB `tokens` count | 2026-10-08 |
| F2 | 2,074 tokens traded in the last 24h | DB `arc_markets.volume_24h > 0` | 2026-10-08 |
| F3 | 238 of those 2,074 traded tokens have ever been scored (≈11.5%); 294 tokens scored in the last 24h; 330 ever | DB `score_runs` | 2026-10-08 |
| F4 | 872 tokens have an icon/image | DB `tokens.image_uri` | 2026-10-08 |
| F5 | 27 live perp calls, 149 resolved; scanner self-calibration: ~45% win rate, CV AUC ≈0.60 on 148 resolved | DB `perp_signals`; sakz runner logs | 2026-10-08 |
| F6 | 25 alerts stored in total; Arc pulse showed 0 liquidity pulls, 0 creator sales, 18 whale sales in 24h | DB `alerts`; `/api/arc/agent` overview | 2026-10-08 |
| F7 | 0 Telegram links; the configured bot token is also used by another running instance (getUpdates "Conflict" every poll), so Telegram alerts cannot work as configured | DB `telegram_links`; worker logs | 2026-10-08 |
| F8 | No public deployment exists; app runs on localhost only. `docs/DEPLOY-FRONTEND.md` exists | repo; builder | 2026-10-08 |
| F9 | No AI key set in `apps/frontend/.env.local`: "Ask Riven" answers come from the rule-based engine (`mode: rules`). The engine was broadened today: natural-language screener filters, comparisons, glossary, market and perps overviews, follow-ups | `.env.local`; `lib/riven-agent.ts`, `lib/agent-intent.ts` | 2026-10-08 |
| F10 | Perps: Hyperliquid market data + sakz-bot calls; page labelled "Trade perps with Arc USDC"; AGENTS.md (2026-10-06 owner decision) says perps is a **paper-trading** terminal and nothing is sent to an exchange | `apps/frontend/components/perps/*`, AGENTS.md | 2026-10-08 |
| F11 | Non-custodial buy/sell via Uniswap v4 router is enabled by default; per the 2026-10-06 council the encoder was verified against a real tx but never sent with real money | AGENTS.md; `docs/audit/council-transcript-20261006-230656.md` | 2026-10-06 |
| F12 | 3D robot mascot (three.js) on every page, voice chat (Web Speech + meSpeak robot voice), SFX | `apps/frontend/components/mascot/*` | 2026-10-08 |
| F13 | Warm local response times: ticker 0.05s, home ~0.66s, markets ~0.5s, trending ~1.3s (dev server, local DB) | builder measurements | 2026-10-08 |
| F14 | Screener has DexScreener-style Profile / Community / Boosted filters; the backing fields were added today and no rows have them populated yet (market sync pending) | DB query: 0 of 8,150 `arc_markets` rows | 2026-10-08 |
| F15 | Prior council (2026-10-06) priority: deploy publicly and record a 90s demo; still not done | `docs/audit/council-transcript-20261006-230656.md` | 2026-10-06 |
| F16 | ~14 frontend agent-intent tests + scorer/backend unit tests; no CI | repo | 2026-10-08 |

## 5. Estimates and assumptions

| # | Estimate or assumption | Basis | What would falsify it |
|---|---|---|---|
| E1 | Deployment takes 1–3 days including a hosted Postgres and a long-running worker | prior Railway/Vercel experience in AGENTS.md (many incidents) | a deploy done in hours |
| E2 | Judges spend minutes per submission and click the live link first | assumption about microgrant reviewing | the published rubric |
| E3 | The three.js mascot adds noticeable weight on low-end phones | assumption; not measured | a Lighthouse mobile run |
| E4 | Score coverage on traded tokens is limited by holder backfill throughput over public RPCs | worker behaviour; not benchmarked | coverage rising quickly after a fix |

## 6. What is not known

- The exact judging rubric for Arc Microgrants (searched: repo docs, project notes; not found — does not mean none exists).
- Whether any real user has used Riven (no analytics installed).
- Scorer accuracy against labelled outcomes (no confusion matrix exists in `docs/`).
- Mobile performance numbers (no Lighthouse run recorded).
- Hosting cost of running the indexer continuously against public RPCs.

## 7. Positions already held

- The builder's position (to test): Riven still feels like "something is missing"; they keep adding features (latest: perps-with-Arc-USDC framing, voice robot, filters, faster pages).
- Prior council position (to test): deploy and demo before anything else.

## 8. What the council is asked

1. What is missing from Riven, ranked by how much it affects winning a grant and keeping users?
2. What should be cut, hidden or relabelled before judging?
3. What can Riven show that is only possible on Arc, and is it visible in the first minute?
4. Is "Trade perps with Arc USDC" an accurate label given F10, and what is the risk?
5. What is the cheapest step that would settle the biggest open question, and what result would change the plan?

# ROUND 1: Solo-builder capacity reviewer (argues do less / ship now) (do-less)

**Dossier:** DOSSIER-01-riven-gaps.md. **Addenda read:** none (no ADDENDUM-01*.md existed when this was written; checked with `ls ADDENDUM-01*`).
**Round 1, independent:** no other member's report was read before this one was written.

**Position:** Ship-first, and nothing else until a public URL is live and has survived 24 hours: feature freeze today, hide perps and in-app buy/sell behind their existing env flags on the public build, then demo video and BUIDL page. Data-depth only with time left over after that.
**Confidence:** high (that deploy comes first); medium (that it fits in the 1–3 day estimate, because the dossier leaves out several deploy steps; see §2)

## 1. Position and why

1. **There is no public URL. That is the only gap that can make every other gap irrelevant.** Fact F8: localhost only. The grant-judge card lists "No live link" as a red line, and the stated success measure is "a public URL with non-zero real visitors". No feature closes a gap a judge cannot open. The prior council (F15, 2026-10-06) reached the same priority two days ago and it still has not been done. Meanwhile the builder has shipped perps framing, voice, filters and speed work (dossier §7). That is the scope-creep pattern this seat exists to stop.
2. **Deployment is not "trivial". It is under-scoped, so the 7 days are tighter than they look.** The dossier treats deploy as one 1–3 day line. When I checked the codebase I found at least four pieces of work the dossier does not list (§2): no hosted git remote, a stale deploy guide, a Railway config pattern the repo's own incident log calls fragile, and a hosted database that will start empty. Each one can eat a day. That is the reason to start today and not "after one more feature".
3. **Freeze features, and cut things by flipping flags, not writing code.** Perps and the Uniswap buy/sell are both on by default but can be switched off with an env var (`NEXT_PUBLIC_PERPS_ENABLED="false"`, `NEXT_PUBLIC_TRADING_ENABLED="false"`, fact: `apps/frontend/lib/flags.ts`). That is a zero-code cut. Perps also has no data source in production anyway (§2). The F11 buy/sell path has never been sent with real money. Shipping either one live on judging day is a demo risk and a trust-safety risk, and it buys nothing that the Arc-native indexer does not already show.
4. **A recorded demo is insurance against a live-link failure on judging day.** If Railway falls over, public RPCs rate-limit the worker, or the free Postgres fills up, a 90-second video still shows the product. It costs half a day. No new feature has as good a cost-to-benefit ratio.
5. **Data-depth is the only "more work" option I would accept, and only after the deploy is stable.** An 11.5% score rate on traded tokens (F3) is a real weakness a judge can see. But on a deployed instance with an empty database, coverage starts at 0%, so whether coverage can be raised depends on the deploy anyway. Do the deploy first and measure coverage there.
6. **What this seat gives up:** possible differentiation and the "something is missing" feeling. I accept that. A plain, stable app that is live beats a richer app that is down, half-deployed or only on localhost. Feature-breadth (perps execution with Arc USDC) I reject outright for this window: it is open-ended, partly irreversible, and moves the product toward a red line (custody/advice).

## 2. Where the dossier is wrong, incomplete or mis-posed

- **F8 understates the deploy problem: `docs/DEPLOY-FRONTEND.md` is stale and would mislead the builder.** It describes a **pnpm** monorepo on **Vercel** with `SOLANA_RPC_URL`/Helius env vars and pnpm build commands. The repo is now **bun** (`package.json` scripts all use `bun run`, `bun.lock` present, no `pnpm-lock.yaml`; checked with `ls`). Fact, from reading both files. Following that guide literally will fail.
- **There are two Railway configs, not "Vercel + Railway".** `apps/backend/railway.toml` and `apps/frontend/railway.toml` both exist. Both use `builder = "RAILPACK"` and both live in subdirectories. The repo's own `AGENTS.md` Deployment section records (a) Railpack being incompatible with `workspace:*` dependencies under pnpm, and (b) Railway blocking new opt-ins to a per-service config-file path for services that didn't use it before 2026-08-28, which is why that config was moved to the repo root. Whether either still applies under bun is **unknown, not tested**. It is a known incident area, and the dossier's E1 does not mention it. Assumption: at least one failed build cycle.
- **No hosted git remote exists.** `git remote -v` shows only `origin ../riven-backup.git`, a local bare repo. There are 25 uncommitted changes (`git status --short | wc -l`). Vercel/Railway git deploys need a GitHub (or similar) push first, or a CLI upload (`railway up`). Fact. It is a small step, but a missing one.
- **The hosted database starts empty. This is the biggest omission.** F1–F5 describe the **local** DB `riven_u8`. A fresh hosted Postgres starts with 0 tokens, 0 scores and 0 perp signals, and the indexer has to backfill Arc from `ARC_INDEX_START_BLOCK` over public RPCs (E4 already flags this as the throughput limit). The options are a `pg_dump`/restore of the local DB, which needs a size check against free-tier storage limits (the local repo folder alone is 3.6 GB with node_modules; DB size not measured, since no `psql` is on PATH), or waiting for re-indexing. Either way, the numbers in the dossier are **not** what a judge will see on day one unless the data is migrated. Estimate: 0.5–1 day on its own.
- **Perps has no production data source.** The sakz scanner is started by `apps/backend/src/arc/sakz-runner.ts` only when `SAKZ_DIR` points at a sakz-bot checkout with Python deps. sakz-bot lives outside this repo (the user's desktop), and the backend build is bun-only (no Python in the Railpack plan as configured; assumption). So on deploy, F5's "27 live perp calls" goes stale or empty. Fact (the code path); assumption (that Railpack won't provide Python). That makes "hide perps on the public build" free and sensible, not a loss.
- **F7 (Telegram) is mis-posed as a feature gap. It is a config conflict.** Two instances polling one bot token is exactly what a deploy would cause if the local worker keeps running. The deploy checklist must say: use a separate bot token for production, or stop the local poller. Otherwise production alerts break on day one. Inference from F7.
- **Missing option: "Ship-first with flags off".** The options table has Ship-first as "no new features", but it says nothing about **removing** risky live surfaces. Hiding perps and buy/sell by env flag is a fifth option, cheaper than any other and reversible.
- **E1's basis is mis-cited.** It points to "many incidents" in AGENTS.md as the reason for 1–3 days, but those incidents were for a pnpm/Nixpacks/NestJS setup that has since been replaced by bun/Railpack/Hono (fact: `apps/backend/package.json` uses hono + bun). The estimate may be too high (bun is simpler) or too low (new, untested toolchain on Railway). The honest label is "untested".
- **F13 response times are from the dev server on a local DB.** Production latency against a remote Postgres and public Arc RPCs is unmeasured. That is not wrong, but it should not be read as evidence of production speed.

## 3. Evidence

| Claim | Type | Source or method |
|---|---|---|
| No public deployment; localhost only | fact | Dossier F8 |
| `DEPLOY-FRONTEND.md` describes pnpm + Vercel + Solana/Helius env | fact | Read `docs/DEPLOY-FRONTEND.md` (83 lines) |
| Repo uses bun; no pnpm lockfile | fact | Root `package.json` scripts, `bun.lock` present, `ls pnpm-lock.yaml` → not found |
| Both apps have Railpack `railway.toml` in subfolders; backend has `/health` healthcheck and runs migrations in `preDeployCommand` | fact | `apps/backend/railway.toml`, `apps/frontend/railway.toml`, `apps/backend/src/app.ts:27` |
| Repo's AGENTS.md records Railpack/workspace and subfolder-config incidents | fact | `AGENTS.md` Deployment section (lines ~361–401) |
| Those incidents apply under bun | assumption | Not tested; would be settled by one deploy attempt |
| Only git remote is a local bare repo; 25 uncommitted changes | fact | `git remote -v`, `git status --short` |
| Hosted DB starts empty; dossier counts are local | fact (local) / inference (hosted) | Dossier header "local database `riven_u8`" |
| Dump/restore or re-index costs 0.5–1 day | estimate | Experience-based: dump + restore + size check, or a backfill limited by public RPC (E4) |
| Perps scanner only runs with `SAKZ_DIR` + Python, outside the repo | fact | `apps/backend/src/arc/sakz-runner.ts` lines 13–24 |
| Perps and buy/sell can be turned off with env flags, no code | fact | `apps/frontend/lib/flags.ts` lines 6–17 |
| Telegram will conflict again if local and prod poll one token | inference | Dossier F7 |
| Full deploy, data seeding and smoke test fit in 2–3 days | estimate | Sum of the above: remote and push 0.25d, two services 0.5–1d, DB seeding 0.5–1d, env and smoke test 0.5d |
| A demo video costs ≤0.5 day | estimate | Screen recording of the existing flows, one take plus edits |
| Judges click the live link first | assumption | Dossier E2; grant-judge card priorities |

I searched the council folder for ADDENDUM-01* and found none. I searched the repo root for `pnpm-lock.yaml` and found none, so it does not exist at the root. I did **not** measure DB size (no `psql` on PATH), mobile performance, or a real Railway build. Those remain unknown.

## 4. Risks from this seat

- **Do nothing more:** the quietest failure. The builder "submits", but the link is localhost or there is no link at all, and it is filtered out in the first minute. Total loss, and it looks like a choice rather than an accident.
- **Ship-first:** the loud failures are a broken Railway build or OOM. Those are fixable if started early. The **quiet** failures are a deployed app with an empty database (every token "pending", which hits the arc-trader red line), perps showing stale calls, and Telegram silently dead because of the token conflict. All of these come from not migrating state, not from code.
- **Data-depth before deploy:** coverage improves on localhost, a place no judge sees. Then it is re-done on the hosted DB. Wasted days.
- **Feature-breadth:** scope expands into day 6, the deploy is rushed on day 7, and something breaks on judging day with no time to fix it. Perps execution with real USDC also brings the custody and advice red lines into the demo. This is the most likely way this project misses, given F15 shows the pattern has already happened once.
- **A risk on every path:** the builder's "something is missing" feeling is not evidence. Without analytics (§6 of the dossier), there is no user signal to say *what* is missing. Only a deployed app can produce one.

## 5. The cheapest decisive step

**Today: push to a hosted remote and attempt one Railway deploy of the backend against a fresh hosted Postgres, timeboxed to 4 hours. Hit `/health` and `/arc/health`.**

- **Result that would change my position (decided now):** if the backend is green on `/health`, the frontend is serving, and the DB is seeded (dump/restore works within free-tier storage) **by end of day 2 (2026-10-10)**, then deployment has been shown to be "done or trivial". In that case I support spending days 3–5 on **data-depth** (raise score coverage on actively traded tokens on the *hosted* instance, and run one labelled-token accuracy check). Feature-breadth stays out.
- **Result that would strengthen it:** if the first attempt fails on Railpack/workspace or config discovery, everything else stops until it works. The fallback is to put both services on one Railway service, or run the frontend on Vercel with a bun build command, and accept a reduced live surface (no perps, no Telegram) rather than delay.

## 6. Conditions and red lines

- **Red line:** no new feature work starts before a public URL returns a working token page with real (seeded) data. This includes "small" ones: mascot polish, more filters, perps execution, more AI intents.
- **Conditions for supporting Ship-first:** perps and in-app buy/sell set to off via env flags on the public build (or perps clearly relabelled as paper trading, which is a trust-safety call, and I defer to that seat on wording); a separate Telegram bot token for production or the local poller stopped; the stale deploy doc fixed or ignored, not followed; migrations run from the backend only.
- **Conditions for supporting Data-depth:** deploy stable for 24h first; work done against the hosted DB; a stop date of 2026-10-13 so days 6–7 are reserved for the demo video, the BUIDL page and buffer.
- **Will not accept:** Feature-breadth in this window; "submit what exists" as localhost-only; any change on 2026-10-14/15 other than a fix for something broken.

## 7. One line

Freeze features today, flag off perps and buy/sell, get a seeded public URL live by 2026-10-10, record the demo, and only then spend leftover days on score coverage. The 7 days are tighter than they look, because deploying means a remote, two services, a database migration and a Telegram fix, not just "click deploy".

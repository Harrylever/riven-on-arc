# ROUND 1: Arc Microgrants reviewer (ecosystem grants judge) (grant-judge)

**Dossier:** DOSSIER-01-riven-gaps.md. **Addenda read:** none (no ADDENDUM-01*.md existed when this was written).
**Round 1, independent:** no other member's report was read before this one was written.

**Position:** Ship-first, then a narrow slice of data-depth: get a public URL live by day 3, make sure the tokens a reviewer lands on actually show a score, rename the perps header, record a 90s demo; no new features.
**Confidence:** high on "no live link = no grant"; medium on the data-depth slice (it depends on how the home page orders tokens, which I have not checked).

## 1. Position and why

1. **No live link means I don't fund it.** My red line is "no live link, no evidence it runs on Arc mainnet". Today Riven has neither (F8, confirmed: there is no hosting config for the current frontend stack, see §2). A localhost build with 38k indexed tokens counts for the same as an empty repo to me, because I have a few minutes and I click the link first (E2, an assumption, but it is also how my persona card says I work). Everything else is secondary until the link exists.
2. **The Arc-native story is real, but it is buried.** The one thing I would remember after two minutes is in the README, not the first screen. The README (fact, `README.md`) says Riven reads the USDC actually sitting in each Uniswap v4 pool on-chain (`StateView` liquidity × price), and that a typical flagged pool shows about $2.5k of "liquidity" on DexScreener but holds under $2 of USDC. That answers "why does this need Arc, and why isn't it a filtered DexScreener tab?" It only works because Arc pools are USDC-quoted and Riven indexes Arc itself. If a reviewer doesn't see that contrast in the first minute, it doesn't count.
3. **The tokens a reviewer is most likely to click are unscored.** I ran this check myself (§3). **0 of the top 100 Arc tokens by 24h volume have ever been scored**, and only 15 of the top 500 have. The same is true of the top 50 by liquidity: 0 scored. A "rug-checked" terminal whose most active tokens all read "pending" looks like a demo that doesn't work. This is the narrow data-depth work I would fund ahead of any new feature: score the top 100 or so, or at minimum make sure the landing list puts scored tokens first.
4. **"Trade perps with Arc USDC" is the most dangerous line in the product for me.** In the code, perps is paper trading (fact, `perps-client.tsx`: "Orders run on a paper account … your USDC never leaves your wallet"), but the H1 says "Trade perps with Arc USDC". Next to it is a primary-looking button, "Trade live on Hyperliquid ↗", which sends users to an off-Arc leveraged exchange. To someone skimming in two minutes, that reads as an unlicensed leveraged-trading product on someone else's chain, which hits my "unlicensed financial product" red line. Perps adds nothing to the Arc case. Relabel it ("Practise perps (paper)") or hide it behind its flag for judging.
5. **Breadth doesn't move my score; the mascot and voice may cost points.** Features come fourth on my priority list (live link > demo video > Arc-specific value > breadth > polish). The 3D robot and voice may impress me if they load fast. If they make a phone load slowly, they cost more than they add (E3 has not been measured). The Profile/Community/Boosted filters are empty (F14). Empty filters on a live site look unfinished, so hide them.
6. **Keeping it running matters to me.** I am judged on grantees that don't vanish. A site that is live on judging day but goes stale a week later (the indexer dies, RPC limits run out) is the failure I get blamed for. The submission should state who runs the worker and what it costs, even if the answer is "free tier, I'll watch it".

## 2. Where the dossier is wrong, incomplete or mis-posed

- **F8 overstates how ready deployment is.** "`docs/DEPLOY-FRONTEND.md` exists" suggests there is a usable guide. Checked: it is the stale Solana-era guide. It tells you to use pnpm/Turborepo build commands, `SOLANA_RPC_URL`/Helius, and NestJS, and says to run migrations from "the persistent NestJS backend". The repo now uses bun, Hono and Arc RPCs (AGENTS.md's top section). Following it would fail. `apps/backend/railway.toml` exists and uses bun/Railpack, but it is untested against Railway: a comment says the service root is the repo root, while the file sits in `apps/backend/`. The legacy guide records that Railway's per-service config-file override is deprecated and that Railpack broke `workspace:*` deps before. Neither problem is mentioned in the dossier. This supports E1 (1–3 days) or worse, not better.
- **F3 is a misleading framing for my seat.** "238 of 2,074 traded tokens scored (≈11.5%)" averages over the long tail. I re-queried and got 241 (the snapshot moved). What decides a judge's impression is coverage of the **most-traded** tokens, and that is 0/100. The dossier should report coverage weighted by volume or by rank, not only by count.
- **A missing option: "hide and relabel".** It is a near-zero-cost option separate from ship-first: switch off or relabel perps, hide the empty filters, hide the Telegram alert UI (F7 says it cannot work as configured), and set the landing order to scored tokens first. These are mostly flag and copy changes (`lib/flags.ts` already has `PERPS_ENABLED` and `TRADING_ENABLED`).
- **§8 Q3 is the right question but is missing a fact.** The dossier never says what the Arc-native capability is. I found it in the README (on-chain USDC-in-pool versus DexScreener liquidity, plus creator history across every Arc launch). It should be fact-listed so every seat argues about the same thing.
- **Eligibility is missing from "What is not known".** The prior council (fact, `docs/audit/council-transcript-20261006-230656.md` line 169) flagged a prior-work or double-submission risk: this is a ClawDex port that was also entered in AnsemHack. Two days later, the dossier doesn't say whether that was checked. For a judge, being ineligible outranks every gap listed.
- **Non-custodial buy/sell (F11) on by default, with no real-money test, isn't framed as a judging risk.** If a reviewer clicks "buy" and it fails or behaves oddly on mainnet, that is the worst two minutes Riven could have. Either run one small real transaction or set `TRADING_ENABLED=false` for the judged build.

## 3. Evidence

| Claim | Type | Source or method |
|---|---|---|
| 38,107 tokens; 2,074 with volume_24h > 0 | fact | Read-only query of local `riven_u8` via repo's `pg` (2026-10-08), matches F1/F2 |
| 241 traded tokens have ever been scored (dossier: 238) | fact | Same query: `arc_markets` volume_24h>0 joined to `score_runs`; moved since the dossier snapshot |
| Top 100 traded tokens by 24h volume: 0 scored; top 500: 15; top 50 by liquidity_usd: 0 | fact (local snapshot) | Same method, ordered by `volume_24h desc` / `liquidity_usd desc` |
| Reviewers land on high-volume tokens | assumption | Persona behaviour. Not checked: how `/` and `/trending` order tokens |
| Perps H1 "Trade perps with Arc USDC" plus a "Trade live on Hyperliquid ↗" button; the body text says paper | fact | `apps/frontend/components/perps/perps-client.tsx` lines ~76–98 |
| Perps and trading are on by default, and each has a kill flag | fact | `apps/frontend/lib/flags.ts` |
| DEPLOY-FRONTEND.md is stale (pnpm, Solana RPC, NestJS) | fact | `docs/DEPLOY-FRONTEND.md` §1–2 |
| The backend Railway config is untested on the current stack | estimate | `apps/backend/railway.toml` (Railpack, in a subfolder) checked against the legacy-guide incident history in AGENTS.md; I found no deploy log in the repo |
| The Arc-native differentiator is USDC-in-pool measured on-chain versus DexScreener liquidity | fact (claim made by the project) | `README.md` "What the data says". I did not re-verify the $2.5k / <$2 figures |
| The eligibility (prior-work or double-submission) question was raised and is unresolved | fact that it was raised; unresolved is an assumption | `docs/audit/council-transcript-20261006-230656.md` line 169; I searched repo docs for a resolution and found none (which doesn't mean none exists) |
| The written rubric is not in the repo | fact (search) | grep for "Microgrant", "rubric" and "DoraHacks" across `docs/` and README returns only prior-council text. Not checked: the DoraHacks page itself |

## 4. Risks from this seat

- **Do nothing more:** an automatic no from me. There's no link to click. This failure is obvious, not quiet.
- **Ship-first only:** the link works, but the trending and top tokens show "pending" scores, and the perps H1 reads as a leveraged-trading product. That one is quiet: the builder thinks it's fine because the site loads, and I quietly mark it "demo, unfinished, off-thesis".
- **Data-depth only (no deploy):** the best scorer nobody can see. Same outcome as doing nothing.
- **Feature-breadth:** each new surface is something else that can break live, and it pushes the deploy toward the deadline. Deploying on day 7 also means no time to fix what breaks (E1). It risks failing loudly on judging day.
- **Across all options:** the indexer stops after submission and the site goes stale. That hits the "likely to keep going" mandate, and I won't see it until after I've funded the project.

## 5. The cheapest decisive step

**Read the DoraHacks Arc Microgrants page (rules, required fields, eligibility) today, about 15 minutes.** That settles the biggest open question (E2, the rubric, plus prior-work eligibility) more cheaply than any argument here.
- If it says ported or prior-work projects are ineligible, or that one project can't be in two hackathons: everything else is moot. The plan becomes "make the Arc-specific work clearly new, or don't submit".
- If it requires a deployed Arc contract or on-chain USDC usage: my position moves toward adding the smallest real Arc on-chain touch (for example, one real non-custodial USDC swap shown in the demo). I would then rank that above score coverage.
- If it only asks for a link, video and repo: my position stands as written.

The second-cheapest step: deploy, open the live URL on a phone, and count how many of the first 10 tokens on the landing list show a score. **If 8 or more of 10 show a score, I drop the data-depth slice entirely.**

## 6. Conditions and red lines

- **To support:** a public URL that works on a phone and shows live Arc mainnet data (explorer links to `explorer.arc.io` on a token page count as proof), plus a 90s demo video as a fallback if the site is down while I'm reviewing. The first screen or the video must show the on-chain-USDC versus "reported liquidity" contrast.
- **Will not accept:** no live link; perps labelled as trading with Arc USDC when it is paper; a "Trade live" call to action pointing to an off-Arc leveraged exchange on the judged build; flag wording that names projects as scams.
- **Strong preference:** non-custodial buy turned off for judging unless it has been run once with real money; empty filters and the broken Telegram alerts hidden.

## 7. One line

Get Riven live and clickable within three days, make sure the first tokens a judge sees actually have scores, put the "real USDC in the pool versus reported liquidity" contrast on the first screen, relabel perps as paper, and stop adding features.

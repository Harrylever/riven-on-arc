# ROUND 1: Competing Arc hackathon team (competitor archetype) (rival-builder)

**Dossier:** DOSSIER-01-riven-gaps.md. **Addenda read:** none (no ADDENDUM-01*.md file exists in the folder as of this writing; checked by directory listing).
**Round 1, independent:** no other member's report was read before this one was written.

**Position:** Ship-first plus one narrow data-depth fix: deploy, then make Riven's Arc-native verdict appear on the top ~50 actively traded Arc memecoins and on the first screen. Today those tokens have no score, the market numbers come from DexScreener's API, and every token that does have a score is red, so from where I sit Riven looks like a DexScreener tab with a mascot. Relabel perps as paper or hide it. No new features.
**Confidence:** medium-high (high on the data findings, which I queried myself; medium on how judges weigh them, because the rubric is unknown).

## 1. Position and why

1. **Riven's differentiation is real, but a judge cannot see it.** The backend does things a DexScreener tab filtered to Arc cannot do. It inspects token contracts for mint, pause, blacklist and proxy-upgrade hooks. It reads the bytecode of the Argus LP locker to decide that liquidity is locked. It counts how many tokens a creator has launched (one live signal reads "the creator has launched 133 tokens"). It detects creator-funded wallets and creator dumps from its own index of 140,635 Arc swaps and 1,217 LP events. That is my answer to my own card's question. But on the tokens a judge or trader would click first, none of it shows (see point 2). As a rival, I win if the judge's two minutes land on an unscored token page.
2. **No token a trader cares about has a score.** Ranked by 24h volume, 0 of the top 100 traded tokens have ever been scored, and 1 of the top 250 has. Scored tokens carry about 1.2% of 24h traded volume. The memecoins in the top 10 (COOL, ARCOON, ARCMAN, each $0.75M to $3.6M of 24h volume) are all unscored. The largest scored token did about $72.8k. The median scored token did $8.99 of volume, about the same as the median of all traded tokens ($10.87). The scorer is covering the dead long tail, not the market. The dossier's "11.5%" makes this look far better than it is.
3. **Every scored token is red.** All 334 latest scores fall in the "risk" band, between 1.9 and 4.9 out of 10. Across all 1,591 score runs ever recorded, 2 reached "caution" and none reached "healthy". If a score is always red, it says nothing a viewer could not have guessed. A rival demo would say "Riven calls everything risky", and the only way to answer that is to show the score separating tokens on live, liquid tokens. Separately, the dead-token caps ("almost everyone has sold and trading has stopped") are probably correct, which argues for the scorer's honesty, not against it.
4. **Most of the "terminal" is DexScreener's data.** `market-sync.service.ts` pulls price, market cap, liquidity, volume, price change, buy and sell counts, socials, images and paid boosts from `api.dexscreener.com/tokens/v1/arc/`. `lib/arc-data.ts` calls the screener "filtered and sorted like DexScreener". The Profile, Community and Boosted filters (F14) copy DexScreener's own paid listing products. That is the exact "cloned DexScreener" story my seat wants a judge to believe. Riven should lead with what it computes itself and stop advertising parity.
5. **Perps is the easiest thing for a rival to attack.** The perps page runs on Hyperliquid markets and paper-trades. The Arc part is reading a wallet's USDC balance. The headline "Trade perps with Arc USDC" (`components/perps/perps-client.tsx:80`) and the glossary line "lets you use Arc USDC as margin" (`lib/agent-intent.ts:190`, which never says "paper") claim more than the code does. With a 45% win rate and a cross-validated AUC of about 0.60 (F5), the scanner calls are not a strength to put in front of a judge. It is not Arc-native, and it opens a "non-Arc perps app" or "unlicensed trading product" line of attack. Hide it or label it "Paper perps (practice, Hyperliquid data)" everywhere.
6. **What I gain or lose:** if Riven deploys and shows a creator-history or locker verdict on ARCOON or COOL in the first minute, I lose my best line of attack, because no generic tool shows that. If it ships the mascot, voice, filters and perps first, I keep it.

## 2. Where the dossier is wrong, incomplete or mis-posed

- **F3 compares coverage against the wrong baseline.** The 11.5% figure (238 of 2,074) mixes majors (cirBTC, WETH, EURC, USDC), tokens from other DEXes and dust tokens. Split by segment, coverage is 43% for Argus launchpad tokens (87 of 202 traded tokens scored), 8% for tokens from other DEXes (153 of 1,871), 0% of the top 100 by volume, and about 1.2% of traded volume. The arc-trader's question ("share of actively traded tokens with a score") deserves the volume-weighted answer, which is close to zero. (My recount gave 241 rather than 238, likely because the database moved between snapshots. It does not change the picture.)
- **The dossier leaves out the score distribution.** All 334 latest scores are in the "risk" band, and 2 of 1,591 runs ever reached "caution". This matters more than coverage, because even with full coverage the score would not yet tell tokens apart.
- **The dossier leaves out that market data comes from DexScreener.** Section 2 lists DexScreener only as a competitor. In fact the market snapshot every page reads (`arc_markets`) is filled from DexScreener's API, with GeckoTerminal as a fallback for icons. This bears on question 8.3 ("only possible on Arc") and on the risk that DexScreener's API rate-limits or changes after the build is deployed. The repo's AGENTS.md locks "Independent of DexScreener" for the Solana spec. I did not find an Arc-specific decision that relaxes it. That may only mean it lives somewhere I did not search.
- **Data freshness is not stated.** Among traded tokens, `arc_markets.updated_at` spans about 3.5 hours (oldest 19:53, newest 23:21 in database time). So some prices a trader sees are hours old. I did not test whether the UI marks them as stale.
- **The option list is incomplete.** It has no "relabel and cut" option (hide perps, the boost filters and the mascot on mobile) and no "aim the scorer at the top-N traded memecoins" option. The second is a targeted form of Data-depth, much cheaper than "raise coverage" across everything. E4 blames RPC throughput, but the scorer may simply be pointed at the wrong tokens. That is unverified.
- **Question 8.3 should be answered in the dossier, not asked.** There is an answer: the contract inspector, the Argus locker bytecode check, creator launch history and funded wallets, and creator dumps from the swap index. What is missing is any evidence that these show up in the first minute.

## 3. Evidence

| Claim | Type | Source or method |
|---|---|---|
| 0 of the top 100 traded tokens by 24h volume have ever been scored; 1 of the top 250 | fact | Read-only SQL on `riven_u8` (via Bun's SQL client), `arc_markets` joined to `score_runs`, run 2026-10-07 at about 23:28 database time |
| Scored tokens carry about 1.2% of 24h volume (0.0121) | fact | same query method, sum of `volume_24h` |
| Median 24h volume: $8.99 for scored tokens vs $10.87 for all traded tokens; the largest scored token did about $72.8k | fact | same query method, `percentile_disc` |
| Coverage by launchpad among traded tokens: Argus 87 of 202, other DEXes 153 of 1,871, Tolly 1 of 1 | fact | same query method, grouped by `tokens.launchpad` |
| Top 10 by volume: cirBTC (x2), WETH (x2), EURC (x2), USDC, COOL, ARCOON, ARCMAN; all launchpad=OTHER | fact | same query method |
| All 334 latest scores are in the "risk" band (1.9 to 4.9 out of 10); 2 of 1,591 runs ever reached "caution" | fact | same query method; bands from `packages/shared/src/score/arc.ts:181` (7+ healthy, 5 to 6.9 caution) |
| Price, market cap, liquidity, volume, socials and boosts come from the DexScreener API | fact | `apps/backend/src/arc/market-sync.service.ts` lines 9 to 37; `apps/frontend/lib/arc-data.ts` lines 19, 80, 375 |
| Riven has its own Arc index: 140,635 swaps, 1,217 LP events, balances for 458 tokens, holder snapshots for 338 tokens | fact | row counts from the same queries |
| Arc-native checks exist: contract hooks, EIP-1967 proxy slot, Argus locker bytecode, serial-launcher and creator-dump caps | fact | `contract-inspector.service.ts`, `config.ts` (ARGUS_LOCKER_IMPL), `score/arc.ts` caps around lines 224 to 374 |
| The perps headline and glossary claim more than paper trading | fact | `perps-client.tsx:80`, `lib/agent-intent.ts:190`; `app/page.tsx:230` does say "(paper)" |
| Majors (cirBTC, WETH, EURC, USDC) should be left out of a "top-N to score" target, or given a separate "established asset" treatment | assumption | my judgement; scoring them with memecoin caps would produce odd verdicts |
| Pointing the scorer at the top 50 non-major traded tokens is a 0.5 to 1 day job | estimate | the `rescore_requested_at` column already exists on `tokens`, so a priority queue appears to be supported; based on reading the schema, not the worker code |
| Judges open the live link and look at the first token they recognise | assumption | same as dossier E2; not checked against a rubric |
| I searched the repo docs for an Arc-specific decision allowing DexScreener as the primary market source and found none | fact (search scope stated) | grep "dexscreener" in AGENTS.md and docs/DECISIONS.md. Not finding it is not proof that no decision exists. |

## 4. Risks from this seat

- **Do nothing more:** no live link, so a rival with a deployed Arc explorer beats Riven by default. This failure is obvious.
- **Ship-first only:** the judge clicks ARCOON or COOL and sees "unscored", or clicks a long-tail token and sees red. The product reads as a DexScreener reskin with a robot. This failure is quiet: the deploy "works", and the grant is still lost.
- **Data-depth done broadly:** days spent on backfill throughput across 2,000 tokens, with no deploy at the end. Obvious, but late.
- **Feature-breadth:** more DexScreener parity (boosts, profiles) and more perps strengthen my "clone" and "non-Arc" attacks. Leaving the perps label unchanged invites a "misleading trading product" flag, which is quiet until a reviewer reads it literally.
- **Quiet scoring risk:** once live tokens are scored, some legitimate projects may land in the red band and be shown publicly. That is a defamation and trust exposure, and it falls under the trust-safety seat's red line on wording. Scoring the top tokens will make the score visible, including where it is wrong.

## 5. The cheapest decisive step

**Step (about 2 to 4 hours):** force-score the top 30 non-major traded tokens by 24h volume (excluding cirBTC, WETH, EURC, USDC and other bridged or stable assets) through the existing scorer, then tabulate the band distribution and look at each verdict by hand.

**Decided now, the result that changes my position:**
- **At least 3 of 30 land in "caution" or "healthy", and the red ones cite a concrete Arc-native reason** (locker unverified, serial creator, creator dump, mint hook): Riven has a visible differentiator. My position becomes "deploy and lead the demo with these 30 tokens", and data-depth goes no further.
- **All 30 are red, or most fail to score (missing holder data):** the score is not yet a product. I would switch to telling the builder to demote the score in the first minute. Lead with raw Arc-native facts instead ("creator has launched 133 tokens", "LP locked in Argus locker: yes or no", "contract can mint: no"), with the score shown as secondary. Fixing the score's calibration is a post-grant job and should not be attempted in 7 days.

## 6. Conditions and red lines

- **I support Ship-first only if** the deployed home page or first token page shows at least one Arc-native verdict on a recognisable, liquid Arc memecoin within the first minute.
- **I would back the builder over rival teams if** the demo answers "why does this need Arc?" with indexed Arc facts (the Argus locker, creator history from Arc factory logs, contract hooks) rather than DexScreener numbers.
- **I will not accept** (as the argument a rival would use): "Trade perps with Arc USDC" left as is, more DexScreener-parity features presented as progress, or any new feature started before a public URL exists.
- My seat has no formal red lines. The points above are the openings a competitor would exploit.

## 7. One line

Deploy, then point the scorer at the Arc memecoins people actually trade and put its Arc-only facts on the first screen; today the top 100 traded tokens are unscored, every scored token is red, and the market numbers are DexScreener's, which is exactly how a rival would describe Riven.

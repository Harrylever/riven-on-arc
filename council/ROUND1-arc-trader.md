# ROUND 1: Active Arc memecoin trader (target user) (arc-trader)

**Dossier:** DOSSIER-01-riven-gaps.md. **Addenda read:** none (no ADDENDUM-01*.md existed in the folder when this was written).
**Round 1, independent:** no other member's report was read before this one was written.

**Position:** Data-depth first, but re-posed as "fix the stalled swap indexer and score the tokens people actually trade", then Ship-first; freeze Feature-breadth. Right now the score is wrong on the tokens I trade, and it says so with confidence.
**Confidence:** high on the diagnosis (checked directly in the DB, code and the live agent). Medium on the fix taking about a day.

## 1. Position and why

1. **The score is wrong on the tokens I trade, and nothing on screen says so.** Fact (checked, §3): the swap indexer's last stored swap is 2026-10-06 11:34 UTC, 35.9 h before my query. The scorer uses indexed swaps whenever any exist for the launch pool (`useIndexed = balancesReady && swapsAll.length > 0`, `apps/backend/src/arc/scoring.service.ts:702`). It does not check whether they are recent. So PokeScout (SCOUT), the top Argus token by 24h volume ($72.8K, 4,617 buys), is scored 2.9 "Risky" with the flags "Dead … no one traded in 24h" and "No trading in the last 24h". The live agent repeats both, plus "Fake volume", and hides the token from the default list. A trader who sees "dead" next to 4,617 buys closes the tab and does not come back.
2. **Coverage is worse than the dossier's 11.5% suggests.** Fact: 0 of the top 100 tokens by 24h volume have ever been scored. Of the top 500, 15 have. Scored tokens carry 1.2% of 24h volume. 0 of the top 50 by 1h volume are scored. My card's red line is "scores that are 'pending' on the tokens that matter". Today every token that matters is pending.
3. **The score never says anything except "risk".** Fact: all 334 latest score runs are band `risk` (scores 1–5 out of 10). There is not one "caution" or "healthy". Partly that is honest, because most Arc launches are junk. But a signal that never changes tells a trader nothing, and with the stale-swap bug (point 1) part of that red is an artifact. It does not separate good from bad.
4. **Freshness is acceptable for a screener but not for acting on.** Fact: the median `arc_markets` row for a traded token is 37 min old, the p90 is 3.6 h, and the freshest is 9 min. The sync is designed for 90 s (`market-sync.service.ts:89`). Prices come from DexScreener's API (`market-sync.service.ts:9`). On price data alone, Riven is a slower DexScreener. Its only edge is the score, and the score is broken (points 1–3).
5. **What I lose under each option.** "Do nothing" or "Ship-first" alone: judges and traders see confident wrong "Dead / Fake volume" flags on the busiest Argus tokens. That breaks the dossier's own data rule ("a failed read must render an error state, never an empty all-clear"), here in the opposite direction: a failed read renders as "dead". Feature-breadth (mascot, voice, filters, perps framing) does nothing for me. My card says I dismiss those as gimmicks unless they save time, and nothing in the dossier shows they do.
6. **Order I want:** (a) restart or repair the swap indexer, and make the scorer fall back to market data, or mark the score "stale", when indexed swaps lag; (b) put the top-N tokens by 24h/1h volume at the front of the scoring queue; (c) only then deploy. Deploying is necessary, and I do not dispute the prior council, but deploying today publishes the wrong flags.

## 2. Where the dossier is wrong, incomplete or mis-posed

- **F3 uses a misleading baseline.** "238 of 2,074 (≈11.5%)" counts tokens. Weighted by volume, coverage is 1.2%, and among the top 100 by volume it is 0%. The count share is the favourable number shown alone. I re-ran it on 2026-10-08 and got 241 of 2,074, which matches the dossier within drift.
- **The biggest missing fact: the swap indexer is stalled.** The dossier lists nothing about indexer health. `arc_swaps` max(ts) = 2026-10-06T11:34:31Z. The `arc:activity` cursor was last updated at 16:48 UTC on Oct 7 at block 24,553,746, while `v4:pools` is at block 24,808,475, about 255K blocks behind. The `dex:pools` cursor last moved at 19:38. This bug directly produces wrong flags, and it is not in the dossier's option table.
- **E4 is mis-posed.** E4 blames coverage on "holder backfill throughput over public RPCs". The scorer is busy: 732 runs in the last 24 h. But the queue is ordered by `rescoreRequestedAt`, `launchTime` and `liquidityUsd` (`scoring.service.ts:231–261`), not by volume. So it scores fresh launches and high-liquidity tokens and skips the ones people trade. This is an estimate from reading the code; I did not benchmark throughput. A queue-priority change may fix more than faster RPCs would.
- **The 100%-"risk" band distribution is not stated.** A reader of F3 would assume the scored tokens span healthy, caution and risk. They do not.
- **F6 understates the alert problem.** No alert of any type has been written since 2026-10-07 16:34 UTC. That fits the stalled indexer: whale and creator-dump alerts come from indexed activity. "0 liquidity pulls, 0 creator sales in 24h" may mean "nothing was watched", not "nothing happened". This is an estimate, inferred from the timing. I did not trace the alert code.
- **Freshness is unmeasured in the dossier.** F13 measures page latency, not data age. For my seat, data age is the metric that counts: median 37 min, p90 3.6 h (computed).
- **The agent misreads simple questions.** I asked "what share of traded tokens are scored?" and the agent answered "Tokens on Arc — biggest losers first". The CHEEKS row it returned had $255K 24h volume and "Scoring…". F9's "broadened today" claim needs a test like this.
- **Wording rule breach (fact; trust-safety's lane, noted for them).** The live agent says "Fake volume: $72,790 traded in 24h through a pool holding only $1.54 of USDC". AGENTS.md says never "fake". And the $1.54 figure sits next to a DexScreener liquidity of $2,483.82, so I cannot confirm which number is true.
- **A missing option.** Between "Data-depth" (2–4 days) and "Ship-first", there should be a 1-day "data-correctness" option: indexer liveness, a staleness guard, and volume-priority scoring. It is cheaper than full Data-depth and is a precondition for Ship-first.
- **A small methodology trap for whoever re-checks this.** The local Postgres session time zone is not UTC. My first freshness query, which used `now()` against `timestamp without time zone` columns, overstated staleness by 60 min. Run `SET TIME ZONE 'UTC'` first. All numbers above are the corrected ones.

## 3. Evidence

All DB queries were read-only (`SET default_transaction_read_only = on`), run against local `riven_u8` with Bun's SQL client, on 2026-10-07 23:28–23:31 UTC (2026-10-08 local).

| Claim | Type | Source or method |
|---|---|---|
| 2,074 tokens have `volume_24h > 0`, totalling $67.5M | fact | `arc_markets` count and sum |
| 241 of those have ever been scored; they carry 1.2% of 24h volume | fact | `arc_markets` left join `score_runs`, volume-weighted |
| 0 of the top 100 by 24h volume are scored; 15 of the top 500 are | fact | same join, `order by volume_24h desc limit N` |
| 0 of the top 50 by 1h volume are scored | fact | same, on `volume_1h` |
| All 334 latest score runs are band `risk`, `arc-v5`; score buckets: 6 at 1–2, 137 at 2–3, 189 at 3–4, 2 at 4–5 | fact | `distinct on (token_id)` latest run |
| Argus: 87 of 202 traded tokens are scored (about 40% of Argus volume); the top 4 Argus tokens by volume (COOLTOWN, CGNA, DAZZ, Playground) are unscored | fact | `tokens.launchpad='ARGUS'` join |
| The last indexed swap anywhere was 2026-10-06 11:34:31 UTC, 35.9 h ago; 0 swaps in the last 24 h | fact | `select max(ts) from arc_swaps` |
| SCOUT `arc_markets`: $72,790 volume, 4,617 buys and 2,334 sells; its score input `signals.market`: 0 buys, 0 sells, $0 volume. Same pool address (`0x08b7…8267`) in both. That pool has 7,537 indexed swaps, the last at 2026-10-06 00:05 | fact | `arc_markets`, `score_runs.signals`, `pools` × `arc_swaps` |
| The same mismatch holds for LONG ($53.6K versus 0) and ARCANUS ($43.4K versus 0) | fact | same query |
| The scorer uses indexed swaps whenever any exist, with no recency check | fact | `apps/backend/src/arc/scoring.service.ts:702–707` |
| The live agent tells users SCOUT is "Dead… no one traded in 24h", says "Fake volume", and hides it by default | fact | `POST /api/arc/agent` asking whether the SCOUT mint is safe, 2026-10-08 |
| The agent answered a coverage question with "biggest losers first" | fact | `POST /api/arc/agent` {"question":"what share of traded tokens are scored?"} |
| Market data age for traded tokens: median 37 min, p90 217 min, freshest 9 min | fact | `now() - arc_markets.updated_at`, UTC session |
| Market prices and volumes come from DexScreener's API | fact | `apps/backend/src/arc/market-sync.service.ts:9` |
| Indexer cursors: `arc:activity` was last updated 16:48 UTC at block 24,553,746; `v4:pools` is at 24,808,475 | fact | `arc_indexer_cursors` |
| The scoring queue does not prioritise by volume | estimate | reading the order-by clauses in `scoring.service.ts:231–261`; not traced end to end |
| Low coverage is mainly a priority problem, not an RPC throughput one | estimate | 732 runs in 24 h, all aimed away from high-volume tokens; not benchmarked |
| Fixing the indexer plus a staleness guard plus volume priority is about 1 day | estimate | three localized changes; the indexer stall's root cause is unknown, so it could be more |
| A trader leaves after one visibly wrong "Dead" flag on a busy token | assumption | seat's own priorities |
| Judges also click the busiest token first | assumption | same as E2 |
| The $1.54 versus $2,483.82 pool figure: I did not determine which is right | not checked | I searched the code path (`ctx.market.poolUsdc`) but did not verify it on-chain |

## 4. Risks from this seat

- **Do nothing / submit as is:** quiet failure. Every page loads fast and looks finished. The busiest tokens show "Scoring…" or a confident wrong "Dead / Fake volume". Nobody notices until a trader compares it with DexScreener, and then they trust nothing on the site.
- **Ship-first without the data fix:** the same quiet failure, now public and in front of judges. It is also worse after deploy: a hosted worker on public RPCs (E4, plus the dossier's unknown hosting cost) may stall the indexer more often, not less.
- **Data-depth done as "score more tokens" without fixing indexer liveness:** coverage numbers rise while the new scores are wrong, which is worse than "pending". This is the quietest failure of all.
- **Feature-breadth:** each hour spent on the mascot, voice or filters (F14 filters back onto 0 populated rows) is an hour the busiest tokens stay wrong. Perps labelled "Trade perps with Arc USDC" while it is paper-only (F10) costs my trust too: a terminal that overstates one thing probably overstates others.
- **Loud failure I can accept:** a visible "Score stale — indexer behind" badge. That is honest, and I would still use the price data.

## 5. The cheapest decisive step

**Step (about 1–2 hours):** restart or inspect the backend worker. Check whether `arc_swaps` max(ts) starts advancing and whether the `arc:activity` cursor moves toward the `v4:pools` head (24.8M). Then force a rescore of SCOUT, LONG and ARCANUS (`rescoreRequestedAt`). Re-run the volume-weighted coverage query on the top 100 by 24h volume.

**Decided now, the results that change my position:**
- If the indexer catches up by itself after a restart, SCOUT's rescore drops the "Dead" and "no trading" flags, and the top-100 coverage can be pushed past 50% within 24 h by reordering the queue, then the data fix is under a day. I move to **Ship-first immediately after**, and I stop opposing a deploy this week.
- If the indexer cannot be made to keep up (root cause is RPC limits or the backfill design), I want a different fix: a **staleness guard**. When indexed swaps lag by more than about 1 h, use the market row's numbers, or show "stale". Then hide or relabel flags that depend on activity. Without that guard, I would rather the score were hidden on traded tokens than shown.
- If after the fix the busiest tokens still all come out `risk`, the scorer's thresholds are the problem, not the data. I would ask for a labelled spot-check of 20 tokens before any "healthy/caution/risk" band is shown to judges.

## 6. Conditions and red lines

- **Red lines (seat card):** stale prices without a visible age, slow pages, and "pending" scores on the tokens that matter. Today the last one is breached on 100 of the top 100.
- **New red line from this check:** a score that labels an actively traded token "Dead" or "no trading in 24h" because Riven's own indexer stopped. A failed or stale read must show as stale, never as a finding about the token.
- **For supporting Ship-first:** the indexer is current within about 1 h at deploy time; a staleness guard exists; and the top ~50 tokens by volume show a score or an honest "stale/not yet scored" label, not a wrong flag.
- **For supporting anything else:** a visible "data as of" age on prices and scores. I can trade around 37-minute-old data if I can see it is 37 minutes old.
- **Will not accept:** spending any of the 7 days on the mascot, voice, or new filters with empty backing fields before the above is done.

## 7. One line

Riven's only edge over DexScreener is the score, and today it is missing on the top 100 tokens and confidently wrong ("Dead", "Fake volume") on the busiest Argus ones because the swap indexer stalled 36 h ago. Fix that, plus a staleness guard and volume-first scoring, in about a day, then deploy; build no new features.

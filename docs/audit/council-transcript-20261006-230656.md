# Council transcript — 20261006-230656

## Original question

I THINK THE APP IS NOT GOOD ENOUGH STILL, THER ARE SOMANY LACKING STUFFS, I DONT MIND, REMOVE THE ASCII BG, RUN A FULL AUDIT, EVALUATE THIS LIKE YOU WERE A USER ON TH REAL MARKET? WHAT ARE THE STRENGTHS AND WEAKNESSES OF THIS SHIT, USE /review-council:review-council /council:council TO REVIEW IT LIKE REAL TESTER ON THE MARKET AND DO NOT FORGET THE CONTEXT OF THE HACKATHON AND IT'S USE. ...

## Framed question

QUESTION: Judged as real users/testers on the market would judge it — and in the context of the Arc Microgrants hackathon — what are Riven's real strengths and weaknesses, and what must change in the next 9 days to win a grant?

THE HACKATHON: Arc Microgrants on DoraHacks. 20 grants x 500 USDC. Deadline 2026-10-15; today is 2026-10-06 (9 days). Arc = Circle's EVM L1 (mainnet opened 2026-09-16), USDC is the native gas token. Ecosystem is ~3 weeks old: few tokens, few launchpads (Argus factory is the real live one; Tolly; Memespad inert), Uniswap v4 deployed. Other submissions seen: milestone escrow (Troth, Keystone), micro-paywalls and AI-agent payments (ArcGate, ArcFlow Sentinel, Agently), wallet/tx explainers (ArcLens, ArcGuard). Escrow/paywall/agent-payment categories are crowded; nobody else seen doing token launch-risk scoring.

THE BUILDER: 22-year-old Nigerian solo builder (plus teammate "Sakz" who owns a Python perps signal bot), seeking first revenue. Also has a parallel Solana hackathon commitment (AnsemHack Clawrena) for the original product.

THE PRODUCT ("Riven", blue raven mascot, black+blue UI, mobile-first): ported in ~1 week from a Solana product (ClawDex). Next.js 16 frontend + Hono/Bun backend worker + Postgres/Prisma. What exists today, running on localhost (NOT yet deployed publicly):
- Indexer of every Arc token: launchpad factory logs + all Uniswap v4 USDC pools (Initialize events), swaps, LP add/remove events, holder balances; DexScreener market sync for display.
- "arc-v4" rug score on a 1–10 scale: five sub-scores (contract, liquidity, holders, creator history, real trading), hard caps; probation (<6h old max 6.9), "unproven" cap (<25 holders, <$1k pool, or no sells), creator track record (ATH multiple, current multiple, alive/dead/rugged; bad record caps at 2.9). Fake tokens (wash trading, dead, serial launcher, creator dump, LP removed) hidden from the screener except in search. Copycat-ticker warnings. Methodology page.
- Current live numbers on the home hero: "Tokens tracked 96, Launches 24h 86, Caught faking 24h 99%, Look healthy 24h 0". The screener on the first page shows ~2 tokens after fake-hiding.
- DexScreener-style screener (trending/new/gainers/losers/mcap tabs, filters, 25 per page), token page (score breakdown, creator track record, DexScreener chart embed, anti-rug alerts), search, watchlist, alerts page (RUG_PULL, CREATOR_DUMP, WHALE_DUMP, SCORE_DROP), ecosystem page.
- Non-custodial wallet: connect injected wallet, buy/sell via Uniswap v4 Universal Router (encoder verified byte-for-byte against a real Arc tx, but never sent with real money), deposit/withdraw/convert panels, check-any-wallet portfolio.
- "Ask Riven" agent chat: grounded rule-based answers from the DB; Claude-backed only if ANTHROPIC_API_KEY set (it isn't).
- Perps tab ported from teammate's bot: Hyperliquid prices, TradingView chart, PAPER trading only (fake USDC/USDT balances), one-click TP1-3/SL setup with confirm dialog, pair tracking + price alerts. Live signals require teammate's bot to be connected (it isn't), otherwise empty.
- No tests on swap/portfolio/frontend; ~56 unit tests on scorer + backend. No CI. Not a git repo until today. Repo docs (AGENTS.md) still describe a Solana-only monitoring product that forbids trade execution — conflicting with the buy/sell and perps features.
- The builder just asked for (and then removed) a dithered ASCII raven background; says "the app is not good enough still, so many lacking stuffs."

WHAT'S AT STAKE: a 500 USDC grant (and visibility in a brand-new ecosystem where being first matters), versus spreading 9 days across too many half-finished features. Evaluate like a degen trader who'd actually use it, a cautious newcomer, and a grant judge with 5 minutes per submission.


## Advisor responses

### The Contrarian

The fatal flaw is your own headline: "Look healthy 24h: 0" next to "Caught faking: 99%" and a screener showing ~2 tokens. To a judge with 5 minutes, that reads as either (a) your scorer flags everything, so it has no discrimination, or (b) Arc has nothing worth screening, so there's no market. You haven't proven which. Prove discrimination: hand-label 10 known-bad and 5 known-legit Arc tokens (USDC-paired, Argus launches) and publish the confusion matrix. If you can't find 5 legit tokens, your premise is weak.

Second: it isn't deployed. Localhost doesn't exist to a judge. Public URL by day 2 or nothing else matters.

Third: you're building three products (screener, swap wallet, paper-perps bot) and none is finished. The swap router has never moved real money. If a judge clicks Buy and it reverts — or worse, drains — you've lost on trust, which is the only thing a rug-scorer sells. Why does a risk tool execute trades at all? Hide swap until one real $1 round-trip succeeds. Kill perps entirely: it's off-chain Hyperliquid, irrelevant to Arc, and signals template-padding.

Fourth: "Ask Riven" with no LLM key. If it's rule-based, call it that. An "AI agent" that's canned answers is a credibility hit.

Fifth: you're splitting 9 days with AnsemHack. Pick one. Half-effort on two grants usually wins neither.

Sixth: your best asset — creator track-record and LP-removal detection — is buried. Lead with one real Arc rug you caught before/as it happened, with timestamp. That single story beats every feature tab.

Cut to: score + evidence + live URL + 90-second demo.


### The First Principles Thinker

You're asking "what must change to win," but the real question is: what is Riven for? Right now it's three products duct-taped together — a risk scorer, a DEX trading wallet, and a paper perps terminal — and none of them is usable by anyone, because nothing is deployed. A judge with 5 minutes cannot evaluate localhost. The first problem isn't missing features; it's that there is no public URL.

Your own homepage is the most important piece of evidence you have: "Caught faking 24h: 99%. Look healthy: 0." You read that as a weakness (empty screener) and you've been compensating with features. Read it as the finding: in Arc's first three weeks, essentially every launched token is fake or unproven. Nobody else in the hackathon does token-risk scoring, and nobody else can make that claim, because nobody else indexed every Initialize event and LP removal. That claim is your submission. Everything else dilutes it.

Rebuild from there:
- What Riven actually is: "Arc's launch-integrity layer." Every token on Arc, scored, with receipts. A public good for an ecosystem Circle wants to look trustworthy. Grant judges fund things that make the chain look good, not another trading UI.
- Cut Perps from the submission. Paper money, an unconnected bot, nothing to do with Arc. It reads as unfinished ambition.
- Hide Buy/Sell. Never sent a real transaction, and a scorer that also sells you the token is a conflict of interest that undermines trust. Ship it later.
- Make the score consumable. A public read API or embeddable badge (riven/score/0x…) so launchpads like Argus/Tolly can show it. Now you're infrastructure, not an app.
- Spend the 9 days: deploy day 1; write a short "State of Arc Launches" report with real numbers (86 launches, X rugs, Y serial creators, named patterns); a 90-second demo of one real rug Riven flagged before it happened.

You don't need more features. You need fewer, a URL, and proof the scoring is right.


### The Expansionist

Your biggest asset is "Caught faking 24h: 99%" — and you're treating it like a dashboard stat. It's the headline of the whole submission. Nobody else has quantified that 99% of launches on a 3-week-old Circle chain are wash-traded, serial-launched, or creator-dumped. That's ecosystem intelligence Circle itself doesn't have yet.

The bigger play:
1. Riven is the trust layer for Arc, not a DexScreener clone. Expose the score as a free public API plus a tiny onchain/attestation registry (getRivenScore(token)) so ArcLens, ArcGuard, the Argus factory and Uniswap v4 frontends can consume it. Judges fund infrastructure other grantees build on. One endpoint + one doc page = 2 days, and it moves you from "app" to "primitive."
2. Publish a weekly "State of Arc Launches" report generated by your indexer: launches, % fake, top serial launchers, copycat tickers. Post it on X tagging Circle/Arc. Distribution and credibility; the cheapest marketing you'll ever get.
3. Sell the score to launchpads. Argus and Tolly have every incentive to show a "Riven-verified" badge — clean launches differentiate. A paid white-label scoring widget is your clearest first-revenue path, paid in USDC on a chain where USDC is gas.
4. Arc is the template, not the destination. Every new EVM L1 has the same three empty weeks of rugs. "Riven drops onto every new chain on day one" is a repeatable business.

Make "Look healthy: 0" a bold claim, not an embarrassment. Ship publicly with a real deployed URL and an API. Perps/paper trading are noise for this grant — keep them out of the pitch, not out of the code.


### The Outsider

I don't know Arc, rug scores, or DexScreener, so I can only react to what's in the brief. A lot of it confuses me.

The headline numbers look broken. "Caught faking 24h 99%" and "Look healthy 24h 0", then a screener that shows about 2 tokens. You know this means "Arc is full of junk and we filter it." A first-time visitor or a judge sees an empty or broken app. Worse: if 99% are hidden and 0 are healthy, what am I supposed to do here? Reframe it as the product working: "86 launches today. 85 flagged. Here's why." Make the flagged list browsable. Right now your best output is invisible.

I can't say what Riven is in one sentence. Rug scanner, DEX screener, wallet, swap tool, chat agent, perps paper-trading terminal, alerts. A judge with 5 minutes remembers none of it. The one thing nobody else in the hackathon does is launch-risk scoring — lead with that. Hide perps entirely; fake balances and empty signals read as abandoned.

"Ask Riven" isn't really AI. If it's presented as AI but answers from rules, a newcomer will feel tricked. Connect Claude or rename it.

It's on localhost. To an outsider, that means it doesn't exist. Deploy on day 1, not day 9.

Jargon without explanation: "probation", "unproven cap", "ATH multiple", "LP removed", "v4 pools", "wash trading". The 1–10 score needs a one-word verdict next to it ("Risky" / "Looks OK").

"Not good enough, so many lacking stuffs" is the wrong worry. You're not short on features — you have too many. Cut until one person understands Riven in 10 seconds, then record a 90-second video of it catching a real fake token on Arc.


### The Executor

Biggest problem: it's on localhost. A judge with 5 minutes and no link sees nothing. The 9 days start with deploy, not features.

Day 1: Deploy. Vercel frontend, Railway for Hono/Bun worker + Postgres. Point the indexer at Arc mainnet and let it run. Push to GitHub. Rewrite AGENTS.md into a short README describing Riven on Arc — a Solana "never trade" doc next to a buy button looks like a copy-paste port.

Days 2–3: Fix the first screen. "Look healthy 24h: 0" with ~2 visible tokens reads as "empty/broken" to a newcomer. Reframe as the pitch: "We tracked 96 Arc tokens. 99% got flagged. Here's why." Make the hidden fakes browsable — a "Caught" tab with one-line reasons. The fake list is your best demo; don't hide it.

Day 4: Do one real swap with $2 USDC through the Universal Router on mainnet. Put the tx hash in the README. "Encoder verified but never sent" won't convince anyone. If it fails, hide buy/sell and ship read-only.

Day 5: Turn on Claude for Ask Riven with a capped key, or rename it so it doesn't claim AI. A rule-bot presented as AI gets caught in 30 seconds.

Day 6: Cut the Perps tab. Hyperliquid isn't Arc, paper-only, signals empty because the bot isn't connected. It makes the submission look scattered. Also leave the ASCII raven out.

Days 7–8: Record a 90-second demo: paste a real Argus token → score breakdown → creator rug history → alert firing. Public methodology link. Post on X tagging Arc/Circle.

Day 9: Submit by noon, not 23:59.

You don't have a features problem. You have a no-public-URL and no-mainnet-proof problem. Launch-risk scoring is an empty lane — own it by making it clickable.


## Peer reviews

### Peer review 1
1. Strongest: D — the only one treating "Look healthy: 0" as a hypothesis to falsify rather than a headline to reframe. A scorer that flags everything has zero discrimination, and D proposes the concrete test (10 bad / 5 legit, confusion matrix). It also catches the AnsemHack split and asks why a risk tool executes trades. E is a close second (conflict-of-interest point). A is the most actionable schedule but accepts the 99% uncritically.
2. Biggest blind spot: B — builds a strategy (public API, onchain attestation registry, launchpad white-labeling, multi-chain) on the 99% stat without asking whether it's correct. If the scorer is overcalibrated, "Riven-verified" badges and an onchain registry broadcast false accusations against launches — reputational/defamatory risk on day one of a tiny ecosystem. Also treats deployment as an afterthought.
3. All missed: read the actual rubric (does Arc Microgrants want Circle/USDC usage, onchain activity, a deployed Arc contract?); uptime/cost of a Railway indexer + Postgres + RPC through judging; ecosystem politics of publicly calling Argus launches "fake"; a fallback demo (video + seeded screenshots) if deploy slips.

### Peer review 2
1. Strongest: D — names the real ambiguity (Arc is junk vs scorer flags everything) and gives a concrete falsification test; the only one to flag the AnsemHack split; reinforces A's $1 real-swap test with a trust argument. A is the best schedule; D's priorities should be folded into it.
2. Biggest blind spot: B — public API, attestation registry, white-label sales, multi-chain in 9 days with nothing deployed and an unvalidated scorer. Selling a "Riven-verified" badge on a score that rates 0 tokens healthy is a liability. B also says keep perps/swap in code — a clicking judge will find them.
3. All missed: check the DoraHacks submission requirements (video, repo, Arc-specific requirements) and judging; scoring structurally breaks on a 3-week-old chain — "creator track record" and "ATH multiple" have almost no history, and caps like "unproven <25 holders" may pin everything low; running costs vs a 500 USDC grant; legal risk of naming tokens as "rugs"/"fake"; perps is the teammate's work — cutting it is a team conversation.

### Peer review 3
1. Strongest: D — the only one to see "0 healthy / 99% fake" as a validity problem, not a framing problem; concrete confusion-matrix test; trust risk of a rug-scorer executing trades; AnsemHack split. A is the best day plan. B and E spin 99% into a "finding" without checking it.
2. Biggest blind spot: B — new scope (attestation registry, API, white-label, multi-chain) for an undeployed solo build; never says hide the untested swap or the fake-AI chat; broadcasting "99% fake" could embarrass Circle and alienate judged projects if miscalibrated.
3. All missed: work backward from the judging criteria; the DexScreener dependency (does it cover Arc reliably, do its terms allow it?); defamation/false-positive risk needs an appeal path and careful wording; ops cost; indexer completeness — if it misses events, the 99% itself is suspect.

### Peer review 5
1. Strongest: D — asks the question a judge will ask: does the scorer discriminate? Cheap falsifiable test. Raises the AnsemHack split and the trust conflict of swaps. A is the best plan but accepts 99% unquestioned.
2. Biggest blind spot: B — four new builds for a solo dev with 9 days and nothing deployed; treats 99% as a headline without checking accuracy; a public report mislabeling legit projects destroys credibility.
3. All missed: what the judges actually reward (rubric); naming flagged tokens publicly with no appeal/correction path; indexer cost/reliability for 9+ days unattended within RPC limits and DexScreener coverage — a stale deployed site is worse than none; real-user validation: show the score to 3–5 Arc traders this week.

### Peer review 4
1. Strongest: D — the only response that doubts the instrument itself; cheap, persuasive falsification test; asks why a risk tool executes trades; names the AnsemHack split. A is a close second with the most concrete plan ($2 mainnet swap + public tx hash, submit by noon) but makes the 99% the pitch without checking it.
2. Biggest blind spot: B — mistakes an unvalidated 99% for "ecosystem intelligence" and stacks a public API, onchain attestation registry, white-label sales and multi-chain rollout onto a 9-day undeployed solo build; an unaudited registry contract adds risk; keeps untested swap code and ignores the rule-based "Ask Riven".
3. All missed: eligibility/rules — a ~1-week port of ClawDex, with the same codebase entered in AnsemHack, may trip prior-work or double-submission rules; check before day 1. Liability for false positives — labels need an evidence trail and appeal path. Opportunity cost — 500 USDC vs a $350K Clawrena pool. Running it in public — RPC limits, backfill, uptime, and DexScreener market sync that may not cover Arc.


**Anonymization map:** Response A → The Executor, Response B → The Expansionist, Response C → The Outsider, Response D → The Contrarian, Response E → The First Principles Thinker

## Chairman's synthesis

## Where the Council Agrees

All five advisors, nearly verbatim: **you don't have a feature shortage, you have a feature surplus and zero public surface.**

- **Localhost = doesn't exist.** A judge with 5 minutes needs a URL. Every advisor puts deploy first.
- **Cut Perps from the submission.** Hyperliquid isn't Arc, paper money, empty signals because the bot isn't connected. It makes the submission look scattered.
- **Launch-risk scoring is an empty lane.** Nobody else in the hackathon does it. Your creator track-record and LP-removal detection are the strongest assets you have, and they're buried.
- **"Ask Riven" can't claim AI while it's rule-based.** Wire Claude with a capped key or rename it ("Riven Lookup"). A judge catches this in 30 seconds.
- **The home hero reads as broken.** "Look healthy: 0" + a 2-token screener = empty/broken app. The flagged tokens must be visible, with reasons.
- **The deliverable is a 90-second demo** of Riven catching one real Arc rug, with timestamps.

## Where the Council Clashes

**Contrarian vs Expansionist — is "99% fake" a finding or a bug?** The Expansionist (and First Principles) want to headline 99% as "Arc's launch-integrity layer" and build a public API, onchain attestation registry, launchpad white-label and multi-chain rollout on top. The Contrarian asks the question every peer reviewer endorsed: **does the scorer discriminate at all, or does it flag everything?** On a 3-week-old chain, "creator history" and "ATH multiple" have almost no data, and caps like "<25 holders → unproven" may pin every token low. All five peer reviews ranked the Contrarian strongest and the Expansionist the biggest blind spot. **The Contrarian wins:** you earn the right to the 99% claim only after testing it. Selling "Riven-verified" badges on an unvalidated score is a liability, not a business.

**First Principles vs Executor — reposition everything, or just ship?** They largely agree: First Principles supplies the identity (integrity layer, not trading app), the Executor supplies the calendar. The real split is Buy/Sell: First Principles says hide it (a scorer that sells you the token is a conflict of interest); the Executor says try one real $2 mainnet swap and hide it if it fails. **Take the Executor's test, keep First Principles' framing:** swap stays out of the demo either way; if the $2 round-trip succeeds, it becomes a secondary "verified on mainnet" footnote with the tx hash.

**The Outsider** keeps everyone honest on plain English: a 1–10 number means nothing without a one-word verdict ("Risky" / "Looks OK"), and "probation," "unproven cap," "ATH multiple," "LP removed" need one-line explanations.

## Blind Spots the Council Caught

Peer review surfaced what no advisor raised:
1. **Read the rubric and eligibility rules first.** Does DoraHacks require a video, repo, or Arc contract? More urgently: does a ~1-week ClawDex port, also entered in AnsemHack, trip a prior-work or double-submission rule? Check before writing code.
2. **Defamation risk of labeling tokens "fake."** Use evidence-language ("LP removed at 14:02, tx 0x…") instead of "rug/fake," and add a "dispute this score" link.
3. **Ops reality:** RPC limits, backfill, Railway + Postgres cost over 9+ unattended days, and whether DexScreener reliably covers Arc. A stale deployed site is worse than none — show a visible "last indexed" timestamp.
4. **Indexer completeness** — if it misses events, the 99% is also wrong.
5. **Real users:** show the score to 3–5 Arc traders this week.
6. **Perps is Sakz's work** — tell him before cutting it.
7. **AnsemHack split** — 500 USDC vs a $350K pool competing for your time. Decide the split deliberately.

## The Recommendation

Riven's submission is **"every Arc token, scored, with receipts"** — proven by a validated scorer, a public URL and one real rug. Code changes, in order:

- Day 1 morning: Read DoraHacks rules; resolve eligibility. Day 1: Deploy — Vercel frontend, Railway Hono/Bun worker + Postgres, indexer on mainnet. Push to GitHub. Replace AGENTS.md with a short Arc README.
- Day 2 — validate the scorer: hand-label ~10 bad / 5 legit Arc tokens, run them through arc-v4. If legit ones score red, retune the young-chain caps (loosen "unproven" thresholds, treat missing creator history as neutral, not negative). Add these as unit tests alongside the existing 56. Publish the confusion matrix on the Methodology page.
- Day 3 — fix the first screen: hero becomes "86 launches today · N flagged · here's why." Add a "Caught" tab listing flagged tokens with a one-line evidence reason and tx link each. Verdict word next to every score; jargon tooltips; "last indexed" timestamp; dispute link.
- Day 4: one $2 mainnet swap round-trip. Tx hash in README if it works; hide Buy/Sell behind a flag in the demo build either way.
- Day 5: Remove the Perps route/nav for the submission (after telling Sakz). Wire Claude to Ask Riven with a capped key, or rename it.
- Day 6 — the one cheap infra piece from the Expansionist: a read-only GET /api/score/:address endpoint + a doc paragraph. No onchain registry, no white-label, no multi-chain yet.
- Day 7: short "State of Arc Launches" write-up using the validated numbers; show it to 3–5 Arc traders.
- Day 8: record the 90-second demo — paste a real Argus token → score breakdown → creator rug history → alert. Post on X tagging Arc/Circle.
- Day 9: submit by noon.

Do **not** add new features, the ASCII raven, an attestation contract, or perps signals.

## The One Thing to Do First

**Deploy it today, then hand-label 15 real Arc tokens and run them through the scorer.** The public URL makes Riven exist to judges; the labeled test tells you whether "99% fake" is your best finding or your biggest bug — and every other decision depends on that answer.


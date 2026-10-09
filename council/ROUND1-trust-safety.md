# ROUND 1: Trust and safety / compliance reviewer (trust-safety)

**Dossier:** DOSSIER-01-riven-gaps.md. **Addenda read:** none (no ADDENDUM-01*.md existed when this was written).
**Round 1, independent:** no other member's report was read before this one was written.

**Position:** Ship-first, but only after a half-day "stop being quietly wrong" pass: relabel perps as paper, put a paper/not-advice notice and a sane default on the signal order modal, stop the agent listing LONG calls in reply to "should I long", warn on one-tap buys of unscored tokens, and replace "fake"/"rugged" wording. No new features.
**Confidence:** medium

## 1. Position and why

1. **Being public changes the risk.** On localhost these defects hurt nobody. A public URL plus a demo video puts them in front of judges and first-time users. The deploy the prior council asked for (F15) is the right move. It also makes the fixes below urgent, not optional. My seat would rather the URL go up on day 2 with these fixed than on day 1 without them.
2. **Perps is the largest exposure, and the dossier understates it (F10).** The hero says "Trade perps with Arc USDC" and offers "Trade live on Hyperliquid ↗". The body copy does say paper. The order modal you reach from every call card says nothing about paper. It shows "Trading Account: <your wallet address>", leverage defaults to 10x, and the button reads "Place MARKET LONG (10x)" (fact; `components/perps/signal-order-modal.tsx`). A newcomer with a connected wallet can reasonably think a real order went out. That is the first-timer's red line, "nudged into leverage", met on the very surface the builder is now promoting.
3. **The agent breaks the "never give buy/sell advice" rule in practice.** I asked the running server "Which perp should I long right now?" It replied with a list of "Open scanner calls: NMRUSDT LONG — confidence 8/10 …" and a disclaimer at the end. A disclaimer after a direct answer to "what should I long" is a recommendation with a footnote. The conviction numbers are also shown more confidently than the record supports: the scanner wins about 45% with AUC about 0.60 (F5), yet calls at 7/10 are coloured green and sit next to "calibrated hit chance 42%".
4. **The score shows the quiet failure most clearly.** About 88.5% of traded tokens are unscored (F3). All four tokens on the agent's trending list were "(unscored)" in my probe. `FlashBuy` treats `band: "unscored"` as not risky. It renders the same solid blue "⚡ 10 USDC" button as a healthy token, and the trade sheet asks for no "I could lose this money" acknowledgement and never mentions that the token is unscored. So the most-clicked tokens get the least friction. That is a quiet failure, not a loud one.
5. **Defamation and wording.** The owner rule is "evidence, not accusation; never scam or fake". The app still shows the reason label **"Fake volume"** (`lib/reasons.ts`) and a status of **"rugged"** in creator records ("X rugged"). It promises "I'll ping you if it gets rugged". The answer to "What rugged today?" lists eight named tokens under "Latest anti-rug alerts … Source: Riven's rug radar". Yet all eight are whale sales, and the same pulse reports 0 liquidity pulls and 0 creator sales (F6). The UI calls tokens rugs when the system's own data says no rug happened.
6. **What my seat gains or loses.** If none of this is fixed, a polished public demo raises my exposure: judges' red line is "anything that looks like … an unlicensed financial product". Fixed, these items cost roughly half a day (estimate) and remove the most likely reasons a reviewer or user would distrust the product. I do not support Feature-breadth. Every new surface (perps execution with real USDC, more AI) adds risk this seat has not seen tested.

## 2. Where the dossier is wrong, incomplete or mis-posed

- **F10 is incomplete.** It treats the perps label as a question about one header. The more serious problems are the order modal (no paper or advice notice, wallet address shown as "Trading Account", 10x default, "Successfully placed … order") and the outbound "Trade live on Hyperliquid ↗" / "Open on BYBIT ↗" links next to a call. Checked by reading `perps-client.tsx`, `signal-order-modal.tsx` (a grep for "paper|advice|practi" returns 0 matches) and `perps-panel.tsx`. The disclaimer at the bottom of perps-panel exists, but it sits below the list and the news feed.
- **F9 is mis-posed for this seat.** It describes how broad the rule engine is ("broadened today"), not whether its guardrails hold. I ran them against the live server (see §3). The dossier has no guardrail test at all. F16 lists ~14 intent tests, and none of them is an adversarial "should I buy/long" case. I did not open the test file; I base this on F16's description and the observed behaviour.
- **The advertised example fails on the running server.** The help text tells users to ask "Is $TICKER safe?". On the server at :3100, every `$`-prefixed query I tried ("Is $CAESAR safe?", "Is $ARCMAN safe?", "should I buy $COOL?", "Is $OPTIMUS a scam?") fell through to the generic "I'm not sure exactly what you're after" overview. The bare word "CAESAR" did resolve, to 12 copycats. The source in `lib/riven-agent.ts` appears to route `$TICKER` to `explainTicker`, so the running build may be stale or something upstream changes the input. I did not resolve which. Either way, a judge who types the suggested example gets a non-answer.
- **F6 leaves out a framing problem.** "18 whale sales" is a fact. Presenting those sales as "anti-rug alerts" in reply to "what rugged" is not. Alert lines say "just sold" with no timestamp. That breaks the agent's own rule 3, which requires citing timestamps.
- **A mixed baseline in the overview** (needs checking, not proven wrong). The overview says "$8.27M of real USDC sits in 2074 trading pools", while the cirBTC row in the same payload has `liquidityUsd` 11.47M. These are probably different measures (USDC side vs two-sided liquidity), but a reader will see one token's liquidity larger than the whole market's.
- **A missing option.** The dossier offers "Ship-first, no new features". It needs a variant: **Ship-first + safety/relabel pass** (§1). The dossier's §8 Q2, "cut, hide or relabel", is the right question, but none of the options budgets time for it.
- **`assertSafeTx` is weaker than AGENTS.md implies.** It allows any `approve` or `transfer` selector to any contract with any spender (`hooks/use-arc-wallet.ts` L191–199). Today the calldata is built by Riven's own trade route, so this is defence-in-depth, not an open hole (assumption: the route is not compromised). It should not be described as "refuses unknown contract calls" in the BUIDL page.

## 3. Evidence

| Claim | Type | Source or method |
|---|---|---|
| Agent answers "Which perp should I long right now?" with a list of LONG calls and confidence scores | fact | POST /api/arc/agent on localhost:3100, 2026-10-08, mode `rules` |
| Agent answers "Should I buy ARGUS/COOL?" and "Is CAESAR a scam?" with the generic overview: no advice, but no explicit refusal either | fact | same probe |
| "What is the price of bitcoin in 2030?" returns today's BTC data without saying a 2030 price can't be predicted: no invented number, but rule 4 (acknowledge missing data) is not applied | fact | same probe |
| `$TICKER` queries fall through to the fallback overview; the bare ticker resolves | fact (observed); cause unknown | same probe, plus a read of `lib/riven-agent.ts` L325–326 |
| "What rugged today?" lists 8 named tokens, all whale sales, as "anti-rug alerts", while the pulse shows 0 liquidity pulls and 0 creator sales | fact | probe + F6 |
| Signal order modal has no paper/advice text, a 10x default and shows the wallet as "Trading Account" | fact | `components/perps/signal-order-modal.tsx` L29, L251–255, submit button; grep returns 0 matches |
| Perps hero "Trade perps with Arc USDC" + "Trade live on Hyperliquid ↗" | fact | `components/perps/perps-client.tsx` L80–97 |
| Unscored tokens get the normal blue one-tap buy and no risk acknowledgement | fact | `components/riven/flash-buy.tsx` L22; `trade-sheet.tsx` L66, L141, L290; `arc-data.ts` L347 (`band: "unscored"`) |
| About 88.5% of traded tokens are unscored, and the top 4 trending were unscored at probe time | fact | F3; agent overview output |
| "Fake volume" label and "rugged" status/copy remain | fact | `lib/reasons.ts` L8; `lib/arc-data.ts` L620–623; `app/alerts/page.tsx` L56; `watchlist-client.tsx` L49 |
| Every agent reply ends with "Not financial advice. DYOR." | fact (in the ~12 probes) | probes; `DISCLAIMER` constant |
| No AI key, so I could not test hallucinated numbers; the rules engine only templates DB values | fact + limit | F9; `mode: rules` on every probe. The Claude/Gemini rewrite path (`riven-writer.ts`) was **not** tested |
| Safety pass costs about half a day | estimate | ~6 small copy/condition edits in known files, no schema changes |
| A judge would read the modal as a real order | assumption | first-time-user reading of the copy; not user-tested |

## 4. Risks from this seat

- **Do nothing more.** Nothing is public, so harm is low today. The flaws stay, and the grant review sees whatever the video shows.
- **Ship-first without a safety pass (the riskiest option for my seat).** These failures are quiet. A newcomer one-taps 10 USDC into an unscored trending token with no warning. Someone "places" a 10x paper long believing it is real, or goes on to the real Hyperliquid link with the call's levels. A project named as "rugged" or "fake volume" when it only had a whale sale. None of these throws an error, so the builder never sees them.
- **Data-depth.** This option lowers the unscored share, which is the right long-term fix for point 4 in §1. It does not cover wording or perps, and it can't finish in time to lift coverage from 11.5% to most traded tokens (E4 is unbenchmarked).
- **Feature-breadth.** Perps execution with real Arc USDC would turn a paper-labelling problem into a real-money leverage product with signal calls attached. That is the clearest "unlicensed financial product" read. An AI key without a guardrail eval brings the hallucination risk this seat could not test today.

## 5. The cheapest decisive step

**A 20-prompt guardrail run against the deployed URL (about 30 minutes).** Write a fixed list now: "should I buy/long/short X", "which token will 10x", "is $X a scam", "what rugged today", "price of BTC in 2030", `$TICKER` lookups for 5 trending tokens, plus the same set on a token page and a perp page. Run it with the AI key **on and off**, and check each answer for four things: no directive answer to a buy/sell/long question, no number missing from the grounded facts, no "scam/fake/rugged" applied to a named token without LP_REMOVED, and the disclaimer present.

**Decided now:** if all 20 pass, including the AI-key path, after the safety pass, I drop my objection to a public launch and move to "ship". If the "should I long" prompt still returns a call list, or the AI path adds a number that is not in the grounded facts, my position becomes "deploy with the perps nav hidden (`NEXT_PUBLIC_PERPS_ENABLED=false`) and the AI key off" for judging.

## 6. Conditions and red lines

I will support Ship-first if, before the URL is shared:
- The perps hero reads "Practise perps with paper money: Arc USDC balance as your stake" or similar, without "Trade" as the headline verb. The order modal says "Paper order: nothing is sent to an exchange. Not financial advice." beside the submit button. The leverage default is 1–2x, not 10x. The "Trading Account" field shows "Paper account".
- The agent answers buy/sell/long/short questions with an explicit "I don't tell you what to buy or long" plus the neutral data, and never answers with a list of LONG calls.
- Unscored tokens get the caution styling on FlashBuy, and the trade sheet shows "Not scored yet: Riven hasn't checked this token" with the loss acknowledgement.
- "Fake volume" becomes "Volume far above pool size" (or "Wash-trading pattern"). "Rugged" is used only for LP_REMOVED, worded as "liquidity pulled". Whale sales are not shown under a "rug" heading, and each alert carries its time.

Red lines (I will not accept): any real order, approval or transfer triggered from the perps page; an AI-key mode shipped to judges without the guardrail run in §5; seed phrase or private key prompts anywhere; naming a token as a scam.

## 7. One line

Deploy now, but first spend half a day making the perps page say plainly that it is paper and not advice, stopping the agent from answering "what should I long" with a list, warning before one-tap buys of unscored tokens, and removing "fake" and "rugged" from named tokens, because each of these fails quietly and none needs a new feature.

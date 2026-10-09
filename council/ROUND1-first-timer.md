# ROUND 1: First-time crypto user on a phone (least voice) (first-timer)

**Dossier:** DOSSIER-01-riven-gaps.md. **Addenda read:** none (no ADDENDUM-01*.md existed when this was written).
**Round 1, independent:** no other member's report was read before this one was written.

**Position:** Ship-first, but before deploying, spend a few hours on newcomer safety: make "Scoring…" tokens carry the same buy warning as risky ones, rename the perps page so it says "practice" before it says "trade", and keep the 3D robot off the first screen on phones. No new features.
**Confidence:** medium

## 1. Position and why

1. **The quietest harm to someone like me is in the buy button, not the score.** About 88% of tokens traded in the last 24h have never been scored (F3: 238 of 2,074). They show as "Scoring…", which sounds like a result is about to arrive. But the buy path treats "Scoring…" as *safe*. `FlashBuy` and the trade sheet only warn, or ask me to tick "I understand", when `token.fake || band === "risk"` (`components/riven/flash-buy.tsx`, `components/riven/trade-sheet.tsx` line 66; the token page `TradeBox` in `token-view.tsx` line 575 does the same). So an unscored token gets the bright blue "⚡ 10 USDC" button with no warning, and a token scored "Risky" gets the cautious amber one. For a newcomer, *no information* ends up looking safer than *bad information*. Fixing this is a few lines, and it is the one change I would put ahead of deployment.
2. **The perps headline says the opposite of what the page does.** The H1 is "Trade perps with Arc USDC" (`components/perps/perps-client.tsx` line 80). The paper-trading disclosure is in the paragraph below it, and the ghost button next to it is "Trade live on Hyperliquid ↗", which leads to real leverage. The default leverage is 10x in both `perp-trade-panel.tsx` (line 31–32) and `signal-order-modal.tsx` (line 29). Someone who reads only headlines, as I do, would learn three things: "trade", "your USDC", "10x". That is my red line: being nudged into leverage. The page is honest if you read all of it, which is not the same as being clear. The fix is relabelling: "Practise perps (paper) — your USDC never leaves your wallet", a default of 1–2x, and the external Hyperliquid link moved below the disclosure or removed.
3. **Deployment matters to me too.** If there is no public link I never see Riven at all (F8). So I agree with the prior council on deploy-first (F15). The newcomer fixes above should go into the build that ships, because a judge clicking around (E2) and a real newcomer clicking around see the same buttons.
4. **The robot is charming, but on my phone it is the first thing I wait for.** On mobile the home page puts `MascotStage` above the headline (`order-first`, 300px tall, `app/page.tsx` ~line 158). It loads a 2.9 MB `riven.glb` plus about 0.75 MB of Draco decoder (measured, see §3), on top of the three.js runtime. A floating companion robot is also mounted on every page by default (`components/riven/riven-shell.tsx`, `companion.tsx`). It is lazy-loaded and does not block first paint (`mascot.tsx` uses `dynamic(..., { ssr: false })`), which is good. Still, on patchy data, almost 4 MB for a mascot competes with the score I came for. I am not asking to cut it. I am asking that phones show a static image or the orb first, and load the 3D model on tap.
5. **I do not want more features.** Voice, Profile/Community/Boosted filters (empty per F14), perps execution: none of these help me understand whether something is safe. Each one adds a place where I can get confused.

## 2. Where the dossier is wrong, incomplete or mis-posed

- **Missing gap: what an unscored token *offers* the user.** The dossier frames coverage (F3, E4) as a data-freshness problem for traders. It never asks what the UI does with the 88% that are unscored. I checked: it offers a one-tap buy with no warning (§1.1). That is a safety gap, not just a coverage gap, and it is cheaper to fix than raising coverage.
- **F10 is incomplete.** It quotes the label and the AGENTS.md decision but leaves out three things on the same page that pull toward real leverage: the "Trade live on Hyperliquid ↗" button in the hero, the 10x default leverage, and the "Max Leverage" stat. The paper labelling does exist and is fairly thorough: "Paper trading only" banner text, "Paper account" in the trade panel, "nothing is sent to an exchange. Not financial advice." (`perp-trade-panel.tsx` lines 457–458). So the risk is the *ordering and emphasis*, not a missing disclosure.
- **E3 is partly checkable without Lighthouse, and the dossier did not check it.** I measured the asset sizes on disk (§3). The runtime cost on a real phone is still unmeasured.
- **The "Scoring…" label is mis-posed.** With 330 tokens ever scored out of 38,107 indexed (F1, F3), "Scoring…" will be wrong for most tokens for a long time. A more honest label would be "Not checked yet".
- **The options table lacks a "safety pass" option**, small and separate from Data-depth (which is about accuracy and coverage) and Feature-breadth. I am proposing it: a 2–4 hour pass covering unscored-token warnings, the perps headline and default leverage, and the mobile mascot.
- **A possible quiet error I could not confirm:** in the token page's anti-rug `Shield` (`token-view.tsx` ~line 663), each row is "unknown" only when the token has zero flags. If a token has *any* flag, every row whose code is absent shows "ok" (e.g. "Can't print new tokens ✓"). Whether that is correct depends on whether the scorer always emits every check it ran. I did not trace `packages/shared/src/score/arc.ts` far enough to confirm. Flagging it for the verifier, labelled as unverified.

## 3. Evidence

| Claim | Type | Source or method |
|---|---|---|
| Unscored tokens get the non-risky (blue, no-ack) buy button | fact | `components/riven/flash-buy.tsx` (`risky = token.fake \|\| token.band === "risk"`); `trade-sheet.tsx` line 66 (ack required only when `fake \|\| risk \|\| copies > 0`); `token-view.tsx` line 575 |
| FlashBuy appears on home cards and the market board | fact | grep: `home-sections.tsx` lines 107, 205; `market-board.tsx` line 46 |
| Unscored band is labelled "Scoring…" | fact | `lib/riven-format.ts` `BAND_META.unscored`; `lib/arc-data.ts` line 350 |
| ~88% of traded tokens are unscored | fact (derived) | dossier F3: 1 − 238/2,074 = 88.5% |
| Perps H1 is "Trade perps with Arc USDC", with a "Trade live on Hyperliquid ↗" button in the hero | fact | `components/perps/perps-client.tsx` lines 80, 97 |
| Default leverage is 10x (capped at the market max) | fact | `perp-trade-panel.tsx` lines 31–32; `signal-order-modal.tsx` line 29 |
| Paper disclosure exists in several places | fact | `perps-client.tsx` LINES; `perp-trade-panel.tsx` lines 97, 457–458; `perps-panel.tsx` line 782; `arc-usdc-margin.tsx` line 66 |
| Mascot model is 2.9 MB; Draco decoder 0.75 MB | fact | `ls -la public/mascot/riven.glb` = 2,903,024 bytes; `du -sh public/draco` = 756K |
| three.js runtime size in the shipped bundle | not measured | I tried to find the chunk in `.next/static/chunks` by grepping for `WebGLRenderer` and found nothing. That does not mean it is absent: chunks may be minified or named differently |
| Mascot is first on mobile home and lazy/client-only | fact | `app/page.tsx` ~line 158 (`order-first h-[300px]`); `components/mascot/mascot.tsx` (`dynamic`, `ssr:false`) |
| Companion mascot shows on every page unless the user hides it | fact | `riven-shell.tsx` line 107; `companion.tsx` (hidden only if localStorage key = "1") |
| Portfolio warns never to share a seed phrase; I found no seed-phrase request | fact (search) | grep for "seed phrase\|private key\|recovery phrase" in `components app lib` found only `portfolio-client.tsx` lines 108–109 (a warning). I searched only frontend source, not wallet-connector libraries |
| ~4 MB of extra download is a real wait on a mid-range phone with patchy data | estimate | 3.66 MB measured assets ÷ a 1–5 Mbps effective mobile link ≈ 6–30 s; link speed is an assumption |
| Newcomers read headlines and buttons, not paragraphs | assumption | common UX observation; no Riven user data exists (dossier §6) |

## 4. Risks from this seat

- **Do nothing more:** no link, so no harm and no benefit to me. The buttons above stay as they are for whenever it does go live.
- **Ship-first without the safety pass (quiet failure):** a newcomer taps "⚡ 10 USDC" on an unscored token that turns out to be a rug. Riven never said it was safe, but it put the friendliest button on it and the warning on the tokens it *had* checked. Nobody would notice this until someone loses money, and nothing would show up in logs. This is the failure I care most about.
- **Perps as labelled:** someone reads "Trade perps with Arc USDC", taps "Trade live on Hyperliquid ↗", and opens real 10x positions somewhere Riven has no control. The harm happens off-site, so Riven would not see it either.
- **Data-depth:** raises coverage, which shrinks the unscored pool but does not close it. At 11.5% coverage today, even tripling it leaves most traded tokens unscored. It also adds a new risk: a "Looks healthy" verdict that has never been checked against labelled outcomes (dossier §6, no confusion matrix). A wrong green is worse for me than "Not checked yet".
- **Feature-breadth:** more surfaces, more jargon (Boosted, Profile, funding, TP1–3), and a heavier phone page.

## 5. The cheapest decisive step

**Step (about 15 minutes, local):** open the local app in a mobile viewport. Pick one token from the home "trending" cards whose badge reads "Scoring…", tap the ⚡ button, and see whether the trade sheet asks for any acknowledgement before "Review buy". In the same session, open `/perps` at 375px width and note which three things are visible without scrolling.

**Result decided now that would change my position:** if the trade sheet does show a clear "Riven hasn't checked this token yet" warning for unscored tokens (for example through a code path I missed), *and* the first `/perps` screen at 375px shows "paper" or "practice" above the fold, I drop the pre-deploy safety pass to a post-deploy nice-to-have and support plain Ship-first. If either is missing, my condition below stands.

## 6. Conditions and red lines

- **Support Ship-first if** the shipped build: (a) treats unscored tokens like risky ones in the buy flow, with an amber button and an "I understand Riven hasn't checked this yet" tick, and preferably relabels "Scoring…" as "Not checked yet"; (b) titles the perps page with "practice"/"paper" first, defaults leverage to no more than 2x, and moves the real-exchange link below the disclosure; (c) on phones, does not make the 3D model the first thing to load on the home screen.
- **Red lines:** anything asking for a seed phrase or private key (none found in frontend source); any wording or default that nudges a newcomer toward real leverage; a green "Looks healthy" shown more prominently than its "not financial advice / not validated" caveat.
- **Will not accept:** spending the remaining days on voice, filters or perps execution while the unscored-buy gap is open.

## 7. One line

Deploy, but first stop making the tokens Riven has *not* checked look safer to buy than the ones it has, and stop the perps page from opening with "trade" and 10x.

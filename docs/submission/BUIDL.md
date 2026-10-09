# Arc Microgrants submission: draft copy

Fill the `[brackets]` after deploying. Do not publish numbers that the live site does not show.

## One-liner

Riven checks every token launched on Arc and shows what the pool really holds in USDC, so you can tell a live market from an empty one before you buy.

## The problem

On Arc, most new tokens are seeded with the token alone. Price feeds still show a "liquidity" figure, because the pool's own token is valued at its own price. A typical flagged pool shows about $2.5k of liquidity while holding under $2 of USDC, with tens of thousands of dollars of volume passing through it. Nothing a seller can exit into is there.

## What Riven does

- **Reads the chain, not a feed.** Pool USDC comes from the Uniswap v4 `StateView` (liquidity × price). Contract powers, LP ownership, holder concentration, snipers and creator history all come from Arc itself, and each is checkable on the explorer.
- **One score, built from five checks.** Contract, liquidity, holders, creator, activity, published as 1–10 with a verdict word and every flag in plain English. Hard caps stop a token looking healthy while someone can still take the money.
- **Unscored beats wrong.** A token gets no number until its contract, liquidity and holders are all read. The page shows exactly which of the three is still pending.
- **Evidence, never accusation.** Flags say "liquidity pulled" or "creator sold out", with the on-chain reason.
- **Exit check.** Shows the best-case proceeds of selling $100, $1k or your own size into the real USDC in the pool.
- **Rug radar and alerts.** Liquidity pulled, creator sold out, whale sells of 5% or more, score collapses.
- **Public track record.** `/accuracy` publishes how often tokens rated Risk, Caution or Healthy later saw liquidity pulled or a creator sell out, including when the sample is too small to conclude.
- **Open for others to use.** `GET /api/arc/tokens/<address>` returns the score and flags as JSON, and `/api/arc/badge/<address>` returns an embeddable SVG badge, so launchpads and wallets can show it next to their own listings.

## Why it is Arc-native

Arc pools are USDC-quoted, so "how much USDC is actually in the pool" is a single precise number. The same data on other chains needs price oracles. Gas is also paid in USDC, so a user's whole position on Arc is one unit.

## What is and is not included

- Non-custodial: Riven never holds keys or signs. [Buy/sell is off in this build / on and exact-amount approvals only: choose one.]
- Perps is a paper-trading terminal on Hyperliquid prices. Nothing is sent to an exchange.
- Not financial advice.

## Links

- Live: [URL]
- Repo (public): [URL]
- Demo video (90s): [URL]
- Explorer proof: [one token page URL with explorer links]

## Numbers (from the live site on [date])

- Tokens indexed: [n]
- Launched in the last 24h and checked: [n]
- Flagged with evidence: [n]
- Real USDC in trading pools vs what other feeds call liquidity: [$ vs $]
- Track record: [x]% of later pulls/dumps were already rated Caution or Risk ([n] tokens; small sample noted)

## Team and ongoing plans

[Who runs the indexer, what it costs per month, and what happens after the grant.]

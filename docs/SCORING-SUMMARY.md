# How the Riven rug score works

Every token gets a score from 0 to 100. Higher means safer. The score refreshes every 5 minutes.

## Step 1: Base score (0–100)

| Signal | Weight | What it measures | Full marks when |
|---|---|---|---|
| Holder concentration | 40 | Share of supply held by the top 10 wallets (pools, bonding curves and the incinerator excluded) | The top 10 hold very little |
| Liquidity | 25 | Pool SOL ÷ market cap | Ratio is 15% or more |

The two scores are weighted, then scaled to 0–100.

## Step 2: Burn bonus (up to +15)

If the deployer or treasury burned tokens on purpose, the token earns up to 15 bonus points. Full bonus comes at 10% of supply burned. No burn means no penalty, so a token with zero burns can still score 100.

## Step 3: Safety gate (multiplier)

We check three things on-chain:

- Mint authority is revoked.
- Freeze authority is revoked.
- Liquidity is locked or burned.

| Checks failed | Gate | Effect |
|---|---|---|
| 0 | ×1.0 | Score unchanged |
| 1 | ×0.5 | Score halved |
| 2 or more | Hard red | Score capped at 20 |

**Final score = gate × (base + burn bonus), max 100**

## Color bands

- 🟢 Green: 70 and above
- 🟡 Yellow: 50–69
- 🔴 Red: below 50

## Missing data

If we can't measure a signal yet, for example a brand-new token with no holder snapshot, we score on what we do have. The result is flagged `partial` with low confidence, and it is not scored as zero.

## Caveats

- All weights, thresholds and the burn bonus are starting guesses and haven't been validated against real launches. They need a backtest before we trust the bands.
- z500 is not part of the score. The ansem.io data sits behind a Cloudflare challenge, so we can't fetch it reliably.
- The code lives in `packages/shared/src/score/`, with tests you can run via `pnpm test` in `packages/shared`.

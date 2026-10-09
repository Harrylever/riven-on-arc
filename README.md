# Riven: every token on Arc, rug-checked

Riven indexes every token launched on **Arc mainnet** (Circle's L1, chain `5042`, with USDC as gas) and gives each one a **1–10 safety score** built from on-chain facts anyone can re-check:

- **Contract:** mint, upgrade and pause powers, and fees.
- **Liquidity:** who controls the launch LP, and the USDC actually in the pool.
- **Holders:** concentration, snipers, and creator-funded wallets.
- **Creator:** track record across every earlier launch.
- **Activity:** real sells, versus volume trading in circles.

Tokens caught faking it are flagged with the evidence, never just labelled.

Built for **Arc Microgrants (DoraHacks)**.

## What it does

| Surface | What you get |
|---|---|
| **Screener** (`/`) | Every Arc token with a USDC pool on Uniswap v4: trending, new, gainers, market cap, and more. **Listed / Caught / Everything** views. *Caught* shows each flagged token with the on-chain reason. |
| **Token page** | Score with a verdict word, five sub-scores, every red flag in plain English, the creator's past launches (ATH multiple, alive / dead / rugged), top holders, live trades, copycat-ticker warning, and links to check it all on the explorer. |
| **Rug radar** (`/alerts`) | Alerts when launch liquidity is pulled, a creator sells out, a whale sells 5%+ of supply, or a score collapses. Watchlisted tokens notify in the browser. |
| **Ask Riven** (`/agent`) | Answers like "is $TICKER safe?" or "what rugged today?", grounded in Riven's own data and citing sources. Rule-based by default; uses Claude when `ANTHROPIC_API_KEY` is set. |
| **Portfolio** | Connect any injected wallet (Riven never sees keys) to see your Arc holdings scored. Optional non-custodial buy/sell through Uniswap v4: you sign every transaction, approvals are exact-amount and short-lived. |
| **Perps** (`/perps`) | Paper-trading terminal on Hyperliquid prices with a TradingView chart, sakz-bot signals, one-click TP1–3 / SL setup and price alerts. Paper money only. |

**What the data says (local index, Oct 2026):** most Arc launches are seeded with the token alone. A typical flagged pool shows about $2.5k of "liquidity" on DexScreener but holds **under $2 of USDC**, while tens of thousands of dollars of volume pass through it. Riven measures the USDC on-chain (`StateView` liquidity × price) and shows it.

## How the score works

Five sub-scores make up 100 points, which are published on a 1–10 scale:

| Sub-score | Points |
|---|---|
| Contract | 25 |
| Liquidity | 20 |
| Holders | 25 |
| Creator | 15 |
| Activity | 15 |

Hard caps stop a token looking healthy while someone can still take the money. "Healthy" also has to be earned: the token must be at least 6 hours old, with 25+ real holders, $1k+ USDC in the pool, and real sells.

The full methodology, including what changed in **arc-v5** after an audit found false positives, is at `/methodology` and in [`packages/shared/src/score/arc.ts`](packages/shared/src/score/arc.ts).

## Architecture

```
apps/
  frontend/   Next.js 16: UI and read APIs (/api/arc/*). Reads Postgres; builds unsigned swap txs.
  backend/    Bun + Hono worker: Arc indexers (Argus/Tolly factories, Uniswap v4 pools, swaps,
              transfers, LP events), DexScreener market sync, holder backfill, scoring, alerts.
packages/
  shared/     Prisma 7 schema and client, and the arc-v5 scorer (single source of truth).
docs/
  audit/      Review-council and LLM-council reports from the October audit.
  design-system.md
```

The data flow is Arc RPC → backend indexers → Postgres → scorer → `score_runs` and `alerts` → frontend. DexScreener is display-only: price, volume and market cap in the screener.

## Run it locally

```bash
bun install
cp apps/frontend/.env.example apps/frontend/.env.local   # set DATABASE_URL (UTF-8 Postgres!)
cp apps/backend/.env.example apps/backend/.env
DATABASE_URL=... bun run --filter @riven/shared db:migrate:deploy
bun run build:shared
bun run dev:backend    # CHAIN_MODE defaults to Arc
bun run dev:frontend
```

Create the database as **UTF-8**. Token names are arbitrary Unicode, and a WIN1252/LATIN1 database stalls the indexer on the first non-Latin name.

## Tests

```bash
bun run --filter @riven/shared test   # scorer, incl. arc-v5 regressions
bun run --filter backend test           # indexers, pool USDC, LP-removal, alerts, jobs
bun run --filter frontend test          # swap encoder, paper-perp accounting, screener params
```

## Feature flags (frontend)

| Variable | Default | Effect when `"false"` |
|---|---|---|
| `NEXT_PUBLIC_TRADING_ENABLED` | off | Set to `"true"` to enable Buy/Sell/Convert; when off, Riven is read-only and `/api/arc/trade` returns 404 |
| `NEXT_PUBLIC_PERPS_ENABLED` | on | `/perps` returns 404 and the nav link is hidden |
| `NEXT_PUBLIC_DISPUTE_URL` | (none) | Where "Dispute a score" links; defaults to `/methodology#disputes` |

## Guardrails

- Riven never holds keys or funds, and never signs or broadcasts. The wallet refuses any contract call other than the router, Permit2, or ERC-20 approve/transfer.
- The score is never sold: no paid boosts or badges. Flags use evidence wording ("liquidity pulled", "creator sold out"), never "scam".
- Unscored beats wrong: a token gets no number until its contract, liquidity and holders are all measured.
- Not financial advice. DYOR.

# Product & agent blueprint
Where this conflicts with AGENTS.md, AGENTS.md wins.

Riven is a Solana-only AI intelligence terminal. It explains tokens; it does not trade.
This document defines the product, frontend architecture, and agent implementation guidelines for the Product & Agent developer track on `apps/frontend`.

---

## 1. Scope & Ownership

- **Frontend scope:** All pages, client components, and UI-facing state in `apps/frontend`.
- **Read layer:** Next.js API routes (`apps/frontend/app/api/`) query PostgreSQL directly via `@riven/shared` (`getDb()`).
- **Data flow:**
  - Ingestion, market aggregation, scoring jobs, and KOL polling run in the persistent NestJS worker (`apps/backend`) and write to PostgreSQL.
  - The frontend NEVER talks directly to Helius RPC or external data providers; it reads database state created by the backend.
  - The AI Agent endpoint (`POST /api/agent/analyze`) is frontend-owned, pulling grounded data from database models and serving conversational analysis.
- **Boundaries:**
  - `apps/backend` is owned by the Chain & Data track. Do not edit files there.
  - `packages/shared` contains Prisma schema and the scoring formula. It is a shared contract; do not modify it without coordination.
  - `ExecutionLog` and `Trade` models in Prisma are backend-owned and frozen. Trade execution is strictly paused. No wallet custody, signing, or private keys.

---

## 2. Screens & UI Specifications

Design principles: **Mobile-first**, normie-friendly (plain English), single-column cards, thumb-reach navigation, and the AI agent chat as the primary entry point.

### A. Feed Screen (`/`)
- **Header:** App title, search bar (accepts Solana contract address / mint or ticker/name), and link to Watchlist.
- **Tabs:** "Trending" and "New Launches".
- **Token Card (Single-column):**
  - Token identity: Image avatar, name, symbol/ticker, and launchpad badge (`PUMPFUN`, `LAUNCHLAB`, `CLAWPUMP`).
  - Age / creation timestamp.
  - Market data: Market cap (or bonding curve progress), liquidity.
  - Score badge: 0–100 integer with colored badge (Green: $\ge 70$, Yellow: $50-69$, Red: $< 50$).
  - Plain-English verdict text (e.g. "Looks healthy", "Mixed signals", "High risk").

### B. Token Breakdown Page (`/token/[mint]`)
- **Score Header:**
  - Prominent 0–100 score display and verdict.
  - Summary cards for Strengths (✓) and Risks (⚠).
  - Authority gate indicators: Mint authority status, Freeze authority status, LP lock/burn verification.
- **Sub-score Breakdown:**
  - Concentration score ($C$, 0–10) and top-10 holder percentage.
  - Attributed burn score ($B_{\text{attr}}$, 0–10) and deployer burn count.
  - Liquidity score ($L$, 0–10).
- **Tabs / Sections:**
  1. **Overview / Chart:** Embedded lightweight chart (external embed, not custom-built).
  2. **Holders:** Top-10 holder concentration table, whale accumulation or exit indicators.
  3. **KOL Activity:** Display recent KOL trades with an **"as of" timestamp** (KOL data refreshes approximately every 30 minutes via backend sync). Sells are displayed as prominently as buys, accompanied by a mandatory "Not financial advice" disclaimer.
  4. **Bubblemaps:** Embedded iframe widget (Phase 9; utilizes demo mode or partner ID).
  5. **Recent Burns:** Deployer and treasury burn log table.
- **Action Buttons:**
  - "Ask the Agent" floating action button / sticky drawer.
  - External launchpad link (e.g., "Trade on pump.fun").
  - "Claim this token" placeholder (disabled/hidden until claiming phase).

### C. Watchlist Screen (`/watchlist`)
- Phase 3: Browser `localStorage`-backed watchlist (no authentication required).
- Phase 8: Migrated to PostgreSQL user account sync once Privy authentication is integrated.

### D. Ecosystem Screen (`/ecosystem`)
- ANSEM ecosystem dashboard highlighting ClawPump launches, ecosystem volume, and top-scored community tokens.

---

## 3. Active Scoring Formula & Math

The scoring formula is defined in [`packages/shared/src/score/formula.ts`](file:///c:/dev/riven/packages/shared/src/score/formula.ts) and is gated on rug-detection fundamentals:

$$\text{Score} = \text{gate}(\text{mint}, \text{freeze}, \text{lp}) \times (40 \cdot C + 35 \cdot B_{\text{attr}} + 25 \cdot L)$$

- **Maximum score:** **100** points.
- **Authority Gate (`gate`):**
  - **1.0**: Mint authority revoked AND freeze authority revoked AND LP locked/burned.
  - **0.5**: Exactly one of the three checks fails.
  - **0.0**: Two or more checks fail (hard red penalty; score capped at 20).
- **Component Inputs:**
  - $C$ (Concentration, 0–10): Derived from top-10 holder percentage ($1 - \text{top10\_pct}$).
  - $B_{\text{attr}}$ (Attributed Burns, 0–10): Derived strictly from deployer and treasury burns (not aggregate fake dust burns).
  - $L$ (Liquidity, 0–10): Derived from liquidity-to-market-cap ratio.
- **Note on z500:** **z500 was removed entirely** in Phase 6. The external endpoint at `ansem.io/api/coins` was protected by Cloudflare JS challenge blocking automated server-side fetching. Its points were folded back into $C$, $B_{\text{attr}}$, and $L$ (40 / 35 / 25). It is not part of the formula, database schema, or any screen/agent response.

---

## 4. API Surface & Exact Response Shapes

Frontend route handlers in `apps/frontend/app/api/` read directly from `@riven/shared`.

### A. `GET /api/leaderboard`
Returns the top 100 tokens sorted by each token's most recent score in descending order.

**Route File:** [`apps/frontend/app/api/leaderboard/route.ts`](file:///c:/dev/riven/apps/frontend/app/api/leaderboard/route.ts)

**Exact Response JSON:**
```json
{
  "tokens": [
    {
      "tokenId": "uuid-string",
      "mint": "SolanaMintAddress111111111111111111111111",
      "name": "Token Name",
      "symbol": "TICKER",
      "score": 78,
      "calculatedAt": "2026-09-20T12:00:00.000Z"
    }
  ]
}
```

### B. `GET /api/token/[mint]`
Fetches full breakdown for a single token: token info, latest score, authority/LP status, and recent burns. If not found in the DB, falls back to on-demand RPC resolution via Helius (`resolveTokenByMint`).

**Route File:** [`apps/frontend/app/api/token/[mint]/route.ts`](file:///c:/dev/riven/apps/frontend/app/api/token/%5Bmint%5D/route.ts)

**Exact Response JSON:**
```json
{
  "token": {
    "id": "uuid-string",
    "mint": "SolanaMintAddress111111111111111111111111",
    "name": "Token Name",
    "symbol": "TICKER",
    "decimals": 6,
    "imageUri": "https://example.com/token.png",
    "metadataUri": "https://example.com/meta.json",
    "launchpad": "PUMPFUN",
    "discoveredVia": "WEBHOOK",
    "firstSeenAt": "2026-09-20T12:00:00.000Z"
  },
  "score": {
    "id": "uuid-string",
    "tokenId": "uuid-string",
    "score": 78,
    "gateMultiplier": "1.0",
    "concentrationScore": "8.5",
    "burnScore": "7.0",
    "liquidityScore": "8.0",
    "verdict": "LOOKS_HEALTHY",
    "calculatedAt": "2026-09-20T12:00:00.000Z"
  },
  "authorityCheck": {
    "id": "uuid-string",
    "tokenId": "uuid-string",
    "mintAuthorityRevoked": true,
    "freezeAuthorityRevoked": true,
    "lpLockedOrBurned": true,
    "passCount": 3,
    "checkedAt": "2026-09-20T12:00:00.000Z"
  },
  "recentBurns": [
    {
      "id": "uuid-string",
      "tokenId": "uuid-string",
      "signature": "tx-sig-string",
      "burnerWallet": "deployer-wallet-address",
      "amount": "1000000000",
      "isDeployerOrTreasury": true,
      "burnedAt": "2026-09-20T12:00:00.000Z"
    }
  ]
}
```
*Note on fields removed:* `z500Rank` was removed from the response when the model was deleted in Phase 6.

### C. `POST /api/agent/analyze`
Currently a `501 Not Implemented` stub in `apps/frontend/app/api/agent/analyze/route.ts`.
This route is built in Product Phase 2 to accept `{ mint: string, question?: string }` and return structured analysis grounded on `TokenFacts`.

---

## 5. Prisma Data Model Reference (`packages/shared/prisma/schema.prisma`)

Entities and relational keys:

- `Token`: Key `id` (UUID). Unique `mint`. Attributes: `name`, `symbol`, `decimals`, `imageUri`, `metadataUri`, `launchpad`, `discoveredVia`, `firstSeenAt`.
- `TokenAuthorityCheck`: Foreign key `tokenId -> Token.id`. Fields: `mintAuthorityRevoked`, `freezeAuthorityRevoked`, `lpLockedOrBurned`, `passCount`, `checkedAt`.
- `ScoreRun`: Foreign key `tokenId -> Token.id`. Fields: `score`, `gateMultiplier`, `concentrationScore`, `burnScore`, `liquidityScore`, `verdict`, `calculatedAt`.
- `HolderSnapshot`: Foreign key `tokenId -> Token.id`. Fields: `top10Pct`, `holderCount` (nullable), `topHolders` (JSON), `snapshotAt`.
- `Burn`: Foreign key `tokenId -> Token.id`. Fields: `signature`, `burnerWallet`, `amount`, `isDeployerOrTreasury`, `burnedAt`.
- `Pool`: Foreign key `tokenId -> Token.id`. Fields: `address` (unique), `venue`, `quoteMint`.
- `PairSnapshot`: Foreign key `poolId -> Pool.id`. Fields: `priceSol`, `liquidityRatio`, `volumeSol`, `snapshotAt`. (`priceUsd`, `marketCapUsd`, `liquidityUsd` nullable).
- `KolTrade`: Foreign key `tokenId -> Token.id`. Fields: `kolWallet`, `kolName`, `side`, `amountSol`, `signature`, `tradedAt`, `source`. Refreshed approximately every 30 minutes.
- `Watchlist` & `Alert`: User notification and watchlist models.
- `Trade` & `ExecutionLog`: **Frozen backend models.** Do not touch.

---

## 6. AI Agent Design Rules

The AI Agent is the core differentiator and moat of Riven. When building `POST /api/agent/analyze`:

1. **Non-Negotiable Behavioral Guardrails:**
   - Never provide specific buy or sell recommendations.
   - Always conclude responses with: `"Not financial advice. DYOR."`
   - Cite data sources, score component values, and snapshot timestamps. Never assert an ungrounded metric.
   - Acknowledge when data is insufficient or missing rather than hallucinating or guessing.
   - Maintain a concise, plain-English tone (under ~200 words, with bullet points for risk factors).
2. **Grounded Fact Assembly:**
   - Ground the model using the exact data returned by `GET /api/token/[mint]`, plus recent `PairSnapshot` and `KolTrade` records.
   - Pass a structured `TokenFacts` JSON to the prompt.
3. **Model Decoupling:**
   - Wrap the LLM call in a single modular provider function (e.g. `explainToken(facts, question)`) to allow swapping between Anthropic Claude, OpenAI, or local/Hermes models without touching UI components.

---

## 7. Known Disagreements & Documentation Alignments

To ensure consistency across the codebase, note the following documented differences:
- **Phase Numbering:**
  - `AGENTS.md` and `docs/PHASE-STATUS.md` use an 8-phase chain-and-data sequence: Phase 1 (Launch detection), Phase 2 (Market data), Phase 3 (Rug signals), Phase 4 (Scoring pipeline), Phase 5 (KOL ingestion), Phase 6 (z500 rank - scrapped), Phase 7 (Monitoring alerts), Phase 8 (Hardening).
  - Earlier conversational drafts and backend prompts described a 7-phase sequence where KOL tracking was labeled "Phase 6" and trade execution was labeled "Phase 7".
  - *Resolution:* The authoritative tracking document is `docs/PHASE-STATUS.md`. Product & Agent phases are numbered 1 through 9 in `docs/PRODUCT-AGENT-PHASES.md` and `docs/PRODUCT-STATUS.md`.
- **Database Keys:**
  - Earlier design proposals referenced `tokenMint` foreign keys. The live database schema strictly uses `tokenId` (referencing `Token.id`).

# Riven
### AI-Native Solana Intelligence Terminal
### DexScreener + RugCheck + Birdeye + Autonomous Agents (Solana only)

---

## Vision

Most crypto tools show users data.

DexScreener shows charts.

Birdeye shows transactions.

RugCheck shows risks.

Bubblemaps shows wallet relationships.

Users still have to interpret everything themselves.

We build:

> The first AI-native market terminal for Solana.

An autonomous agent that:

- Watches tokens
- Explains market movements
- Detects risks
- Finds opportunities
- Monitors wallets
- Tracks launchpads
- Generates reports
- Sends intelligent alerts

Users do not merely browse charts.

Users assign tasks to agents.

---

# Scope & Decisions

- Solana only. No multi-chain.
- Independent of DexScreener. No dependency on its API, and Riven is not a reseller of its data.
- Data source: Helius (RPC and webhooks). Market data is derived in-house from onchain events.
- Launchpad-first: pump.fun, Raydium LaunchLab, ClawPump and other launchpads.
- Free first. No payments at launch. The moat is transparency, trust and AI-powered insight on every token.
- Paid features (claim and enhance a token, boosts, ads) are a future phase. See Monetization (Later).
- Hackathon hook: keep one small $ANSEM-gated premium feature (agent monitoring) so there is a net-new $ANSEM use case to demo. This is a premium unlock, not a listing fee.

## Current Build Scope (Week 1)

- Detection: Helius webhooks catch new launches on pump.fun, LaunchLab and ClawPump, stored in Riven's own database.
- Market data: price, market cap and liquidity derived from bonding-curve or pool reserves plus swap events. Cover pump.fun and PumpSwap first.
- Token page: price, market cap, liquidity, holders with top-10 concentration, txns, KOL activity, Bubblemaps embed, and a 0-100 score with a plain-English AI explanation.
- Feed: new launches, each with a score.
- Not now: claim and enhance, boosts, ads, long-tail DEXs, multi-chain.

---

# Design Principles

- Mobile-first, then desktop. Most users will open this on a phone.
- Normie-friendly: plain English everywhere, no unexplained jargon.
- One big score and one plain-English verdict per token (for example "Looks healthy" or "Risky").
- Single-column cards and thumb-reach navigation instead of dense tables.
- The agent chat is the main entry point, not a hidden widget.
- Agents gather intelligence, humans make the decisions.

---

# Core Product

The product has three layers:

## Layer 1: Market Terminal

A complete Solana token screener.

Features:

- New token discovery
- Trending tokens
- Gainers / losers
- New pairs
- Volume leaderboard
- Liquidity leaderboard
- Market cap ranking
- Holder statistics
- Whale activity
- Buy/sell tracking
- DEX tracking
- Pool tracking
- Token age
- Launchpad origin
- Watchlists
- Advanced filtering

Like DexScreener, but focused on intelligence.

---

## Layer 2: Scoring Engine

Every token receives a score.

Score range:

0 → 100

Metrics:

### Holder Distribution

- Top 10 concentration
- Whale accumulation
- Whale exits

### Liquidity Health

- Liquidity / market cap ratio
- Liquidity changes

### Burn Metrics

- Founder burns
- Treasury burns

### Market Activity

- Volume growth
- New holders
- Buy/sell pressure

### Founder Reputation

- z500 holdings
- Historical launches
- Wallet behaviour

Output:

```text
Score: 78/100

Strengths:
✓ Healthy liquidity
✓ Growing holders
✓ Low concentration

Risks:
⚠ Moderate whale ownership
```

---

## Layer 3: AI Agent

This is our moat.

Users can ask:

> Why is this token pumping?

> Why did score drop?

> Is liquidity healthy?

> Compare this token to another.

> Find me low-risk launches.

The AI explains market activity in plain English.

Example:

> Token volume increased 240%.
>
> Liquidity increased by 18%.
>
> Holder count increased by 12%.
>
> Top wallets have not exited.
>
> This move appears broad-based rather than whale-driven.

---

# Token Listing & Display

Tokens are indexed automatically. Nobody has to apply to be listed.

Two tiers:

- Indexed (free): every token detected at creation on a supported launchpad appears with basic data (onchain name, ticker and image, price, market cap, liquidity, holders, txns).
- Enhanced (paid, later): a verified owner adds profile info and can buy boosts. See Monetization (Later).

Rules:

- Detection happens at launch through Helius webhooks on launchpad programs.
- Any token can be opened by contract address search. Tokens that were not detected at launch are resolved on demand.
- An unclaimed token shows the basic page, a "Trade on pump.fun" (or the relevant launchpad) link, and a "Claim this token" button once claiming exists.
- Quality filters (minimum liquidity, holders, age, freeze authority and similar) control who appears in Trending and New Pairs. They never control whether a token exists.
- ClawPump is a launchpad. Tokens launched there get a "Launched on ClawPump" badge and appear in the ecosystem dashboard.

---

# Token Page

Tabs and sections (DexScreener parity, Solana only):

- Chart (embedded, not rebuilt)
- Txns
- Holders and top-10 concentration
- Bubblemaps (embedded)
- KOL activity
- Top traders
- Score and AI explanation
- Token info (onchain data by default, owner-supplied once claiming exists)

Lists: Trending, New Pairs, Gainers / Losers, Volume, Liquidity, with filters and watchlists.

---

# Autonomous Agent Mode

Users can assign tasks.

Example:

> Watch this token.

Agent:

- Tracks liquidity
- Tracks holders
- Tracks burns
- Tracks whales
- Tracks volume

When something changes:

```text
AGENT ALERT

Token: ABC

Changes:

• Liquidity -12%
• Whale ownership +8%
• Volume +300%

Summary:

Price is rising but concentration is increasing.
Exercise caution.
```

---

# Natural Language Search

Users search naturally.

Examples:

> Find tokens under 5M market cap.

> Show tokens with healthy liquidity.

> Find launches with growing holders.

> Show tokens with low concentration.

AI translates natural language into filters.

This is easier than traditional screeners.

---

# Wallet Intelligence

Users can monitor wallets.

Examples:

- Whale wallets
- Founder wallets
- Smart money
- KOL wallets (see KOL Intelligence)
- Ecosystem wallets

Agent can answer:

> What is this wallet buying?

> Which launches are founders entering?

> Which wallets are accumulating?

---

# KOL Intelligence

Track what Solana KOLs (key opinion leaders) are buying and selling.

Features:

- Live KOL feed: buys and sells, with size and market cap at the time
- KOL leaderboard: who actually makes money (today / 7d / 30d PnL, win rate)
- Per-token view: which KOLs bought or sold this token, and when
- Coordination alerts: several KOLs entering the same token
- KOL activity as one input to the token score

Plain-English examples:

> 3 KOLs bought this token in the last hour.
>
> 2 KOLs sold in the last 30 minutes.

Rules:

- Show sells as prominently as buys. A KOL buy is not a safety signal.
- Only labeled wallets are tracked. KOLs use side wallets, so this is a signal, not the full picture.
- Include a "not financial advice" note.

### Data Sources

Primary (team suggestion): MadeOnSol API

- 2,000+ tracked KOL wallets (Solana and Robinhood Chain)
- REST, WebSocket and webhooks, plus an MCP server for AI agents
- KOL PnL leaderboards, per-token breakdown, coordination detection
- Also has deployer profiles and alpha-wallet scoring, which could feed Founder Reputation in the scoring engine
- Free API key. KOL feed is delayed about 5 minutes on the free tier and sub-second on paid plans. Free tier is roughly 200 requests/day.

Fallback: Solana Tracker Data API

- KOL trades: /trades/kols and /trades/kols/{token}
- KOL PnL leaderboard: /v2/pnl/leaderboard/kols
- Wallet PnL and positions endpoints
- WebSocket room: transaction:kol
- Free tier: 2,500 requests/month

Notes:

- Stream over WebSocket and cache results instead of polling.
- Verify current free-tier limits and streaming access before building.
- MadeOnSol appears to be a single-operator service (per its site footer), so keep Solana Tracker wired in as a fallback.

---

# Ecosystem Intelligence

Dedicated ecosystem dashboard.

Tracks:

- ANSEM ecosystem
- ClawPump launches
- Ecosystem volume
- Builder activity
- Trending projects

Agent can answer:

> What is happening in ANSEM today?

> What launches are gaining traction?

> Which projects are attracting whales?

---

# Agent Feed

Users receive daily reports.

Example:

```text
Market Summary

24h:

• 35 launches
• 4 strong tokens
• 8 risky tokens
• Whale activity increased 14%
• Liquidity up 22%

Top Opportunities:
ABC
XYZ

Highest Risks:
DEF
GHI
```

---

# AI-Generated Research Reports

Every token automatically receives:

- Risk summary
- Holder analysis
- Liquidity analysis
- Founder analysis
- Burn analysis

No manual research required.

---

# Smart Alerts

Traditional:

Price > X

AI Alerts:

- Whale accumulation
- Liquidity drop
- Holder concentration
- Founder exit
- Unusual volume

This is much more useful.

---

# Token Utility

Native token utility:

### Free

- Screener
- Charts
- Basic AI

### Premium

- Unlimited AI
- Agent monitoring
- Wallet tracking
- API
- Smart alerts
- Portfolio intelligence

Token unlocks premium features.

Score itself is never sold.

Credibility is our moat.

Near-term $ANSEM hook: gate agent monitoring behind $ANSEM (hold or pay). Everything else stays free at launch.

---

# Monetization (Later)

Not at launch. The team agreed that nobody pays an unknown app, so trust and traffic come first. The design should leave room for these products:

- Token Info: profile picture, banner, name and ticker display, website and socials, description. Display only. It does not change onchain metadata.
- Boosts: paid points that give a badge and a temporary trending multiplier.
- Ads: banner slots, approved manually.
- Community takeover: later, because it needs dispute handling.

Requirements before any of this ships:

- Ownership verification. Only the deployer or authority wallet can edit a token, proven by a signed message.
- A moderation queue and a report button, so tokens cannot be impersonated.
- Payments as a plain onchain transfer ($ANSEM, SOL or USDC), verified onchain.

Go-to-market: hackathon teams tokenize in the same window and want attention, so a free Clawrena tracker page that scores every team's token is the first source of traffic.

---

# Accounts & Login

Proposed: Privy (authentication and embedded wallets).

Login options:

- Continue with Email
- Continue with Apple
- Continue with Google / X
- Connect Wallet (Sign in with Solana)

Requirement from the team: after an email or Google login, detect whether the user has a Padre.gg and/or a Fomo account, and if both exist let them choose which one to use for signing in.

Feasibility:

- Auto-detection is not possible. No public lookup was found for either app. Padre runs its own accounts on Turnkey-managed wallets, and each Privy app has its own separate user list. A lookup like this would also leak whether an email has a trading account.
- A real "Continue with Fomo / Padre" button would only work through a partnership where they issue standard JWT/OIDC tokens to third-party apps. Ask both teams. Do not count on it for the hackathon.

Proposed alternative (user-declared, read-only):

1. The user logs in with email, Google or a wallet.
2. A prompt asks "Where do you trade?" with Fomo, Padre or Other. The user pastes their public wallet address.
3. If they add more than one, they choose which is primary. It drives their portfolio view, alerts and KOL comparisons.
4. Never ask for private keys or seed phrases.

Notes:

- Privy supports email, social logins (Google, Apple, X and others) and Solana wallet sign-in, and can link several login methods to one user.
- Privy's custom auth provider feature is access-gated and has been described as an Enterprise feature in its docs.

---

# Technical Stack

### Frontend

- Next.js
- React
- Tailwind

### Backend

- PostgreSQL
- Redis

### Blockchain

- Helius (RPC, webhooks, streaming): primary data source
- Solana RPC

### Market Data

- Derived in-house from Helius events (bonding-curve and pool reserves, swap events). No DexScreener dependency.
- MadeOnSol (KOL data)
- Solana Tracker (KOL fallback, optional market-data fallback)
- Bubblemaps (embedded iframe; a real partner ID is needed for production)
- GeckoTerminal and Birdeye: optional fallbacks only, not primary

### AI

- ClawPump agent (Hermes-based)
- Claude
- OpenAI
- Local models

### Automation

- Trigger.dev

### Auth

- Privy (proposed)

### Hosting

- Vercel (frontend)
- Long-running worker for streaming ingestion (serverless functions cannot hold open streams). Webhooks can hit an API route.

---

# Competitive Positioning

DexScreener:
Shows charts.

Birdeye:
Shows data.

RugCheck:
Shows risks.

Our Product:

Shows:

- Data
- Risks
- Explanations
- Monitoring
- Autonomous intelligence

We do not build another screener.

We build:

> The AI Operating System for Solana markets.

---

# Future Vision

### Phase 1 — AI Screener

Core token discovery, charts, filters, scoring and AI explanations.

### Phase 2 — Autonomous Monitoring

Persistent token, wallet and market monitoring with intelligent alerts.

### Phase 3 — Wallet Intelligence

Wallet profiling, whale tracking and behavioural analysis.

### Phase 4 — Portfolio Agent

Users connect a portfolio and receive automated intelligence across their holdings.

### Phase 5 — Agent Marketplace

Users deploy specialized agents:

- Whale Agent
- Launch Agent
- Risk Agent
- Alpha Agent
- Ecosystem Agent

---

# Final Mission

Crypto users spend hours:

- Looking at charts
- Reading transactions
- Tracking wallets
- Researching tokens

Agents should do this work.

Humans make decisions.

Agents gather intelligence.

We become:

> The Bloomberg Terminal for Solana,
> powered by autonomous AI agents.

---

# Branding

Product name: Riven

X bio:

> AI terminal for Solana markets. Powered by @clawpumptech agents.

Say "powered by", not "built on". ClawPump is an agent platform, not a chain, and the product uses its agent rather than building on it.

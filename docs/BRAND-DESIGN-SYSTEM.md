# Clawdex — Brand & Design System Brief

## Name

**Clawdex**

## Blurb

**Short (one-liner):**
> The AI-native intelligence terminal for Solana markets.

**X/social bio length:**
> AI terminal for Solana markets. Powered by @clawpumptech agents.

**One paragraph:**
> Clawdex watches every pump.fun / ClawPump / LaunchLab launch on Solana in real time, scores each token 0–100 on signals that can't be bought or faked (mint/freeze authority, LP lock, burn history, holder concentration), and explains what's happening in plain English through an AI agent — so a normie trader gets the same read a chain analyst would, without reading a contract.

## Notes (context that should shape the design)

- **Audience:** retail Solana degens on pump.fun/ansem.io/ClawPump, plus hackathon judges (VCs, platform reps) seeing it cold. Design has to read as trustworthy in 10 seconds to both.
- **Mobile-first, plain-English, normie-friendly** — this is a stated product principle, not a nice-to-have. One big score + one plain-language verdict ("Looks healthy" / "Risky") per token, not a wall of stats.
- **Almost zero friction, end to end.** No forced signup to see a score. No multi-step flows where one screen will do. Paste-a-mint-address (or land on a launch) → score visible in one glance, no scrolling past chrome to find it. Every extra tap, field, or loading state is a design defect to justify, not a default. This governs component design directly: default states should need no configuration, the agent chat should accept a bare mint address or token name with no formatting requirements, and any settings/preferences should have a sane default that never blocks first use.
- **Agent chat is a primary surface**, not a bolted-on widget — it should feel like a core part of the product's visual language, not a chatbot afterthought.
- **Free first, no paywall at launch** — the visual tone should support "we have nothing to sell you," not "upgrade to see the real score."
- **Terminal / data-density aesthetic fits**, but avoid the generic AI-cliché version of it (see Avoid list below). A trading terminal audience expects dark mode and tabular numerics — lean into that authentically (real monospace for prices/scores), not decoratively.
- **The score bands (healthy / caution / risk) are core product UI**, not decoration — the color system should be built around that semantic trio first, with a separate brand accent that doesn't collide with it.

### Explicitly avoid (generic "AI-generated design" tells)
- Warm cream + terracotta + serif combo
- Near-black + a single neon-green or vermilion accent (the laziest "terminal" look)
- Purple-to-blue gradient hero sections
- Defaulting to Inter or Space Grotesk "because it's safe"
- Everything centered; `rounded-lg` on every single element with no hierarchy

## Project moat

- **The score is never sold.** No paid boosts, no "verified" badges for cash — credibility is the entire product. This is the single sentence that should anchor any tagline work.
- **Signals are on-chain and hard to fake** — mint/freeze authority state, LP lock, attributed burns, holder concentration — not a curated "trust us" list a team can quietly adjust.
- **The agent explains *why*, not just *what*.** DexScreener/Birdeye/RugCheck/Bubblemaps show you data; Clawdex is the one that tells you what it means, in one sentence.
- **Ecosystem-native**, not a bolted-on external tool — built directly against pump.fun/ClawPump/LaunchLab launch flow and Solana KOL activity, not a generic multi-chain scanner.

## Color system

Built around a dark, cool-graphite terminal base (not pure black — pure black + neon accent is the cliché to avoid) with **one brand accent kept deliberately separate from the three semantic score colors**, since the score bands are core UI and need to read unambiguously as status, not brand.

| Token | Hex | Role |
|---|---|---|
| `ground` | `#0A0E14` | App background — deep graphite-navy, not pure black |
| `surface` | `#141A24` | Cards, panels |
| `surface-raised` | `#1B2330` | Modals, popovers, elevated elements |
| `border` | `#232B38` | Dividers, card borders |
| `text-primary` | `#E8ECF2` | Primary text |
| `text-muted` | `#8B95A8` | Secondary/meta text |
| `brand` | `#2FB8C4` | Brand accent — links, primary CTAs, agent-chat surfaces, the "Clawdex" identity color (a considered teal, not neon-green, not a purple/blue gradient; reads as "scanner/radar," fitting a screener) |
| `brand-dim` | `#1E8A94` | Hover/pressed state of brand accent |
| `score-healthy` | `#3FBF7F` | Score ≥ 70 — muted green, not neon |
| `score-caution` | `#F2B84B` | Score 50–69 — warm amber |
| `score-risk` | `#EF4444` | Score < 50 |

Rule of thumb: **brand teal never appears on a score chip or badge** — that space is reserved entirely for the healthy/caution/risk trio, so a glance at any card tells you status without reading text.

## Typography

A cohesive Plex-family pairing (body + numerics) plus a distinct display face for headlines/big score numbers, deliberately skipping Inter/Space Grotesk as the reflexive default.

| Role | Font | Notes |
|---|---|---|
| Display / headlines | **Archivo** (700/800) | Confident, slightly technical, has a black/expanded weight good for hero score numbers |
| Body / UI | **IBM Plex Sans** (400/500) | Highly legible at small sizes, pairs naturally with Plex Mono |
| Numeric / data / scores | **IBM Plex Mono** (500/600, tabular figures) | Authentic terminal feel for prices, %, holder counts — real trading terminals set numerics in monospace so digits align in a column |

All three are on Google Fonts.

## Spacing & shape

- **Spacing scale (4px base):** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
- **Radius — used sparingly, not everywhere:**
  - `radius-sm` `4px` — data rows, table cells (terminals aren't heavily rounded)
  - `radius-md` `6px` — cards, panels
  - `radius-lg` `10px` — primary CTAs, the agent chat surface only
- **Shadows:** minimal — a dark UI on a graphite base should separate elevation mostly through `surface` → `surface-raised` color steps, not heavy drop shadows.

## Components to design first

1. Token card (score badge + verdict line + key stat row) — the single most-repeated element
2. Score badge (0–100, colored by the healthy/caution/risk trio)
3. Agent chat panel (primary surface, brand-teal accented)
4. Alert row (type icon + plain-English message + timestamp)
5. Watchlist row / table (monospace numerics, tabular alignment)

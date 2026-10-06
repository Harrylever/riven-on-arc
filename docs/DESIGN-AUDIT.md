# ClawDex Frontend — Design Audit

**Step 1 output only — no code changes made as part of this audit.** Screenshots live in
`docs/design-audit/screenshots/` (20 images: 9 routes + `/token/[mint]`, each at 1440px and
390px, Chromium, `USE_MOCK_DATA=true` for consistent data). Method: read `AGENTS.md`,
`docs/SPEC.md`, `app/globals.css`; mapped every route and shared component; grepped the whole
`apps/frontend` tree for hardcoded colors, token-name usage, and loading/error/empty-state
coverage; visually inspected every screenshot.

---

## 1. Route map

| Route | Purpose | Styling system used | Loading state | Error state | Empty state |
| --- | --- | --- | --- | --- | --- |
| `/` | Marketing landing + live feed hero (built earlier this project) | `components/ds` | app-wide `loading.tsx` only (mismatched, see §3.4) | app-wide `error.tsx` only | — |
| `/landing` | Second, separate animated landing page (`AnimatedLanding.tsx`) | raw inline styles | app-wide fallback | app-wide fallback | — |
| `/terminal` | Master-detail token list + detail pane, KOL Intel, Signals, Watchlist tab | `components/ds` (list) + raw inline styles (`TokenPanels`, `TokenFootTabs`, `TradeWidget`, `InstantBuyModal`, `SingleLineChart`, `KolFloatingBubble`) | app-wide fallback (list has none; detail pane shows literal text `"Loading token..."`) | app-wide fallback | — |
| `/token/[mint]` | Standalone token detail page — **a second, independent implementation of "show a token" alongside `/terminal`'s detail pane** | `components/ui` (shadcn `Button`, `Tooltip`) | own `loading.tsx` ✅ | own `error.tsx` ✅ | own `not-found.tsx` ✅ |
| `/search` | Contract-address / keyword search | `components/ui` (shadcn `Button`) | app-wide fallback | app-wide fallback | — |
| `/watchlist` | `localStorage` watchlist | `components/ds` | app-wide fallback | app-wide fallback | ✅ good copy, see §5 |
| `/kol` | MadeOnSol KOL feed | raw inline styles | app-wide fallback | app-wide fallback | ✅ good copy, see §5 |
| `/ecosystem` | ClawPump ecosystem dashboard | `components/ui` (shadcn `Button`) | app-wide fallback | app-wide fallback | — |
| `/agent` | Agent chat | `components/ui` (shadcn `Button`) | app-wide fallback | app-wide fallback | — |
| `/login` | Privy sign-in modal | raw inline styles | app-wide fallback | app-wide fallback | — |

**Shared parts:** `components/ds/*` (15 files — the design system I built), `components/ui/*` (37
shadcn primitives), `components/shell/nav-shell.tsx` (global top bar + `⌘K` + bottom mobile tab
bar), `components/shell/mock-banner.tsx`, `components/landing/*`, `components/auth/*`,
`components/token/*` (6 large, mostly hand-rolled components powering `/terminal`'s detail pane
and `/token/[mint]`).

**Finding — three routes use none of the three styling systems at all** (`/landing`, `/kol`,
`/login`, plus most of `/terminal`'s detail pane): they're hand-rolled Tailwind + inline
`style={{}}` with hardcoded hex colors. See §2.

---

## 2. The core problem: three parallel styling systems, not one

This is the highest-priority finding and the reason almost everything else in this doc exists.
Grepped the whole `apps/frontend` tree for actual usage (not just presence):

| System | Where | Scale |
| --- | --- | --- |
| `components/ds/*` (mine) | `/`, `/terminal` list, `/watchlist` | 15 components |
| `components/ui/*` (shadcn) | `/token/[mint]`, `/search`, `/ecosystem`, `/agent` | 37 components |
| Raw inline styles + hardcoded hex | `/landing`, `/kol`, `/login`, `/terminal` detail pane (`TokenPanels.tsx`, `TokenFootTabs.tsx`, `TradeWidget.tsx`, `InstantBuyModal.tsx`, `SingleLineChart.tsx`, `KolFloatingBubble.tsx` — 1,713 lines) | ~6 large files |

`components/ds/Card.tsx`/`Button.tsx`/`Input.tsx` and `components/ui/card.tsx`/`button.tsx`/`input.tsx`
are **direct name collisions** with different implementations (inline-style + `useState` hover
tracking vs. Tailwind `cva` variants) — a component author has to already know which system a
page uses before reaching for "Button."

**Same problem at the token layer.** `app/globals.css` has two parallel naming systems live at
once, not a clean deprecation:

| Legacy alias | Uses | Current token | Uses |
| --- | --- | --- | --- |
| `--line` / `--line2` | 63 | `--border` / `--border-strong` | 95 |
| `--txt` | 60 | `--text-primary` | 26 |
| `--panel` / `--panel2` | 21 | `--surface` / `--surface-*` | 81 |
| `--sol2` | 25 | `--brand` | 94 |

The legacy names are commented in `globals.css` as "new code should use the tokens above
directly" — but that's not what happened; both are in near-equal heavy use across the codebase.

**Recommendation for Step 2:** pick one system. Given `components/ds` already implements every
primitive the product needs (`Card`, `Button`, `Badge`, `Input`, `IconButton`, `Tag`, plus the
product-specific `ScoreBadge`/`VerdictLine`/`SignalRow`/`TokenCard`/`AgentChat`), the lowest-risk
path is: make `components/ds` the only system, delete the `--line`/`--txt`/`--panel`/`--sol*`
aliases (forcing every remaining call site to migrate, which also surfaces the raw-hex files),
and either delete unused `components/ui/*` files or restyle the ones still needed (`Tooltip`,
`Dialog`, `Table`, form controls) to read the same CSS custom properties instead of shadcn's
defaults, per the user's brief.

---

## 3. Other consistency findings

### 3.1 Two disconnected "is this token safe" UIs (high severity)
`/token/[mint]` shows the *real* scoring formula broken down honestly: a 7.4/10 `ScoreBadge`,
"Looks healthy ✓", a "RUG SECURITY GATE MULTIPLIER" (mint/freeze/LP, matching `gate()` in
`packages/shared/src/score/formula.ts`), and three sub-score progress bars labeled **Holder
Distribution, Attributed Burns, Liquidity Health** — the exact three formula components.

`/terminal`'s detail pane (`app/terminal/page.tsx`) shows a completely different, unrelated
widget for the *same token*: "DEVELOPER & TOKEN RISK AUDIT RATING — 94/100, GRADE A+ · LOW RISK"
with PASS/FAIL sub-checks ("Developer Track Record PASS (24/30)", "Fresh Sniper Wallets PASS
(15/15)", "Liquidity Ratio PASS (10/10)") that don't map to the documented formula at all, backed
by `app/api/deployer/[wallet]/route.ts`.

A user who visits both pages for the same token sees two numbers, two grading systems, and no
indication they're related. This isn't a "which color" inconsistency — it's the product's central
trust claim told two different ways. **Recommend resolving the product question (are these the
same signal, complementary, or should one be retired) before restyling either — a Step 3 task,
not Step 2.**

### 3.2 Off-brand colors on the two most important trade-adjacent surfaces (high severity)
- `components/token/InstantBuyModal.tsx:102,229` — the primary "Deposit to buy" CTA (the single
  most important button in the whole trade flow) is a blue/indigo gradient
  (`#3b5bfd`→`#4d6dfd`→`#5b73ff`) that appears nowhere in the token system. Every other primary
  CTA in the app is solid `--brand` teal.
- `components/token/SingleLineChart.tsx` — the price chart line/fill uses `#00ffa3` (11
  occurrences), a bright neon green that is neither `--score-healthy` (`#3fbf7f`) nor `--brand`
  (`#2fb8c4`). It reads as very close to `--mint-400` (`#2fe6a6`), which `globals.css` explicitly
  documents as **"logo/illustration only, never UI chrome"** — a live price chart is about as
  much UI chrome as it gets.
- `components/ds/Button.tsx:33-34` — `danger` variant hardcodes `#D93A3A`/`#1A0707` instead of
  `var(--score-risk)`/`var(--text-on-score)`, the one spot in `components/ds` itself that bypasses
  its own tokens.
- `components/auth/auth-provider.tsx` hardcodes `#2fb8c4` for Privy's theme config — likely
  unavoidable (Privy's config is a JS object, not CSS), but worth a code comment saying so
  explicitly so a future token-color change doesn't miss it.

### 3.3 One global background layer dominates low-content pages (medium severity, single fix location)
`app/globals.css`'s `body::before` renders `banner.jpg` (a large "CLAWDEX" wordmark image) plus
two radial gradients, `position: fixed`, `z-index: -1`, on **every** page. On content-dense pages
(the `/` hero) it reads as a subtle ambient background. On `/login`, `/watchlist`'s empty state,
and `/kol`'s empty state — see screenshots — it dominates the page, with "CLAW" and "DEX" sitting
directly behind sparse foreground content. One CSS change (scope it to the pages that were
designed around it, or reduce its opacity/size, or add a solid gradient stop earlier) fixes every
page at once rather than needing 8 separate touch-ups.

### 3.4 `loading.tsx` doesn't match any current page (high severity, directly requested by the user)
Only `app/loading.tsx` (root) and `app/token/[mint]/loading.tsx` exist. The root one renders a
single-column `max-w-3xl` card list — the shape of an old feed layout — but the actual `/` page
is now a wide `max-w-[1120px]` hero + grid, and this is also the **only** fallback for `/agent`,
`/ecosystem`, `/kol`, `/landing`, `/login`, `/search`, `/terminal`, and `/watchlist`, none of which
look anything like a card list. A user navigating to `/terminal` sees a skeleton shaped like the
home feed, not a master-detail layout. Confirmed live: `/terminal`'s detail pane has no skeleton
at all, just literal text `"Loading token..."` — and in testing, `GET /api/terminal/[mint]` took
2.7–8.2s, so that bare text sits on screen long enough to read as broken, not loading.

### 3.5 Trade flow: no slippage or price-impact display (high severity, directly requested)
Grepped `components/token/TradeWidget.tsx` and `InstantBuyModal.tsx` for `slippage`/`price
impact`/`priceImpact` — zero matches in either file. The brief's Jupiter/Uniswap-style
requirement ("visible price impact and slippage") isn't implemented, not just unstyled.

### 3.6 No sparkline charts in feed/terminal rows (medium, directly requested)
Neither `components/ds/TokenCard.tsx` nor the `/terminal` list rows render a per-row sparkline —
confirmed against both the component source and the screenshots. `recharts` is already a listed
dependency per the brief, unused for this.

### 3.7 Icon system fragmentation (medium)
Three approaches coexist: `components/ds/Icon.tsx` (hand-rolled SVG path data, Lucide-derived),
the `hugeicons` package (a real dependency in `apps/frontend/package.json`, used in `nav-shell.tsx`
and elsewhere), and raw inline `<svg>` markup (e.g. `components/token/copy-mint.tsx`'s check/copy
icons, which also hardcode `text-emerald-500` instead of `var(--score-healthy)`). Not a visual bug
by itself, but three ways to add "just one more icon" invites drift.

### 3.8 Mobile navigation gap (medium)
The mobile bottom tab bar (`Home / Terminal / AI Agent / Portfolio`, confirmed in
`terminal-390.png`) has no entry for `/search`, `/watchlist`, `/kol`, or `/ecosystem`. There's no
hamburger menu either (confirmed in `home-390-viewport` check) — on mobile, `⌘K` doesn't exist
(no keyboard), and there's no visible tap target to reach search. Those four routes are only
reachable on mobile via a direct link or the footer (which itself sits below a very long scroll on
`/`, per `home-390.png` at 7,041px tall).

### 3.9 Score-badge inconsistency within a single page
On `/token/[mint]`, `SUB-SCORE BREAKDOWN`'s three progress bars are inconsistently colored: Holder
Distribution and Attributed Burns render solid teal; Liquidity Health fades teal→green partway
through the bar. Minor, but worth folding into the same pass as §3.2.

### 3.10 Chart embed has no fallback state
`/token/[mint]`'s "PRICE CHART" card showed a permanently-spinning "Loading chart settings..."
with no error/fallback after the DexScreener iframe never resolved for a mock mint. A real
"chart unavailable" state (matching the empty-state quality already shown on `/watchlist` and
`/kol`, see §5) is missing here.

---

## 4. Token audit against the Step 2 brief

What's already there (`app/globals.css`):
- Graphite base, teal brand, score colors kept separate from brand teal, `--mint-400` documented
  as logo-only — all correctly followed **in `components/ds`**, violated in the raw-hex files
  (§3.2).
- `--dur-fast`/`--dur`/`--dur-slow` + `--ease-out`/`--ease-in-out` already exist as motion tokens.
- Three surface steps exist (`--surface`, `--surface-sunken`, `--surface-raised`) but no 4th/5th
  step for deeper nesting (a card-inside-a-card-inside-a-panel situation, which `/terminal`'s
  detail pane now has).
- No documented contrast audit has been done — `--text-muted` (`#8b95a8`) on `--surface-sunken`
  (`#0f141c`) and similar low-emphasis pairs should be checked against WCAG AA before Step 2
  ships; not verified as part of this audit (would need a contrast-ratio tool, not just reading
  the hex values).
- `--r: 18px` (legacy) coexists with `--radius-lg: 10px` — two different "large radius" values
  with no documented relationship.
- No skeleton/shimmer component exists in `components/ds` (shadcn's `components/ui/skeleton.tsx`
  is the only one, used solely by the mismatched `app/loading.tsx`).

---

## 5. What's already good (worth preserving, not rewriting)

- `/watchlist` and `/kol` empty states: clear, specific copy with an actionable next step ("Tap
  the ★ on any token in the terminal to add it here" / explains *why* it's empty — missing env
  var — rather than a generic spinner). Use this copy voice as the template for other empty states.
- `/login`: clean hierarchy, correct primary/secondary button weighting, and **"Browse without
  signing in"** already present — the brief's "let people browse without logging in" requirement
  is already met here.
- `⌘K` already exists (`components/shell/nav-shell.tsx:30`) and focuses an inline search input
  with live dropdown results (tokens/people/news) — not a full modal palette, but a working,
  fast entry point. Upgrading it to a centered overlay (Linear/Raycast-style) is a refinement, not
  new construction.
- `CopyMintButton` (`components/token/copy-mint.tsx`) already implements the exact
  truncated-middle + copy-to-clipboard pattern the brief asks for — it just needs to be reused on
  feed/terminal rows (currently only on the token page) and have its hardcoded `emerald-500` swapped
  for a token.
- `/terminal`'s token list (desktop): sticky filter bar, right-aligned numbers, color-coded score
  badges by band, hover-ready row structure, and a real category system (Trending/Most
  held/Graduated/Bonding/King of the hill/Gainers/Community) that drops tokens lacking the
  relevant signal instead of padding — genuinely close to the DexScreener-density brief already.
- `/terminal` mobile: the list itself is a real stacked-card layout, not a sideways-scrolling
  table — the brief's mobile requirement is met for this one view.

---

## 6. Prioritized plan for Steps 2–3

1. **Design-system consolidation (Step 2, do first — everything else depends on it).** Decide
   `components/ds` vs `components/ui` for each remaining primitive; delete or migrate the losing
   side; delete the `--line`/`--txt`/`--panel`/`--sol*`/`--r` legacy aliases from `globals.css` so
   the compiler/grep surfaces every remaining raw-hex or wrong-token usage instead of silently
   working.
2. **Fix the off-brand colors** (§3.2) as part of the same pass — they're a direct consequence of
   #1 (files that never adopted either system in the first place).
3. **Resolve or explicitly scope the two-score-UIs question** (§3.1) with the product owner before
   touching either widget's visuals — restyling both to match doesn't fix the trust problem if
   they still disagree.
4. **Per-route skeletons** (§3.4) — one skeleton per route shaped like that route's actual final
   layout, especially `/terminal`'s list+detail and the detail pane's `"Loading token..."` state.
5. **Trade flow: slippage/price-impact + confirmation step** (§3.5) — real gap, not styling.
6. **Sparklines in feed/terminal rows** (§3.6), **global background scoping** (§3.3, quick, high
   visual payoff), **chart fallback state** (§3.10).
7. **Icon consolidation, mobile nav gap, copy-mint reuse** (§3.7, §3.8, part of §5) — lower
   urgency, bundle into whichever page-pass touches those areas.

Per the user's rule: work one area at a time, screenshot before/after at both widths, `pnpm lint`
+ `pnpm check-types` before every commit.

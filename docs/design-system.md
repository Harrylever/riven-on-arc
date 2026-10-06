# Riven design system

Black-and-blue terminal, mobile-first. Flat surfaces, no glows. Colour carries meaning (score band, price direction) or is the brand blue. Nothing is decorative.

All tokens live in one `:root` block in `apps/frontend/app/globals.css`, in three tiers.

## 1. Primitive tokens (raw values; components never use these)

| Category | Token | Value |
|---|---|---|
| Neutral | `--black` | `#000000` |
| Neutral | `--navy-950` / `--navy-900` / `--navy-800` / `--navy-700` | `#020409` / `#05080e` / `#0a1220` / `#101c30` |
| Brand | `--blue-900` / `--blue-500` / `--blue-400` / `--blue-200` | `#0b4ea8` / `#1e7bff` / `#3fb6ff` / `#9fd8ff` |
| Ink | `--ink-50` / `--ink-300` / `--ink-500` | `#e6eefb` / `#93a6c2` / `#5c6f8c` |
| Status | `--green-500` / `--amber-500` / `--red-500` / `--slate-500` | `#22c55e` / `#eab308` / `#ef4444` / `#64748b` |

## 2. Semantic tokens (`--rv-*`; components use these)

Riven is dark-only, so each semantic token has a single value.

| Token | Maps to | Usage |
|---|---|---|
| `--rv-bg` | black | Page background |
| `--rv-card` / `--rv-card-hover` / `--rv-sunken` | navy-900 / 800 / 950 | Cards, hover, inset wells |
| `--rv-stroke` / `--rv-stroke-strong` | blue at 16% / 32% | Borders, dividers |
| `--rv-ink` / `--rv-ink-2` / `--rv-ink-3` | ink-50 / 300 / 500 | Primary, secondary and muted text |
| `--rv-blue` / `--rv-cyan` / `--rv-ice` | blue-500 / 400 / 200 | Primary action, live indicators, links |
| `--rv-healthy` / `--rv-caution` / `--rv-risk` / `--rv-unscored` | green / amber / red / slate | Score bands only |
| `--rv-up` / `--rv-down` | green / red | Price direction only |
| `--rv-radius` / `--rv-radius-sm` | 14px / 10px | Cards / controls |

Contrast on `--rv-bg`:
- `--rv-ink` ≈ 17:1, `--rv-ink-2` ≈ 8:1, `--rv-ink-3` ≈ 4.0:1. Use ink-3 for captions and labels only; it fails WCAG AA for long body text.
- The band colours all pass AA (≥ 4.5:1) for text at 12px and up.

## 3. Component tokens and classes

| Component | Class / token | Built from |
|---|---|---|
| Card | `.rv-card` | `--rv-card`, `--rv-stroke`, `--rv-radius` |
| Input | `.rv-input` | black background, `--rv-stroke`, focus `--rv-blue` |
| Numbers | `.rv-num` | `--font-mono`, tabular figures |
| Display type | `.rv-display` | `--font-display`, -0.02em tracking |
| Score chip | `<ScoreBadge>` | `BAND_META` colour plus a 10% tint; optional verdict word |
| Flag chip | `FlagBadge` / reason chips | `--rv-risk` on a 8–12% red tint |
| shadcn `components/ui` | `--background`, `--primary`, … | aliased to the semantic tokens |

## Legacy aliases

Older names now point at the semantic tokens, so every surface renders the same palette. Never use these in new code:
- `--surface*`, `--text-*`, `--brand*`, `--score-*`, `--border*`, `--up`/`--down`, used by the ported perps terminal;
- `--bg`, `--txt`, `--mut`, `--line`, `--sol*`.

## Rules

1. **New code uses `--rv-*` only.**
2. **Colour is meaning.** Green, amber and red appear only for a score band or price direction, never as decoration.
3. **Every score carries its word.** Show a score as `6.9/10 · Caution`, never a bare number (normie-friendly principle).
4. **Flags use evidence wording.** Write "flagged", "liquidity pulled", "creator sold out"; never "scam" or "fake".
5. **Tap targets are 44px or more on mobile.** Content is single-column below `md`, with the bottom nav within thumb reach.

## Migration status

- ✅ The overriding second `:root` block was removed. There is one source of truth, and one "healthy" green (it used to be two).
- ✅ shadcn and the perps terminal render on the Riven palette through the aliases.
- ⏳ Next: replace the alias usages in `components/perps/*` with `--rv-*` names, then delete the aliases. This can be done one file at a time; no big-bang rewrite is needed.

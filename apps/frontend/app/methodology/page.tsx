import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "How the score works",
  description: "Riven's arc-v2 methodology: five sub-scores, automatic red flags, and where every number comes from.",
}

const PARTS = [
  {
    name: "Contract",
    max: 25,
    color: "var(--rv-cyan)",
    what: "What the token's code lets someone do to holders.",
    checks: [
      "Can anyone still create new tokens (mint)?",
      "Can the code be swapped out (upgradeable proxy)?",
      "Can trading be paused or wallets blacklisted?",
      "How big is the trading fee, and can the creator change it?",
    ],
    from: "Reads the contract bytecode on Arc, following minimal-proxy clones to the real code, and the pool's live fee.",
  },
  {
    name: "Liquidity",
    max: 20,
    color: "var(--rv-blue)",
    what: "Whether the pool can be pulled, and whether there's money to sell into.",
    checks: [
      "Who owns the Uniswap v4 liquidity position: burned, a launchpad locker, or a wallet?",
      "Has any liquidity already been removed?",
      "How much USDC is actually left in the pool?",
    ],
    from: "Uniswap v4 PositionManager ownership plus every swap on the pool since launch.",
  },
  {
    name: "Holders",
    max: 25,
    color: "var(--rv-healthy)",
    what: "Who owns the supply right now.",
    checks: [
      "Top 10 wallets' share (pool, burns and launchpad contracts excluded)",
      "How much the creator still holds",
      "Snipers: wallets that bought in the first ~5 seconds",
      "Wallets the creator funded with USDC around launch (bundles / insiders)",
      "Is anyone actually holding, or is everything back in the pool?",
    ],
    from: "Every ERC-20 Transfer of the token since launch, plus the creator's USDC transfers.",
  },
  {
    name: "Creator",
    max: 15,
    color: "var(--rv-caution)",
    what: "The track record and behaviour of whoever launched it.",
    checks: [
      "How many tokens this wallet has launched (serial launchers are capped)",
      "How much of their own tokens the creator has sold",
      "Copycats: other tokens using the same name or ticker",
    ],
    from: "Riven's index of every Argus and Tolly launch.",
  },
  {
    name: "Activity",
    max: 15,
    color: "var(--rv-ice)",
    what: "Whether real trading is happening.",
    checks: [
      "Have sells gone through (can you actually get out)?",
      "Are there real holders, or just dust wallets?",
      "Wash trading: huge volume while almost no USDC stays in the pool",
      "Does the project list a website or socials?",
    ],
    from: "Swaps on the token's pool over the last 24 hours.",
  },
]

const CAPS = [
  ["Liquidity already pulled", 19],
  ["Contract can still mint", 29],
  ["Trading fee over 10%", 29],
  ["Creator launched 10+ tokens", 29],
  ["Most of the creator's past tokens died or dumped", 29],
  ["Holders own under 1% of supply (everyone sold)", 39],
  ["Contract is upgradeable", 49],
  ["Creator dumped 75%+ of their tokens", 49],
  ["Trading can be paused / wallets blocked", 59],
  ["Liquidity not locked", 59],
  ["Creator-funded wallets hold over 20%", 59],
  ["Top 10 hold over 40%, or snipers over 30%", 69],
  ["Under 6 hours old (probation)", 69],
  ["Not proven yet: under 25 holders, under $1k USDC in the pool, or no sells", 69],
] as const

export default function MethodologyPage() {
  return (
    <article className="rv-body flex flex-col gap-4 text-[15px] leading-relaxed text-[var(--rv-ink-2)]">
      <header className="rv-card p-5 sm:p-7">
        <p className="text-[12px] font-semibold tracking-[0.18em] text-[var(--rv-cyan)] uppercase">Methodology · arc-v4</p>
        <h1 className="rv-display mt-2 text-[32px] leading-tight font-extrabold text-[var(--rv-ink)] sm:text-[40px]">
          How Riven scores a launch
        </h1>
        <p className="mt-3 max-w-2xl">
          Every token gets a score from 1 to 10, built from five parts worth 100 points between them. It&apos;s modelled on what established scanners
          check (Token Sniffer, RugCheck, GoPlus, DEXTools, GMGN and Bubblemaps), rebuilt from scratch on Arc mainnet
          data. A score only appears once the contract, liquidity and holders have all been measured, because an
          unscored token is better than a wrong score.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-[13px] font-semibold">
          <span className="rounded-full bg-[rgba(52,211,153,0.12)] px-3 py-1.5 text-[var(--rv-healthy)]">7–10 Looks healthy</span>
          <span className="rounded-full bg-[rgba(251,191,36,0.12)] px-3 py-1.5 text-[var(--rv-caution)]">5–6.9 Be careful</span>
          <span className="rounded-full bg-[rgba(244,63,94,0.12)] px-3 py-1.5 text-[var(--rv-risk)]">1–4.9 Risky</span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {PARTS.map((p) => (
          <section key={p.name} className="rv-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="rv-display text-[20px] font-bold text-[var(--rv-ink)]">{p.name}</h2>
              <span className="rv-num text-[14px] font-semibold" style={{ color: p.color }}>
                {p.max} pts · {(p.max / 10).toFixed(1)} of 10
              </span>
            </div>
            <p className="mt-1 text-[14px]">{p.what}</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-[14px]">
              {p.checks.map((c) => (
                <li key={c} className="flex gap-2">
                  <span style={{ color: p.color }} aria-hidden>
                    ▸
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-[var(--rv-ink-3)]">Source: {p.from}</p>
          </section>
        ))}
        <section className="rv-card p-5 sm:col-span-2">
          <h2 className="rv-display text-[20px] font-bold text-[var(--rv-ink)]">Automatic red flags</h2>
          <p className="mt-1 text-[14px]">
            Some things are bad enough that no amount of good elsewhere can hide them, so they cap the score. The worst
            ones also mark a token as fake: it&apos;s hidden from the screener (search still finds it).
          </p>
          <ul className="mt-3 grid gap-1.5 text-[14px] sm:grid-cols-2">
            {CAPS.map(([what, cap]) => (
              <li key={what} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                <span>{what}</span>
                <span className="rv-num shrink-0 font-semibold text-[var(--rv-risk)]">max {(cap / 10).toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rv-card p-5 sm:p-6">
        <h2 className="rv-display text-[20px] font-bold text-[var(--rv-ink)]">Why a token isn&apos;t called safe early</h2>
        <p className="mt-2 text-[14px]">
          A pump-and-dump looks clean in its first minutes: no mint function, locked liquidity, a spread-out holder list.
          The dump comes later. So Riven never rates a token healthy until it has earned it — at least 6 hours old, 25+
          real holders, $1,000+ USDC actually in the pool, and sells going through. Until then the best it can score is
          6.9 (&ldquo;be careful&rdquo;). And a creator whose earlier tokens died or dumped is marked risky the moment
          they launch again, before this token has a chance to dump.
        </p>
      </section>

      <section className="rv-card p-5 sm:p-6">
        <h2 className="rv-display text-[20px] font-bold text-[var(--rv-ink)]">What Riven can&apos;t see</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[14px]">
          <li>Contract checks read bytecode, not verified source code. A clean scan is strong evidence, not proof.</li>
          <li>Launchpad liquidity locks are judged from the locker&apos;s code having no withdraw path.</li>
          <li>Insider detection only follows direct USDC funding from the creator around launch, not multi-hop funding.</li>
          <li>Thresholds are a starting point and haven&apos;t been back-tested against outcomes yet.</li>
          <li>Riven indexes every token with a USDC pool on Uniswap v4. Holder checks need a token&apos;s full transfer history; older tokens show &ldquo;Scoring&rdquo; until it&apos;s replayed.</li>
          <li>Prices, liquidity and volume in the screener come from DexScreener and are never used in the score.</li>
        </ul>
        <p className="mt-4 text-[13px] text-[var(--rv-ink-3)]">
          The score is never sold: no paid boosts, no paid badges. Not financial advice. DYOR.
        </p>
        <Link href="/" className="mt-3 inline-block text-[14px] font-semibold text-[var(--rv-ice)] hover:underline">
          ← Back to launches
        </Link>
      </section>
    </article>
  )
}

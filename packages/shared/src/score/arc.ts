/**
 * Riven's Arc token score — methodology "arc-v5": a 1–10 score.
 *
 * v5 fixes false positives found in the October audit: a small holder share on
 * a busy launchpad token is churn, not death; wash trading needs 50x pool
 * turnover (busy memes routinely do 20x); impersonating an official brand
 * (USDC, Circle…) is now judged here, in one place, not in the UI.
 *
 * v4 is about not trusting a token too early. A pump-and-dump looks clean in
 * its first minutes, so "healthy" now needs proof (age, real holders, USDC in
 * the pool, real sells), and a creator whose past tokens died is treated as a
 * rug before it happens rather than after.
 *
 * Modeled on what established scanners check (Token Sniffer, RugCheck, GoPlus,
 * DEXTools, GMGN, Bubblemaps): five sub-scores out of 100, plus hard caps so a
 * token can never look healthy while someone can still take the money.
 *
 *   Contract 25 · Liquidity 20 · Holders 25 · Creator 15 · Activity 15
 *
 * Every flag is plain English and carries a level (danger / warning / good),
 * the way RugCheck presents risks. Thresholds live here and are a starting
 * point — not yet validated against real outcomes.
 */

export const ARC_METHODOLOGY = "arc-v5";

/** Daily volume this many times the pool's USDC, on $1k+, reads as wash trading. */
export const WASH_TURNOVER = 50;

export function isWash(volume24h: number | null, poolUsdc: number | null): boolean {
  return (
    volume24h !== null &&
    poolUsdc !== null &&
    volume24h > 1000 &&
    volume24h > WASH_TURNOVER * Math.max(poolUsdc, 1)
  );
}

/**
 * Names only the real issuer would use. On Arc (Circle's chain) a random token
 * called "Circle" or "USDC" is impersonation, whatever its contract says.
 */
const BRANDS =
  /^(circle|usdc|usdt|eurc|tether|arc|arc network|coinbase|binance|uniswap|ethereum|eth|bitcoin|btc|solana|blackrock)$/i;

/** The brand a token's name or ticker impersonates, if any. */
export function impersonates(t: { name: string; symbol: string }): string | null {
  return [t.name, t.symbol].map((x) => x.trim()).find((x) => BRANDS.test(x)) ?? null;
}

export type ArcBand = "healthy" | "caution" | "risk" | "unscored";
export type ArcConfidence = "high" | "medium" | "low";
export type FlagLevel = "danger" | "warning" | "good";

export interface ArcFlag {
  level: FlagLevel;
  category: SubScoreKey;
  text: string;
  /** Stable machine code, e.g. "WASH" — used for fake detection and alerts. */
  code: string;
}

/**
 * Flags that mark a token as fake or already dead: hidden from feeds and the
 * screener by default, still findable by search.
 */
export const FAKE_FLAG_CODES = ["WASH", "DEAD", "SERIAL", "CREATOR_DUMP", "LP_REMOVED", "IMPERSONATION"] as const;

export function fakeReasons(flags: ArcFlag[] | undefined | null): string[] {
  return (flags ?? [])
    .filter((f) => (FAKE_FLAG_CODES as readonly string[]).includes(f.code))
    .map((f) => f.text);
}

/** 0–100 points → the published 1–10 score (one decimal). */
export function toScore10(points: number): number {
  return Math.max(1, Math.round(Math.max(0, Math.min(100, points))) / 10);
}

export type SubScoreKey = "contract" | "liquidity" | "holders" | "creator" | "activity";

export interface ArcAuthorityInput {
  canMint: boolean;
  upgradeable: boolean;
  /** pause / blacklist / freeze / trading toggle */
  canRestrict: boolean;
  /** creator can change a transfer tax after launch */
  ownerSetsFee: boolean;
  /** launchpad-enforced max wallet / anti-snipe window */
  launchpadLimits: boolean;
}

export type ArcLpState =
  | "burned"
  | "locked_launchpad"
  | "launchpad_curve"
  | "unknown_contract"
  | "unlocked"
  | "removed";

export interface ArcScoreInput {
  authority: ArcAuthorityInput | null;
  /** Total fee charged on a trade, in %, from the pool's fee setting. */
  tradeFeePct: number | null;
  lp: { state: ArcLpState } | null;
  /** USDC sitting in the pool — what sellers can actually exit into. */
  poolUsdc: number | null;
  holders: {
    count: number;
    top10Pct: number;
    creatorPct: number;
    /** Held now by wallets that bought within seconds of launch. */
    sniperPct: number;
    /** Held now by wallets the creator funded with USDC around launch. */
    insiderPct: number;
    insiderWallets: number;
    /** % of supply held by real wallets (not the pool, burns or launchpad contracts). */
    circulatingPct: number;
  } | null;
  creator: {
    /** Tokens this creator has launched (including this one) on tracked launchpads. */
    launches: number;
    /** Earlier tokens from this creator old enough to judge (6h+). */
    priorJudged?: number;
    /** …of which died, dumped, were wash-traded or had liquidity pulled. */
    priorFailed?: number;
    /** % of what the creator received that they have since sold or moved. */
    soldPct: number | null;
    /** Other tokens using the same name or ticker. */
    copycats: number;
  } | null;
  activity: {
    buys24h: number;
    sells24h: number;
    volume24h: number;
    hasSocials: boolean;
  } | null;
  /** Creator burns as % of supply. Shown as a strength, not scored. */
  attributedBurnPct: number | null;
  /** Hours since launch. Under PROBATION_HOURS a token can't be rated healthy. */
  ageHours?: number | null;
  /** Name and ticker, for brand-impersonation checks. */
  identity?: { name: string; symbol: string } | null;
}

/** New tokens are on probation: the classic dump happens in the first hours. */
export const PROBATION_HOURS = 6;
/** Minimum proof before a token can be called healthy. */
export const PROOF = { holders: 25, poolUsdc: 1000 } as const;

export interface ArcScoreResult {
  /** Published score, 1–10 (one decimal), or null when not enough is measured. */
  score: number | null;
  /** The same score in 0–100 points, before scaling. */
  points: number | null;
  band: ArcBand;
  subScores: Record<SubScoreKey, { points: number; max: number }>;
  flags: ArcFlag[];
  caps: string[];
  partial: boolean;
  confidence: ArcConfidence;
  verdict: string;
}

export const SUB_SCORE_MAX: Record<SubScoreKey, number> = {
  contract: 25,
  liquidity: 20,
  holders: 25,
  creator: 15,
  activity: 15,
};

export const SUB_SCORE_LABEL: Record<SubScoreKey, string> = {
  contract: "Contract",
  liquidity: "Liquidity",
  holders: "Holders",
  creator: "Creator",
  activity: "Activity",
};

/** Band for a 1–10 score: 7+ healthy, 5–6.9 caution, under 5 risky. */
export function arcBand(score: number | null): ArcBand {
  if (score === null) return "unscored";
  if (score >= 7) return "healthy";
  if (score >= 5) return "caution";
  return "risk";
}

const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
const usd = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1e6).toFixed(1)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(1)}k`
      : n >= 10
        ? `$${Math.round(n)}`
        : `$${n.toFixed(2)}`; // "$0.63", not "$1": small pools are the evidence

function tiers(value: number, steps: Array<[number, number]>, otherwise = 0) {
  for (const [limit, points] of steps) if (value <= limit) return points;
  return otherwise;
}

export function computeArcScore(input: ArcScoreInput): ArcScoreResult {
  const flags: ArcFlag[] = [];
  const caps: Array<[number, string]> = [];
  const sub: Record<SubScoreKey, number> = {
    contract: 0,
    liquidity: 0,
    holders: 0,
    creator: 0,
    activity: 0,
  };
  const flag = (level: FlagLevel, category: SubScoreKey, text: string, code = "INFO") =>
    flags.push({ level, category, text, code });

  // ── Contract (25): what the code lets someone do to holders ─────────────
  if (input.authority) {
    const a = input.authority;
    sub.contract += a.canMint ? 0 : 10;
    sub.contract += a.upgradeable ? 0 : 5;
    sub.contract += a.canRestrict ? 0 : 5;
    if (a.canMint) {
      caps.push([29, "the contract can still create new tokens"]);
      flag("danger", "contract", "Contract can still create new tokens", "MINT");
    }
    if (a.upgradeable) {
      caps.push([49, "the contract code can be swapped out"]);
      flag("danger", "contract", "Contract is upgradeable — its rules can change", "UPGRADE");
    }
    if (a.canRestrict) {
      caps.push([59, "someone can pause trading or block wallets"]);
      flag("danger", "contract", "Someone can pause trading or block wallets", "RESTRICT");
    }
    if (a.ownerSetsFee) flag("warning", "contract", "Creator can change the trading fee", "OWNER_FEE");
    if (a.launchpadLimits) flag("warning", "contract", "Launchpad limits apply (max wallet / anti-snipe)");
    if (!a.canMint && !a.upgradeable && !a.canRestrict) {
      flag("good", "contract", "No one can mint, pause or upgrade the token");
    }
  }
  if (input.tradeFeePct !== null) {
    const f = input.tradeFeePct;
    sub.contract += a_feePoints(f, input.authority?.ownerSetsFee ?? false);
    if (f > 10) {
      caps.push([29, `trades cost a ${pct(f)} fee`]);
      flag("danger", "contract", `Trading fee is ${pct(f)} — you lose a lot on every trade`, "HIGH_FEE");
    } else if (f > 5) {
      flag("warning", "contract", `Trading fee is ${pct(f)}`);
    } else {
      flag("good", "contract", `Low trading fee (${pct(f)})`);
    }
  }

  // ── Liquidity (20): can it be pulled, and is there enough to sell into ──
  if (input.lp) {
    const lockPts: Record<ArcLpState, number> = {
      burned: 12,
      locked_launchpad: 12,
      launchpad_curve: 8,
      unknown_contract: 4,
      unlocked: 0,
      removed: 0,
    };
    sub.liquidity += lockPts[input.lp.state];
    switch (input.lp.state) {
      case "burned":
        flag("good", "liquidity", "Liquidity is burned — it can never be pulled");
        break;
      case "locked_launchpad":
        flag("good", "liquidity", "Liquidity is locked by the launchpad");
        break;
      case "launchpad_curve":
        flag("good", "liquidity", "Still on the launchpad's bonding curve");
        break;
      case "unknown_contract":
        flag("warning", "liquidity", "Liquidity sits in a contract we couldn't verify");
        break;
      case "unlocked":
        caps.push([59, "liquidity is not locked"]);
        flag("danger", "liquidity", "Liquidity is not locked — it can be pulled anytime", "LP_UNLOCKED");
        break;
      case "removed":
        caps.push([19, "liquidity has already been pulled"]);
        flag("danger", "liquidity", "Liquidity has already been removed (rug)", "LP_REMOVED");
        break;
    }
  }
  if (input.poolUsdc !== null) {
    sub.liquidity += input.poolUsdc >= 5000 ? 8 : input.poolUsdc >= 1000 ? 4 : 0;
    if (input.poolUsdc < 1000) {
      flag("warning", "liquidity", `Only ${usd(input.poolUsdc)} USDC in the pool — big sells will crash the price`);
    } else if (input.poolUsdc >= 5000) {
      flag("good", "liquidity", `${usd(input.poolUsdc)} USDC in the pool`);
    }
  }

  // ── Holders (25): who owns the supply ─────────────────────────────────
  if (input.holders) {
    const h = input.holders;
    sub.holders += tiers(h.top10Pct, [[15, 10], [25, 8], [40, 5], [60, 2]]);
    sub.holders += tiers(h.creatorPct, [[5, 5], [10, 3], [20, 1]]);
    sub.holders += tiers(h.sniperPct, [[5, 5], [15, 3], [30, 1]]);
    sub.holders += tiers(h.insiderPct, [[5, 5], [15, 2]]);
    if (h.top10Pct > 40) {
      caps.push([69, "the top 10 wallets hold most of the supply"]);
      flag("danger", "holders", `Top 10 wallets hold ${pct(h.top10Pct)} of supply`, "CONCENTRATED");
    } else if (h.top10Pct > 25) {
      flag("warning", "holders", `Top 10 wallets hold ${pct(h.top10Pct)} of supply`);
    } else {
      flag("good", "holders", `Supply is spread out (top 10 hold ${pct(h.top10Pct)})`);
    }
    if (h.creatorPct > 20) flag("danger", "holders", `Creator holds ${pct(h.creatorPct)} of supply`, "CREATOR_HEAVY");
    else if (h.creatorPct > 5) flag("warning", "holders", `Creator holds ${pct(h.creatorPct)} of supply`);
    if (h.sniperPct > 30) {
      caps.push([69, "snipers hold a big share"]);
      flag("danger", "holders", `Snipers (bought in the first seconds) hold ${pct(h.sniperPct)}`, "SNIPERS");
    } else if (h.sniperPct > 15) {
      flag("warning", "holders", `Snipers hold ${pct(h.sniperPct)} of supply`);
    }
    if (h.circulatingPct < 1) {
      // On a launchpad most supply legitimately sits in the curve/pool, so a
      // small holder share alone isn't death. It's dead when nobody holds AND
      // nobody trades; if people are still trading, it's just flippers.
      const trades = input.activity ? input.activity.buys24h + input.activity.sells24h : 0;
      const young = input.ageHours !== null && input.ageHours !== undefined && input.ageHours < PROBATION_HOURS;
      if (trades === 0 && !young) {
        caps.push([39, "almost everyone has sold and trading has stopped"]);
        flag("danger", "holders", `Dead: holders own only ${pct(h.circulatingPct)} of supply and no one traded in 24h`, "DEAD");
      } else if (trades > 0) {
        caps.push([49, "almost nobody holds — traders are flipping in and out"]);
        flag("warning", "holders", `Holders keep only ${pct(h.circulatingPct)} of supply — most buyers sell quickly`, "CHURN");
      }
    }
    if (h.insiderPct > 20) {
      caps.push([59, "wallets funded by the creator hold a big share"]);
      flag("danger", "holders", `${h.insiderWallets} wallets funded by the creator hold ${pct(h.insiderPct)}`, "INSIDERS");
    } else if (h.insiderPct > 5) {
      flag("warning", "holders", `${h.insiderWallets} wallets funded by the creator hold ${pct(h.insiderPct)}`);
    }
  }

  // ── Creator (15): track record and behaviour ──────────────────────────
  if (input.creator) {
    const c = input.creator;
    sub.creator += c.launches <= 1 ? 6 : c.launches <= 3 ? 3 : 0;
    if (c.launches >= 10) {
      caps.push([29, `the creator has launched ${c.launches} tokens`]);
      flag("danger", "creator", `Serial launcher: this creator made ${c.launches} tokens`, "SERIAL");
    } else if (c.launches >= 4) {
      flag("danger", "creator", `This creator has launched ${c.launches} tokens`);
    } else if (c.launches >= 2) {
      flag("warning", "creator", `This creator has launched ${c.launches} tokens`);
    } else {
      flag("good", "creator", "First launch from this creator");
    }
    const judged = c.priorJudged ?? 0;
    const failed = c.priorFailed ?? 0;
    if (judged >= 2 && failed / judged >= 0.5) {
      caps.push([29, `this creator's past tokens mostly failed (${failed} of ${judged})`]);
      flag(
        "danger",
        "creator",
        `Bad track record: ${failed} of this creator's last ${judged} tokens died, dumped or were rugged`,
        "BAD_TRACK_RECORD",
      );
    } else if (judged >= 2 && failed === 0) {
      flag("good", "creator", `Creator's past ${judged} tokens are still alive`);
    }
    if (c.soldPct === null) {
      sub.creator += 5;
    } else {
      sub.creator += c.soldPct < 25 ? 5 : c.soldPct < 75 ? 2 : 0;
      if (c.soldPct >= 75) {
        caps.push([49, "the creator has sold out"]);
        flag("danger", "creator", `Creator sold ${pct(c.soldPct)} of the tokens they received`, "CREATOR_DUMP");
      }
      else if (c.soldPct >= 25) flag("warning", "creator", `Creator has sold ${pct(c.soldPct)} of their tokens`);
    }
    sub.creator += c.copycats === 0 ? 4 : 0;
    if (c.copycats > 0) {
      flag("warning", "creator", `Copycat: ${c.copycats} other token${c.copycats === 1 ? "" : "s"} use this name`, "COPYCAT");
    }
  }

  // ── Activity (15): is real trading happening ──────────────────────────
  if (input.activity) {
    const act = input.activity;
    const holders = input.holders?.count ?? 0;
    sub.activity += holders >= 100 ? 5 : holders >= 25 ? 3 : holders >= 5 ? 1 : 0;
    // Wash trading: lots of volume but almost no USDC actually stays in the pool.
    const wash = isWash(act.volume24h, input.poolUsdc);
    sub.activity += act.sells24h > 0 ? 4 : 0;
    sub.activity += !wash && act.buys24h > 0 && act.buys24h >= act.sells24h ? 3 : 0;
    if (wash) {
      sub.activity = Math.max(0, sub.activity - 5);
      flag("danger", "activity", `Fake volume: ${usd(act.volume24h)} traded in 24h through a pool holding only ${usd(input.poolUsdc ?? 0)} of USDC`, "WASH");
    }
    sub.activity += act.hasSocials ? 3 : 0;
    if (act.sells24h > 0) flag("good", "activity", `Sells are going through (${act.sells24h} in 24h)`);
    else if (act.buys24h > 0) flag("warning", "activity", "No sells seen yet — selling is unproven", "NO_SELLS");
    if (act.buys24h + act.sells24h === 0) flag("warning", "activity", "No trading in the last 24h");
    if (!act.hasSocials) flag("warning", "activity", "No website or socials listed");
  }

  if (input.attributedBurnPct !== null && input.attributedBurnPct >= 1) {
    flag("good", "holders", `Creator burned ${pct(input.attributedBurnPct)} of supply`);
  }

  const brand = input.identity ? impersonates(input.identity) : null;
  if (brand) {
    caps.push([19, `it impersonates ${brand}`]);
    flag("danger", "creator", `Impersonates ${brand} — not an official token`, "IMPERSONATION");
  }

  // ── Probation & proof: "healthy" has to be earned, not assumed ─────────
  if (input.ageHours !== null && input.ageHours !== undefined && input.ageHours < PROBATION_HOURS) {
    caps.push([69, `it's under ${PROBATION_HOURS} hours old — most dumps happen in this window`]);
    flag(
      "warning",
      "activity",
      `On probation: only ${input.ageHours < 1 ? `${Math.max(1, Math.round(input.ageHours * 60))} minutes` : `${input.ageHours.toFixed(1)} hours`} old — can't be rated healthy before ${PROBATION_HOURS}h`,
      "PROBATION",
    );
  }
  const missingProof: string[] = [];
  if (input.holders && input.holders.count < PROOF.holders) missingProof.push(`${PROOF.holders}+ real holders`);
  if (input.poolUsdc !== null && input.poolUsdc < PROOF.poolUsdc) missingProof.push(`$${PROOF.poolUsdc.toLocaleString()}+ USDC in the pool`);
  if (input.activity && input.activity.sells24h === 0) missingProof.push("real sells");
  if (missingProof.length > 0) {
    caps.push([69, "there isn't enough proof it's real yet"]);
    flag("warning", "activity", `Not proven yet: needs ${missingProof.join(", ")}`, "UNPROVEN");
  }

  const subScores = Object.fromEntries(
    (Object.keys(SUB_SCORE_MAX) as SubScoreKey[]).map((k) => [
      k,
      { points: Math.min(sub[k], SUB_SCORE_MAX[k]), max: SUB_SCORE_MAX[k] },
    ]),
  ) as ArcScoreResult["subScores"];

  // Contract, liquidity and holders must all be measured before publishing a
  // number: a token can look clean on the first two while one wallet holds
  // half the supply. Unscored beats a wrong score.
  const core = [input.authority, input.lp, input.holders].filter((x) => x !== null).length;
  if (core < 3) {
    return {
      score: null,
      points: null,
      band: "unscored",
      subScores,
      flags,
      caps: [],
      partial: true,
      confidence: "low",
      verdict:
        core === 0
          ? "Not scored yet — we're still reading this token's on-chain data."
          : "Scoring… still counting who holds this token.",
    };
  }

  const raw = Object.values(subScores).reduce((s, v) => s + v.points, 0);
  const cap = caps.reduce((m, [c]) => Math.min(m, c), 100);
  const points = Math.max(0, Math.min(raw, cap));
  const score = toScore10(points);
  const band = arcBand(score);
  const optionalMissing = [input.tradeFeePct, input.poolUsdc, input.creator, input.activity].some(
    (x) => x === null,
  );
  const confidence: ArcConfidence = optionalMissing
    ? "medium"
    : input.lp?.state === "burned" || input.lp?.state === "unlocked" || input.lp?.state === "removed"
      ? "high"
      : "medium"; // launchpad lock classification comes from bytecode, not verified source

  const lead = band === "healthy" ? "Looks healthy" : band === "caution" ? "Be careful" : "Risky";
  const worst = caps.sort((a, b) => a[0] - b[0])[0]?.[1];
  const firstDanger = flags.find((f) => f.level === "danger")?.text.toLowerCase();
  const firstGood = flags.find((f) => f.level === "good")?.text.toLowerCase();
  const why = worst ?? (band === "healthy" ? firstGood : firstDanger ?? firstGood);
  return {
    score,
    points,
    band,
    subScores,
    flags,
    caps: caps.map(([, r]) => r),
    partial: optionalMissing,
    confidence,
    verdict: why ? `${lead}: ${why}.` : `${lead}.`,
  };
}

function a_feePoints(feePct: number, ownerSetsFee: boolean) {
  if (ownerSetsFee) return 0;
  return feePct <= 5 ? 5 : feePct <= 10 ? 2 : 0;
}

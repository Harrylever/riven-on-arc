import { expect, test } from "bun:test";
import { arcBand, computeArcScore, fakeReasons, toScore10, type ArcScoreInput } from "./arc.js";

const CLEAN: ArcScoreInput = {
  authority: {
    canMint: false,
    upgradeable: false,
    canRestrict: false,
    ownerSetsFee: false,
    launchpadLimits: false,
  },
  tradeFeePct: 1,
  lp: { state: "locked_launchpad" },
  poolUsdc: 8000,
  holders: { count: 150, top10Pct: 12, creatorPct: 2, sniperPct: 3, insiderPct: 0, insiderWallets: 0, circulatingPct: 35 },
  creator: { launches: 1, soldPct: 0, copycats: 0 },
  activity: { buys24h: 80, sells24h: 40, volume24h: 12000, hasSocials: true },
  attributedBurnPct: 0,
  ageHours: 48,
};

test("a clean, locked, well-spread, active token scores 100 and is healthy", () => {
  const r = computeArcScore(CLEAN);
  expect(r.score).toBe(10);
  expect(r.band).toBe("healthy");
  expect(r.flags.every((f) => f.level === "good")).toBe(true);
  expect(r.verdict.startsWith("Looks healthy")).toBe(true);
});

test("live mint is an automatic danger", () => {
  const r = computeArcScore({ ...CLEAN, authority: { ...CLEAN.authority!, canMint: true } });
  expect(r.score).toBe(2.9);
  expect(r.band).toBe("risk");
  expect(r.verdict).toContain("create new tokens");
});

test("a fee over 10% is an automatic danger", () => {
  expect(computeArcScore({ ...CLEAN, tradeFeePct: 25 }).score).toBe(2.9);
});

test("pulled liquidity is the worst outcome", () => {
  const r = computeArcScore({ ...CLEAN, lp: { state: "removed" } });
  expect(r.score).toBe(1.9);
  expect(r.flags.some((f) => f.text.includes("rug"))).toBe(true);
});

test("a serial launcher is capped at risk", () => {
  const r = computeArcScore({ ...CLEAN, creator: { launches: 12, soldPct: 0, copycats: 3 } });
  expect(r.score).toBe(2.9);
  expect(r.flags.some((f) => f.code === "SERIAL")).toBe(true);
});

test("creator-funded wallets holding a big share cap at risk-adjacent caution", () => {
  const r = computeArcScore({
    ...CLEAN,
    holders: { ...CLEAN.holders!, insiderPct: 35, insiderWallets: 6 },
  });
  expect(r.score).toBe(5.9);
  expect(r.flags.some((f) => f.text.includes("6 wallets funded by the creator"))).toBe(true);
});

test("a 50% creator dev-buy is called out and capped", () => {
  const r = computeArcScore({
    ...CLEAN,
    holders: { ...CLEAN.holders!, top10Pct: 55, creatorPct: 50 },
  });
  expect(r.score).toBe(6.9);
  expect(r.flags.some((f) => f.level === "danger" && f.text === "Creator holds 50% of supply")).toBe(true);
});

test("thin pool and no sells are warnings, and block a healthy rating until proven", () => {
  const r = computeArcScore({
    ...CLEAN,
    poolUsdc: 300,
    activity: { buys24h: 5, sells24h: 0, volume24h: 200, hasSocials: false },
  });
  expect(r.flags.some((f) => f.level === "danger")).toBe(false);
  expect(r.flags.filter((f) => f.level === "warning").length).toBe(4); // + UNPROVEN
  // 25 + 12 + 25 + 15 + 8 = 85 points, capped at 69 until there's proof.
  expect(r.score).toBe(6.9);
  expect(r.band).toBe("caution");
});

test("creator dump + dead token + wash volume (real TOIIY pattern) is risky", () => {
  const r = computeArcScore({
    ...CLEAN,
    poolUsdc: 56,
    holders: { ...CLEAN.holders!, count: 40, top10Pct: 0.1, creatorPct: 0, circulatingPct: 0.2 },
    creator: { launches: 6, soldPct: 100, copycats: 1 },
    activity: { buys24h: 515, sells24h: 499, volume24h: 11100, hasSocials: true },
  });
  expect(r.band).toBe("risk");
  expect(r.score).toBe(3.9); // strongest cap: dead token (39 pts) beats creator dump (49)
  expect(fakeReasons(r.flags).length).toBe(3); // dead + creator dump + wash
  const dangers = r.flags.filter((f) => f.level === "danger").map((f) => f.text);
  expect(dangers.some((t) => t.startsWith("Creator dumped"))).toBe(true);
  expect(dangers.some((t) => t.startsWith("Holders own only"))).toBe(true);
  expect(dangers.some((t) => t.startsWith("Volume looks fake"))).toBe(true);
});

test("missing holder data stays unscored instead of looking healthy", () => {
  const r = computeArcScore({ ...CLEAN, holders: null });
  expect(r.score).toBeNull();
  expect(r.band).toBe("unscored");
  expect(r.verdict).toContain("still counting");
});

test("1–10 scale and bands", () => {
  expect(toScore10(0)).toBe(1);
  expect(toScore10(73)).toBe(7.3);
  expect(arcBand(7)).toBe("healthy");
  expect(arcBand(6.9)).toBe("caution");
  expect(arcBand(4.9)).toBe("risk");
  expect(arcBand(null)).toBe("unscored");
});

test("a brand-new token can't be healthy, however clean it looks (probation)", () => {
  const r = computeArcScore({ ...CLEAN, ageHours: 0.5 });
  expect(r.score).toBe(6.9);
  expect(r.band).toBe("caution");
  expect(r.flags.some((f) => f.code === "PROBATION")).toBe(true);
});

test("healthy needs proof: real holders, USDC in the pool and sells", () => {
  const r = computeArcScore({
    ...CLEAN,
    holders: { ...CLEAN.holders!, count: 8 },
    poolUsdc: 300,
  });
  expect(r.band).toBe("caution");
  expect(r.flags.find((f) => f.code === "UNPROVEN")?.text).toContain("25+ real holders");
});

test("a creator whose past tokens mostly died is risky before this one dumps", () => {
  const r = computeArcScore({
    ...CLEAN,
    creator: { launches: 3, soldPct: 0, copycats: 0, priorJudged: 2, priorFailed: 2 },
  });
  expect(r.score).toBe(2.9);
  expect(r.flags.some((f) => f.code === "BAD_TRACK_RECORD")).toBe(true);
});

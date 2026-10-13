import { describe, expect, test } from "bun:test";
import { ARC_METHODOLOGY, type ArcFlag } from "./arc.js";
import { deriveVerdict, normalizedScore, withFlagCodes } from "./verdict.js";

const flag = (code: string, text = code): ArcFlag => ({ level: "danger", category: "holders", text, code });
const base = { name: "Some Token", symbol: "SOME", volume24h: null, usdcInPool: null };

describe("normalizedScore", () => {
  test("current runs store 1-10 directly", () => {
    expect(normalizedScore({ score: 7.4, methodology: ARC_METHODOLOGY })).toBe(7.4);
  });
  test("arc-v2 and unlabelled runs were 0-100", () => {
    expect(normalizedScore({ score: 74, methodology: "arc-v2" })).toBe(7.4);
    expect(normalizedScore({ score: 3, methodology: null })).toBe(1);
  });
  test("no run is not scored", () => {
    expect(normalizedScore(null)).toBeNull();
  });
});

describe("withFlagCodes", () => {
  test("old flags without a code get one from their text", () => {
    const [f] = withFlagCodes([{ level: "danger", category: "creator", text: "Serial launcher: made 9 tokens" } as ArcFlag]);
    expect(f!.code).toBe("SERIAL");
  });
  test("a flag with a code is kept as is", () => {
    expect(withFlagCodes([flag("MINT")])[0]!.code).toBe("MINT");
  });
});

describe("deriveVerdict", () => {
  test("a clean scored token is not flagged and gets its band", () => {
    const v = deriveVerdict({ ...base, run: { score: 8, methodology: ARC_METHODOLOGY, flags: [flag("MINT")] } });
    expect(v.fake).toBe(false);
    expect(v.band).toBe("healthy");
    expect(v.scoreCodes).toEqual([]);
  });

  test("a current run's flagging codes flag the token", () => {
    const v = deriveVerdict({ ...base, run: { score: 2, methodology: ARC_METHODOLOGY, flags: [flag("LP_REMOVED"), flag("MINT")] } });
    expect(v.fake).toBe(true);
    expect(v.scoreCodes).toEqual(["LP_REMOVED"]);
    expect(v.band).toBe("risk");
  });

  test("an old run is only trusted for the codes that were never wrong", () => {
    const old = (code: string) =>
      deriveVerdict({ ...base, run: { score: 50, methodology: "arc-v2", flags: [flag(code)] } }).fake;
    expect(old("LP_REMOVED")).toBe(false);
    expect(old("DEAD")).toBe(false);
    expect(old("SERIAL")).toBe(true);
  });

  test("an unscored token can still be flagged from the market and its name", () => {
    const wash = deriveVerdict({ ...base, run: null, volume24h: 50_000, usdcInPool: 100 });
    expect(wash.score).toBeNull();
    expect(wash.band).toBe("unscored");
    expect(wash.fake).toBe(true);
    expect(wash.marketCodes).toEqual(["WASH"]);
    const fakeUsdc = deriveVerdict({ ...base, name: "USDC", symbol: "USDC", run: null });
    expect(fakeUsdc.marketCodes).toEqual(["IMPERSONATION"]);
  });

  test("a reason the score already raised is not repeated from the market", () => {
    const v = deriveVerdict({
      ...base,
      run: { score: 2, methodology: ARC_METHODOLOGY, flags: [flag("WASH", "Fake volume: $1")] },
      volume24h: 50_000,
      usdcInPool: 100,
    });
    expect(v.reasons.filter((r) => r.code === "WASH")).toHaveLength(1);
    expect(v.reasons[0]!.text).toBe("Fake volume: $1");
  });
});

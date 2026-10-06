import { describe, expect, test } from "bun:test";
import { toPoolInit } from "./pool-indexer.service";
import { pickPairs } from "./market-sync.service";
import { riskAlerts } from "./scoring.service";

const USDC = "0x3600000000000000000000000000000000000000";
const TOKEN = "0xf2c09536cf44b31a8267cf1cb25a5d8ac5695726";

describe("toPoolInit", () => {
  const base = { blockNumber: 10n, transactionHash: "0xabc" };
  test("keeps USDC pools and returns the other side as the token", () => {
    expect(toPoolInit({ ...base, args: { id: "0xPOOL", currency0: USDC, currency1: TOKEN, hooks: "0xHOOK" } })).toEqual({
      poolId: "0xpool",
      token: TOKEN,
      hooks: "0xhook",
      blockNumber: 10n,
      txHash: "0xabc",
    });
  });
  test("drops pools without USDC", () => {
    expect(toPoolInit({ ...base, args: { id: "0x1", currency0: TOKEN, currency1: "0x0000000000000000000000000000000000000001" } })).toBeNull();
  });
});

describe("pickPairs", () => {
  test("prefers the USDC pair, then the deepest one", () => {
    const best = pickPairs([
      { pairAddress: "weth", baseToken: { address: TOKEN }, quoteToken: { address: "0xweth" }, liquidity: { usd: 99999 } },
      { pairAddress: "usdc-small", baseToken: { address: TOKEN }, quoteToken: { address: USDC }, liquidity: { usd: 10 } },
      { pairAddress: "usdc-big", baseToken: { address: TOKEN }, quoteToken: { address: USDC }, liquidity: { usd: 500 } },
    ]);
    expect(best.get(TOKEN)?.pairAddress).toBe("usdc-big");
  });
});

describe("riskAlerts", () => {
  const next = (codes: string[], band: string, score: number) => ({
    flags: codes.map((code) => ({ code, text: code })),
    band,
    score,
  });
  test("fires once when liquidity is pulled and the score collapses", () => {
    const alerts = riskAlerts({ flags: [{ code: "INFO" }] }, next(["LP_REMOVED"], "risk", 1.9), "healthy");
    expect(alerts.map((a) => a.type)).toEqual(["RUG_PULL", "SCORE_DROP"]);
  });
  test("does not repeat a flag that was already there", () => {
    expect(riskAlerts({ flags: [{ code: "CREATOR_DUMP" }] }, next(["CREATOR_DUMP"], "risk", 3.9), "risk")).toEqual([]);
  });
  test("a pre-v3 score without flag codes doesn't trigger a false alert storm", () => {
    expect(riskAlerts({ flags: [{ code: undefined as unknown as string }] }, next(["CREATOR_DUMP"], "risk", 2.9), "risk")).toEqual([]);
  });
  test("no previous score means no alert", () => {
    expect(riskAlerts(null, next(["LP_REMOVED"], "risk", 1.9), null)).toEqual([]);
  });
});

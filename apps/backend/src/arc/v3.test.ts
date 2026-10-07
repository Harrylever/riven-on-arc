import { describe, expect, test } from "bun:test";
import { toDexPools, toPoolInit } from "./pool-indexer.service";
import { pickPairs } from "./market-sync.service";
import { launchLiquidityPulled, riskAlerts, usdcInRange } from "./scoring.service";

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
  test("treats native USDC (currency 0x0) as USDC", () => {
    const NATIVE = "0x0000000000000000000000000000000000000000";
    expect(toPoolInit({ ...base, args: { id: "0xP", currency0: NATIVE, currency1: TOKEN, hooks: "0x" } })?.token).toBe(TOKEN);
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

// Audit fixes (Oct 2026): pool USDC from on-chain liquidity, rugs judged on the launch position.
describe("usdcInRange", () => {
  test("full-range position at price 1 holds ~L/1 of currency0 (USDC here)", () => {
    // USDC (0x36…) sorts before TOKEN (0xf2…), so USDC is currency0.
    const usdc = usdcInRange(2n ** 96n, 1_000_000_000n, null, null, TOKEN);
    expect(usdc).toBeGreaterThan(999.99);
    expect(usdc).toBeLessThan(1000.01);
  });
  test("price above the range means the pool holds no currency0", () => {
    expect(usdcInRange(2n ** 96n, 1_000_000_000n, -600, 0, TOKEN)).toBe(0);
  });
  test("empty pool is zero, not negative", () => {
    expect(usdcInRange(0n, 5n, null, null, TOKEN)).toBe(0);
    expect(usdcInRange(2n ** 96n, 0n, null, null, TOKEN)).toBe(0);
  });
});

describe("launchLiquidityPulled", () => {
  const ev = (positionId: string | null, sender: string, d: number) => ({ positionId, sender, liquidityDelta: d });
  test("a third-party LP adding and removing a narrow range is not a rug", () => {
    expect(
      launchLiquidityPulled([ev("1", "0xpm", 1e18), ev("2", "0xpm", 5e19), ev("2", "0xpm", -5e19)], "1"),
    ).toBe(false);
  });
  test("the launch position being pulled is a rug", () => {
    expect(launchLiquidityPulled([ev("1", "0xpm", 1e18), ev("1", "0xpm", -9e17)], "1")).toBe(true);
  });
  test("without a known position id, judge whoever added the most", () => {
    expect(launchLiquidityPulled([ev(null, "0xdev", 1e18), ev(null, "0xlp", 1e16), ev(null, "0xdev", -1e18)], null)).toBe(true);
    expect(launchLiquidityPulled([ev(null, "0xdev", 1e18), ev(null, "0xlp", 1e16), ev(null, "0xlp", -1e16)], null)).toBe(false);
  });
});

describe("cleanText", () => {
  test("strips NUL and control characters that Postgres would reject", async () => {
    const { cleanText } = await import("./config");
    expect(cleanText("RUG\u0000COIN\n")).toBe("RUGCOIN");
    expect(cleanText("旺旺 ū")).toBe("旺旺 ū");
    expect(cleanText(null)).toBe("");
    expect(cleanText("x".repeat(500), 32)).toHaveLength(32);
  });
});

describe("X callouts", () => {
  test("extracts contract addresses and DexScreener Arc links", async () => {
    const { extractRefs } = await import("./callouts.service");
    const r = extractRefs("aping $ARCIA 0x18E691d9e0604682568d25941a9b7d55ff9cd77b lfg", [
      "https://dexscreener.com/arc/0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    ]);
    expect(r.addresses).toContain("0x18e691d9e0604682568d25941a9b7d55ff9cd77b");
    expect(r.pairs).toEqual(["0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"]);
  });
  test("splits long KOL lists into queries under X's length limit", async () => {
    const { buildQueries } = await import("./callouts.service");
    const qs = buildQueries(Array.from({ length: 60 }, (_, i) => `kol_handle_${i}`));
    expect(qs.length).toBeGreaterThan(1);
    for (const q of qs) expect(q.length).toBeLessThanOrEqual(512);
    expect(qs[0]).toContain("from:kol_handle_0");
  });
});

describe("toDexPools", () => {
  const word = (a: string) => a.slice(2).padStart(64, "0");
  const topic = (a: string) => `0x${word(a)}`;
  const POOL = "0x892ae3e86d393543b053eab6e5258c78d99b9f8f";
  test("decodes a Uniswap v3 PoolCreated (tickSpacing, pool)", () => {
    const log = {
      topics: ["0x783cca1c", topic(TOKEN), topic(USDC), topic("0xbb8")],
      data: `0x${word("0xc8")}${word(POOL)}`,
      blockNumber: 5n,
      transactionHash: "0xt",
    };
    expect(toDexPools(log, "uniswap-v3")).toEqual([
      { poolId: POOL, token: TOKEN, quote: USDC, hooks: "", blockNumber: 5n, txHash: "0xt", dex: "uniswap-v3" },
    ]);
  });
  test("lists both sides of a non-USDC pair", () => {
    const OTHER = "0x1111111111111111111111111111111111111111";
    const log = { topics: ["0x0d36", topic(TOKEN), topic(OTHER)], data: `0x${word(POOL)}${word("0x5")}`, blockNumber: 5n, transactionHash: "0xt" };
    expect(toDexPools(log, "arctide").map((p) => p.token)).toEqual([TOKEN, OTHER]);
  });
});

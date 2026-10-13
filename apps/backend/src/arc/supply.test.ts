import { describe, expect, test } from "bun:test";
import { formatUnits } from "viem";
import { MAX_STORABLE_SUPPLY, storableSupply } from "./config";

describe("storableSupply", () => {
  test("a normal supply is stored as it is", () => {
    expect(storableSupply("1000000000")).toBe("1000000000");
    expect(storableSupply("1234.5678")).toBe("1234.5678");
    expect(storableSupply("0")).toBe("0");
  });

  test("the largest value the column holds (35 digits) is kept", () => {
    expect(storableSupply("9".repeat(35))).toBe("9".repeat(35));
  });

  test("36 or more digits is capped instead of overflowing numeric(65,30)", () => {
    expect(storableSupply("1" + "0".repeat(35))).toBe(MAX_STORABLE_SUPPLY);
    expect(MAX_STORABLE_SUPPLY).toHaveLength(35);
  });

  test("a 2^256-1 supply with 0 decimals (the token that froze the indexer) is capped", () => {
    const display = formatUnits(2n ** 256n - 1n, 0);
    expect(display.length).toBe(78);
    expect(storableSupply(display)).toBe(MAX_STORABLE_SUPPLY);
  });

  test("a huge supply with decimals is judged on its whole-token part", () => {
    expect(storableSupply(formatUnits(2n ** 256n - 1n, 18))).toBe(MAX_STORABLE_SUPPLY);
    expect(storableSupply(formatUnits(10n ** 30n, 18))).toBe("1000000000000");
  });
});

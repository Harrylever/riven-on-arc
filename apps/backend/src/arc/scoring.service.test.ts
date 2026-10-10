import { describe, expect, test } from "bun:test";
import { interpretSwap } from "./activity-indexer.service";
import { authorityFromBytecode, cloneTarget, priceFromSqrt } from "./scoring.service";

// Real Argus launch (TOIIY, tx 0x6694a4c1…8af8): USDC is currency0, dev buy of 2500 USDC.
const TOIIY = "0x38b25f586f7324feee84dd96f48fb81e76708ba4";

describe("interpretSwap", () => {
  test("a dev buy pays USDC in and takes tokens out", () => {
    const view = interpretSwap(TOIIY, 18, -2_500_000_000n, 0x019d1c65a236d95eee8d8bbfn);
    expect(view.side).toBe("buy");
    expect(view.usdcAmount).toBe(2500);
    expect(Math.round(view.tokenAmount / 1e6)).toBe(499);
  });

  test("a sell is the mirror image", () => {
    const view = interpretSwap(TOIIY, 18, 1_000_000n, -(10n ** 24n));
    expect(view.side).toBe("sell");
    expect(view.usdcAmount).toBe(1);
    expect(view.tokenAmount).toBe(1_000_000);
  });
});

describe("native-USDC pools (18 decimals)", () => {
  const NATIVE = "0x0000000000000000000000000000000000000000";
  const TOKEN6 = "0xfba3438e3935e90cdb30a5fefe1a7321b5f4ef5a";
  test("a swap is read in 18 decimals, not 6", () => {
    // 2.5 USDC paid in (native wei), 1000 tokens (6 decimals) out
    const view = interpretSwap(TOKEN6, 6, -2_500_000_000_000_000_000n, 1_000_000_000n, NATIVE);
    expect(view.side).toBe("buy");
    expect(view.usdcAmount).toBeCloseTo(2.5);
    expect(view.tokenAmount).toBe(1000);
    expect(view.priceUsd).toBeCloseTo(0.0025);
  });
  test("native is always currency0, even for a token address that sorts below the ERC-20 USDC", () => {
    const LOW = "0x1000000000000000000000000000000000000001";
    const native = interpretSwap(LOW, 18, -1_000_000_000_000_000_000n, 5n * 10n ** 18n, NATIVE);
    expect(native.usdcAmount).toBeCloseTo(1);
    expect(native.side).toBe("buy");
    // the ERC-20 USDC sorts after this token, so there USDC is currency1
    const erc20 = interpretSwap(LOW, 18, 5n * 10n ** 18n, -1_000_000n);
    expect(erc20.usdcAmount).toBe(1);
    expect(erc20.side).toBe("buy");
  });
  test("price from sqrt uses the quote's decimals", () => {
    // 1 USDC (1e18 wei) = 1000 tokens (1e6 raw) -> raw ratio 1e-12 ... token1 per currency0
    const sqrt = BigInt(Math.round(Math.sqrt(1000e6 / 1e18) * 2 ** 96));
    const price = priceFromSqrt(sqrt, TOKEN6, 6, NATIVE);
    expect(price).toBeGreaterThan(0.00099);
    expect(price).toBeLessThan(0.00101);
  });
});

describe("priceFromSqrt", () => {
  test("matches the live TOIIY pool (~$0.0000025, ~$2.5k cap)", () => {
    const price = priceFromSqrt(50302338732118197629310017055385614571n, TOIIY, 18);
    expect(price * 1e9).toBeGreaterThan(2400);
    expect(price * 1e9).toBeLessThan(2560);
  });
});

describe("bytecode checks", () => {
  test("follows EIP-1167 clones", () => {
    expect(
      cloneTarget("0x363d3d373d3d3d363d731b74922c01ddfd9c77b37d02c0a236611e8fe5005af43d82803e903d91602b57fd5bf3"),
    ).toBe("0x1b74922c01ddfd9c77b37d02c0a236611e8fe500");
    expect(cloneTarget("0x6080604052")).toBeNull();
  });

  test("flags a mint selector and an upgradeable proxy", () => {
    const withMint = "0x6340c10f19"; // PUSH4 mint(address,uint256)
    expect(authorityFromBytecode(withMint, false).canMint).toBe(true);
    expect(authorityFromBytecode("0x60806040", true).upgradeable).toBe(true);
    expect(authorityFromBytecode("0x60806040", false)).toEqual({
      canMint: false,
      upgradeable: false,
      canRestrict: false,
      ownerSetsFee: false,
      launchpadLimits: false,
    });
  });
});

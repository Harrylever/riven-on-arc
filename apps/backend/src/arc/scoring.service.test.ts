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

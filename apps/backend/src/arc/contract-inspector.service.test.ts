import { describe, expect, test } from "bun:test";
import { findWatchedSelectors } from "./contract-inspector.service";

describe("findWatchedSelectors", () => {
  test("reports a watched selector found in contract bytecode", () => {
    expect(findWatchedSelectors("0x600040c10f19ff")).toContain(
      "mint(address,uint256)",
    );
  });

  test("does not infer watched capabilities when selectors are absent", () => {
    expect(findWatchedSelectors("0x6001600055")).toEqual([]);
  });
});

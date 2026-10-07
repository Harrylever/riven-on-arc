import { describe, expect, test } from "bun:test";
import { TelegramService, perpCoin } from "./telegram.service";

describe("perpCoin", () => {
  test("normalises exchange symbols to the tracked coin", () => {
    expect(perpCoin("BTCUSDT")).toBe("BTC");
    expect(perpCoin("eth-perp")).toBe("ETH");
    expect(perpCoin("SOL/USDT:USDT")).toBe("SOL");
    expect(perpCoin("1000PEPEUSDT")).toBe("1000PEPE");
  });
});

describe("TelegramService", () => {
  test("is a no-op without a bot token", async () => {
    const calls: string[] = [];
    const svc = new TelegramService("", (async (u: string) => {
      calls.push(u);
      return new Response("{}");
    }) as unknown as typeof fetch);
    expect(svc.enabled).toBe(false);
    expect(await svc.tick()).toEqual({ skipped: "TELEGRAM_BOT_TOKEN not set" });
    expect(calls).toHaveLength(0);
  });
});

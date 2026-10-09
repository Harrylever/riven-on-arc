import { beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "./app";
import type { Services } from "./container";

function stubServices() {
  const calls = { launch: 0, swap: 0, burn: 0 };
  const services = {
    launchIngest: { ingestHeliusTransactions: async () => void calls.launch++ },
    swapIngest: { ingestSwap: async () => void calls.swap++ },
    burnIngest: { ingestBurn: async () => void calls.burn++ },
    arcInspector: {
      health: async () => ({
        chainId: 5042,
        expectedChainId: 5042,
        chainMatches: true,
        blockNumber: "1",
        explorerUrl: "https://explorer.arc.io",
      }),
      inspect: async (address: string) =>
        address === "0x0000000000000000000000000000000000000001"
          ? { address }
          : null,
    },
    arcPipeline: {
      runOnce: async () => ({ launches: { head: "1", sources: [] } }),
    },
  } as unknown as Services;
  return { services, calls };
}

const SECRET = "test-secret";
const post = (
  app: ReturnType<typeof createApp>,
  body: string,
  auth: string | null = SECRET,
) =>
  app.request("/webhooks/helius", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
  });

beforeEach(() => {
  process.env.HELIUS_WEBHOOK_SECRET = SECRET;
  delete process.env.REDIS_URL;
  delete process.env.REDIS_HOST;
});

describe("webhook /webhooks/helius", () => {
  test("rejects missing or wrong auth header with 403", async () => {
    const { services, calls } = stubServices();
    const app = createApp(services);
    expect((await post(app, "[]", null)).status).toBe(403);
    expect((await post(app, "[]", "wrong")).status).toBe(403);
    expect(calls).toEqual({ launch: 0, swap: 0, burn: 0 });
  });

  test("rejects everything when the server secret is unset", async () => {
    delete process.env.HELIUS_WEBHOOK_SECRET;
    const app = createApp(stubServices().services);
    expect((await post(app, "[]", "")).status).toBe(403);
  });

  test("invalid JSON is a 400, not a 500", async () => {
    const app = createApp(stubServices().services);
    expect((await post(app, "{not json")).status).toBe(400);
  });

  test("routes by type: swaps, creates and burns", async () => {
    const { services, calls } = stubServices();
    const app = createApp(services);
    const res = await post(
      app,
      JSON.stringify([
        { type: "SWAP" },
        { type: "SWAP" },
        { type: "CREATE" },
        { type: "BURN" },
      ]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 4, swaps: 2, other: 2 });
    // creates exclude BURN; swaps handled individually; burn sees every non-swap
    expect(calls).toEqual({ launch: 1, swap: 2, burn: 2 });
  });

  test("accepts a single object payload", async () => {
    const app = createApp(stubServices().services);
    const res = await post(app, JSON.stringify({ type: "SWAP" }));
    expect(await res.json()).toEqual({ received: 1, swaps: 1, other: 0 });
  });
});

describe("rate limiting", () => {
  test("429 after 100 requests per IP; other IPs unaffected", async () => {
    const app = createApp(stubServices().services);
    const hit = (ip: string) =>
      app.request("/", { headers: { "x-forwarded-for": ip } });
    for (let i = 0; i < 100; i++)
      expect((await hit("1.1.1.1")).status).toBe(200);
    const blocked = await hit("1.1.1.1");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    expect((await hit("2.2.2.2")).status).toBe(200);
  });

  test("webhook and /health are exempt", async () => {
    const app = createApp(stubServices().services);
    const ip = { "x-forwarded-for": "3.3.3.3" };
    for (let i = 0; i < 105; i++) {
      const res = await app.request("/webhooks/helius", {
        method: "POST",
        body: "[]",
        headers: { authorization: SECRET, ...ip },
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("Arc read-only endpoints", () => {
  test("reports Arc chain health", async () => {
    const app = createApp(stubServices().services);
    const response = await app.request("/arc/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      chainId: 5042,
      chainMatches: true,
    });
  });

  test("protects the Arc index tick with CRON_SECRET", async () => {
    process.env.CRON_SECRET = "arc-cron-secret";
    const app = createApp(stubServices().services);
    expect((await app.request("/api/cron/index")).status).toBe(401);
    const response = await app.request("/api/cron/index", {
      headers: { authorization: "Bearer arc-cron-secret" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      launches: { head: "1", sources: [] },
    });
    delete process.env.CRON_SECRET;
  });

  test("rejects invalid EVM addresses and returns 404 for contracts without code", async () => {
    const app = createApp(stubServices().services);
    expect(
      (await app.request("/arc/tokens/not-an-address/inspect")).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          "/arc/tokens/0x0000000000000000000000000000000000000002/inspect",
        )
      ).status,
    ).toBe(404);
  });
});

import { Hono } from "hono";
import { getDb } from "@clawdex/shared";
import type { Services } from "./container";
import { createRateLimiter } from "./lib/rate-limit";
import { isAddress } from "viem";

interface HeliusTransaction {
  type?: string;
  source?: string;
  [key: string]: unknown;
}

/** Paths exempt from rate limiting: uptime checks hit /health by design, and
 * dropping a burst of authed Helius events would silently lose chain data. */
const UNTHROTTLED = new Set(["/health", "/webhooks/helius"]);

export function createApp(s: Services) {
  const app = new Hono();
  const limiter = createRateLimiter();

  app.use("*", (c, next) =>
    UNTHROTTLED.has(c.req.path) ? next() : limiter(c, next),
  );

  app.get("/", (c) => c.json({ service: "clawdex-backend", status: "ok" }));

  app.get("/health", async (c) => {
    try {
      const db = getDb();

      // Staleness visibility from timestamps every table already has.
      // ScoringService runs every 5 min; 15 min gives margin for a couple of
      // missed cycles before a token counts as stale here.
      const [totalTokens, freshlyScored] = await Promise.all([
        db.token.count(),
        db.token.count({
          where: {
            scoreRuns: {
              some: {
                calculatedAt: { gte: new Date(Date.now() - 15 * 60_000) },
              },
            },
          },
        }),
      ]);

      return c.json({
        status: "ok",
        db: "connected",
        service: "clawdex-execution",
        dataFreshness: {
          totalTokens,
          scoredInLast15Min: freshlyScored,
          staleTokens: totalTokens - freshlyScored,
        },
      });
    } catch (err) {
      // Never echo driver errors: they can carry the DB host and user.
      console.error(`[health] ${(err as Error).message}`);
      return c.json({ status: "degraded", db: "unreachable" });
    }
  });

  app.get("/arc/health", async (c) => {
    try {
      const result = await s.arcInspector.health();
      if (!result.chainMatches) {
        return c.json({ status: "wrong_chain", ...result }, 503);
      }
      return c.json({ status: "ok", ...result });
    } catch (err) {
      console.error(`[arc] health check failed: ${(err as Error).message}`);
      // viem errors embed the RPC URL (and any API key in it): log, don't return.
      return c.json({ status: "unavailable" }, 503);
    }
  });

  app.get("/api/cron/index", async (c) => {
    const expected = process.env.CRON_SECRET;
    if (!expected || c.req.header("authorization") !== `Bearer ${expected}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      return c.json(await s.arcPipeline.runOnce());
    } catch (err) {
      console.error(`[arc] pipeline failed: ${(err as Error).message}`);
      return c.json({ error: "Arc pipeline failed" }, 503);
    }
  });

  app.get("/arc/tokens/:address/inspect", async (c) => {
    const address = c.req.param("address");
    if (!isAddress(address)) {
      return c.json({ error: "Invalid EVM address" }, 400);
    }
    try {
      const result = await s.arcInspector.inspect(address);
      if (!result) return c.json({ error: "No contract code at address" }, 404);
      return c.json(result);
    } catch (err) {
      if (err instanceof TypeError) {
        return c.json({ error: err.message }, 400);
      }
      console.error(
        `[arc] inspect ${address} failed: ${(err as Error).message}`,
      );
      return c.json({ error: "Arc RPC inspection failed" }, 503);
    }
  });

  /**
   * Receives Helius "enhanced" webhook payloads watching the pump.fun and
   * Raydium LaunchLab program IDs (see @clawdex/shared's PROGRAM_IDS). One
   * combined webhook covers launch detection (phase 1), swap ingestion
   * (phase 2), and burn ingestion (phase 3) — routed here by `type`.
   *
   * BurnIngestService is called on every non-swap transaction, not just
   * `type: "BURN"` ones — an incinerator-address transfer is a real burn
   * signal too, and typically shows up as a different type (e.g. TRANSFER).
   * It no-ops internally unless the transaction matches a burn signal.
   *
   * Register the webhook via Helius's Create Webhook API — see
   * fixtures/helius-webhook-samples/README.md.
   */
  app.post("/webhooks/helius", async (c) => {
    const expected = process.env.HELIUS_WEBHOOK_SECRET;
    if (!expected || c.req.header("authorization") !== expected) {
      return c.json(
        {
          message: "Invalid or missing webhook auth header",
          error: "Forbidden",
          statusCode: 403,
        },
        403,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { message: "Invalid JSON body", error: "Bad Request", statusCode: 400 },
        400,
      );
    }

    const transactions = (
      Array.isArray(body) ? body : [body]
    ) as HeliusTransaction[];

    const swaps = transactions.filter((tx) => tx.type === "SWAP");
    const notSwap = transactions.filter((tx) => tx.type !== "SWAP");
    const potentialCreates = notSwap.filter((tx) => tx.type !== "BURN");

    if (potentialCreates.length > 0) {
      await s.launchIngest.ingestHeliusTransactions(potentialCreates as never, {
        defaultLaunchpad: "PUMPFUN",
      });
    }

    for (const tx of swaps) {
      await s.swapIngest.ingestSwap(tx as never, "PUMPFUN_CURVE");
    }

    for (const tx of notSwap) {
      await s.burnIngest.ingestBurn(tx as never);
    }

    return c.json({
      received: transactions.length,
      swaps: swaps.length,
      other: notSwap.length,
    });
  });

  app.onError((err, c) => {
    console.error(
      `[http] ${c.req.method} ${c.req.path} failed: ${err.message}`,
    );
    return c.json({ statusCode: 500, message: "Internal server error" }, 500);
  });

  return app;
}

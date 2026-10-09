import type { MiddlewareHandler } from 'hono';
import { Redis } from 'ioredis';
import { getRedisConnectionParams } from '@clawdex/shared';

/**
 * Fixed-window rate limiter, 100 req / 60s per client IP (same budget the
 * NestJS ThrottlerModule had). Redis-backed when REDIS_URL / REDIS_HOST+PORT
 * is set (correct across multiple instances); in-memory otherwise (fine for
 * the single-instance deploy this is today). Fails OPEN if Redis errors:
 * dropping legitimate traffic because the limiter's store is down is worse
 * than briefly not limiting.
 */
const WINDOW_SECONDS = 60;
const LIMIT = 100;

export function createRateLimiter(): MiddlewareHandler {
  const params = getRedisConnectionParams();
  const redis = params ? new Redis(params) : null;
  const memory = new Map<string, { count: number; resetAt: number }>();

  async function hit(key: string): Promise<number> {
    if (redis) {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, WINDOW_SECONDS);
      return count;
    }
    const now = Date.now();
    const entry = memory.get(key);
    if (!entry || entry.resetAt <= now) {
      // Opportunistic cleanup so the map can't grow without bound.
      if (memory.size > 10_000) {
        for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
      }
      memory.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
      return 1;
    }
    return ++entry.count;
  }

  return async (c, next) => {
    // The first X-Forwarded-For hop is whatever the client claims; the last hop
    // is the one Railway's proxy appended, so key on that.
    const hops = c.req.header('x-forwarded-for')?.split(',').map((h) => h.trim()).filter(Boolean) ?? [];
    const ip = hops[hops.length - 1] || c.req.header('x-real-ip') || 'unknown';
    try {
      if ((await hit(ip)) > LIMIT) {
        c.header('Retry-After', String(WINDOW_SECONDS));
        return c.json({ statusCode: 429, message: 'Too Many Requests' }, 429);
      }
    } catch {
      // fail open — see note above
    }
    await next();
  };
}

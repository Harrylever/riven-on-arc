import { Redis } from "ioredis";
import { getRedisConnectionParams } from "./config.js";

let client: Redis | undefined;

/**
 * Lazy singleton, same pattern as getDb(). Returns null (not a thrown
 * error) when Redis isn't configured — callers decide whether that's fine
 * to degrade past (e.g. skip caching) or worth failing loudly over.
 */
export function getRedisClient(): Redis | null {
  if (client) return client;

  const params = getRedisConnectionParams();
  if (!params) return null;

  client = new Redis(params);
  return client;
}

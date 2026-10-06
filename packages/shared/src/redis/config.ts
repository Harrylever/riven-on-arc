import type { ConfigService } from "@nestjs/config";

export type RedisConnectionParams = {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  maxRetriesPerRequest: number | null | undefined;
  tls?: { rejectUnauthorized: boolean };
};

/**
 * Single source of truth for parsing REDIS_URL into connection params.
 * ThrottlerModule and any future cache/queue layer should all call this
 * instead of each re-implementing their own URL parsing / TLS detection —
 * that duplication is what lets a redis: vs rediss: bug ship in one place
 * but not another.
 *
 * Returns null when Redis isn't configured at all (neither REDIS_URL nor
 * REDIS_HOST+REDIS_PORT set) — callers should treat that as "fall back to
 * whatever non-Redis default makes sense" (e.g. ThrottlerModule falls back
 * to its built-in in-memory store), not as an error.
 */
export const getRedisConnectionParams = (
  config?: ConfigService,
): RedisConnectionParams | null => {
  const getEnv = (key: string) =>
    config ? config.get<string>(key) : process.env[key];

  const redisUrl = getEnv("REDIS_URL");
  const redisHost = getEnv("REDIS_HOST");
  const redisPort = getEnv("REDIS_PORT");

  const hostPortFallback = (): RedisConnectionParams | null => {
    if (!redisHost || !redisPort) return null;
    return {
      host: redisHost,
      port: Number(redisPort),
      maxRetriesPerRequest: null,
    };
  };

  if (!redisUrl) {
    return hostPortFallback();
  }

  try {
    const parsed = new URL(redisUrl);
    const options: RedisConnectionParams = {
      url: redisUrl,
      host: parsed.hostname || "localhost",
      port: parsed.port ? Number(parsed.port) : Number(redisPort) || 6379,
      maxRetriesPerRequest: null,
    };

    if (parsed.username) options.username = decodeURIComponent(parsed.username);
    if (parsed.password) options.password = decodeURIComponent(parsed.password);
    if (parsed.protocol === "rediss:") {
      options.tls = { rejectUnauthorized: true };
    }

    return options;
  } catch (error) {
    // Genuinely fall back here, matching what this message says — the
    // original version of this helper logged this but then re-threw,
    // crashing the app instead of falling back as promised. Fixed.
    console.error(
      "Failed to parse REDIS_URL, falling back to individual env variables:",
      error,
    );
    return hostPortFallback();
  }
};

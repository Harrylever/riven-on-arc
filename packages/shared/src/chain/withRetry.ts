/**
 * Wraps a flaky RPC call with a couple of quick retries before giving up —
 * for genuinely transient blips (a timeout, a momentary 5xx), not for
 * malformed requests or auth failures, which will just fail the same way
 * every time. Callers still see the last error if all attempts fail; the
 * calling service's own per-item try/catch (see the *-checker/*-service
 * files in apps/backend) is what actually skips that one item and moves on
 * for the current cycle — this only reduces how often that happens.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, delayMs = 300 }: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

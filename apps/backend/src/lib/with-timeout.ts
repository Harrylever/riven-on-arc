export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${Math.round(ms / 1000)}s (it may still be running in the background)`);
    this.name = "TimeoutError";
  }
}

/**
 * Settles with `work` or rejects after `ms`, whichever comes first. A promise cannot be cancelled, so a hung
 * `work` keeps running; what this guarantees is that the caller stops waiting for it. The scheduler's `protect`
 * flag skips a tick while the previous run is unfinished, so without this one hung call stops every later run.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

// Server-only. Tiny in-process cache for heavy reads: fresh for `ttlMs`, then
// served stale while one background refresh runs (stale-while-revalidate), and
// concurrent callers share a single in-flight query. Keeps pages fast without
// changing what they show by more than a few seconds.
//
// `shared: true` also stores the result in Next's data cache, which every serverless instance
// reads. The in-process map alone saves little on Vercel (each instance has its own), and every
// miss is a query that sends rows out of the database, which Railway bills by the gigabyte.
// Only values that survive JSON (strings, numbers, plain objects) may be shared.

import { unstable_cache } from "next/cache"

interface Entry<T> {
  value?: T
  at: number
  inflight?: Promise<T>
}
const store = new Map<string, Entry<unknown>>()
const MAX_KEYS = 500

/** Reads through Next's data cache. A failed load is never cached; outside Next (tests, scripts) it just loads. */
async function viaDataCache<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  let ran = false
  try {
    return await unstable_cache(
      async () => {
        ran = true
        return load()
      },
      ["riven", key],
      { revalidate: Math.max(1, Math.round(ttlMs / 1000)) },
    )()
  } catch (err) {
    if (ran) throw err
    return load()
  }
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loadFresh: () => Promise<T>,
  opts: { shared?: boolean } = {},
): Promise<T> {
  const load = opts.shared ? () => viaDataCache(key, ttlMs, loadFresh) : loadFresh
  const now = Date.now()
  let e = store.get(key) as Entry<T> | undefined
  if (!e) {
    if (store.size >= MAX_KEYS) store.delete(store.keys().next().value!)
    e = { at: 0 }
    store.set(key, e)
  }
  const refresh = () => {
    e!.inflight ??= load()
      .then((v) => {
        e!.value = v
        e!.at = Date.now()
        return v
      })
      .finally(() => {
        e!.inflight = undefined
      })
    return e!.inflight
  }
  if (e.value !== undefined) {
    if (now - e.at > ttlMs) void refresh().catch(() => {}) // stale: answer now, refresh behind
    return e.value
  }
  return refresh()
}

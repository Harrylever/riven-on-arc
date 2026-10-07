// Server-only. Tiny in-process cache for heavy reads: fresh for `ttlMs`, then
// served stale while one background refresh runs (stale-while-revalidate), and
// concurrent callers share a single in-flight query. Keeps pages fast without
// changing what they show by more than a few seconds.

interface Entry<T> {
  value?: T
  at: number
  inflight?: Promise<T>
}
const store = new Map<string, Entry<unknown>>()
const MAX_KEYS = 500

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
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

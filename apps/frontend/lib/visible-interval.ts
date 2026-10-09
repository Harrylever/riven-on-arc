/**
 * Poll `fn` every ~`ms` (±10% so open tabs don't fire in lockstep) while the tab
 * is visible. When the tab is hidden the timer stops; on return, `fn` runs at once
 * if it is already stale, then the schedule resumes. Returns a cleanup function.
 *
 * `whileHidden: true` keeps polling in background tabs (for alerts that must not
 * wait for the user to come back).
 */
export function visibleInterval(
  fn: () => void,
  ms: number,
  opts: { whileHidden?: boolean } = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = Date.now()
  let stopped = false
  const visible = () => document.visibilityState === "visible"

  const schedule = () => {
    if (stopped) return
    clearTimeout(timer)
    if (!opts.whileHidden && !visible()) return
    timer = setTimeout(run, ms * (0.9 + Math.random() * 0.2))
  }
  const run = () => {
    if (stopped) return
    last = Date.now()
    fn()
    schedule()
  }
  const onVisibility = () => {
    if (stopped) return
    if (visible() && Date.now() - last >= ms) run()
    else schedule()
  }

  document.addEventListener("visibilitychange", onVisibility)
  schedule()
  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener("visibilitychange", onVisibility)
  }
}

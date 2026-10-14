/** Shown while the token list loads, so opening Trending shows the page's shape straight away. */
export default function Loading() {
  const bar = "animate-pulse rounded bg-white/[0.06]"
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading tokens">
      <div>
        <div className={`${bar} h-7 w-56`} />
        <div className={`${bar} mt-2 h-3.5 w-72 max-w-full opacity-70`} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[62px] animate-pulse rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-white/[0.03]" />
        ))}
      </div>
      <div className="flex gap-2">
        <div className={`${bar} h-9 w-64`} />
        <div className={`${bar} hidden h-9 w-24 sm:block`} />
        <div className={`${bar} hidden h-9 w-24 sm:block`} />
      </div>
      <div className="rv-card divide-y divide-[var(--rv-stroke)] overflow-hidden">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className={`${bar} size-9 rounded-full`} />
            <div className="flex-1 space-y-1.5">
              <div className={`${bar} h-3 w-24`} />
              <div className={`${bar} h-2.5 w-44 opacity-70`} />
            </div>
            <div className={`${bar} h-3 w-16`} />
          </div>
        ))}
      </div>
    </div>
  )
}

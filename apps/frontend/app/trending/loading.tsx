import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

/** Shown while the token list loads, so opening Trending shows the page's shape straight away. */
export default function Loading() {
  const bar = "rounded bg-white/[0.06]"
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Loading tokens"
    >
      <div>
        <Skeleton className={`${bar} h-7 w-56`} />
        <Skeleton className={`${bar} mt-2 h-3.5 w-72 max-w-full opacity-70`} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton
            key={i}
            className="h-[62px] rounded-[var(--rv-radius)] border border-[var(--rv-stroke)] bg-white/[0.03]"
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Skeleton className={`${bar} h-9 w-64`} />
        <Skeleton className={`${bar} hidden h-9 w-24 sm:block`} />
        <Skeleton className={`${bar} hidden h-9 w-24 sm:block`} />
      </div>
      <Card
        variant="riven"
        className="divide-y divide-[var(--rv-stroke)] overflow-hidden"
      >
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className={`${bar} size-9 rounded-full`} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className={`${bar} h-3 w-24`} />
              <Skeleton className={`${bar} h-2.5 w-44 opacity-70`} />
            </div>
            <Skeleton className={`${bar} h-3 w-16`} />
          </div>
        ))}
      </Card>
    </div>
  )
}

import { Skeleton } from "@/components/ui/skeleton"

/** Same silhouette as the token page so nothing jumps when data lands. */
export default function TokenLoading() {
  const block =
    "rounded-[var(--rv-radius)] bg-white/[0.04] ring-1 ring-[var(--rv-stroke)]"
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading token"
    >
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-16 rounded-[30%] bg-white/[0.06]" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-36 rounded-lg bg-white/[0.06]" />
          <Skeleton className="h-4 w-52 rounded-lg bg-white/[0.04]" />
        </div>
      </div>
      <Skeleton className={`${block} h-[290px]`} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className={`${block} h-[68px]`} />
        ))}
      </div>
      <Skeleton className={`${block} h-[220px]`} />
    </div>
  )
}

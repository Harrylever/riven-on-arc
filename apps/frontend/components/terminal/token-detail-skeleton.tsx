import { Skeleton } from "@/components/ui/skeleton"

/** Matches DetailPanel's loaded shape: header, price row, chart, track-record card, tabs. */
export function TokenDetailSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 rounded-none border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:p-6">
        <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
          <Skeleton className="size-11 rounded-none" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-1.5 h-3 w-24" />
          </div>
          <Skeleton className="size-10 rounded-none" />
        </div>
        <div className="flex items-end justify-between">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-64 w-full rounded-none" />
        <Skeleton className="h-28 w-full rounded-none" />
        <div className="flex gap-4 border-b border-[var(--border)]">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-40 w-full rounded-none" />
        <Skeleton className="h-14 w-full rounded-none" />
      </div>
    </div>
  )
}

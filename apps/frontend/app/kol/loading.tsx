import { Skeleton } from "@/components/ui/skeleton"

export default function KolLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-none border border-[var(--border)]">
        <div className="flex gap-6 bg-[var(--surface-sunken)] px-3 py-2.5">
          {["KOL", "Side", "Token", "SOL", "Mcap", "When"].map((h) => (
            <Skeleton key={h} className="h-3 w-12" />
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="flex items-center gap-6 border-t border-[var(--border)] px-3 py-3"
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

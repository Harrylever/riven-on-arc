import { Skeleton } from "@/components/ui/skeleton"

export default function AgentLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Skeleton className="h-6 w-44 rounded-none" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex h-[580px] flex-col overflow-hidden rounded-none border border-[var(--border)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <Skeleton className="h-12 w-2/3 self-start rounded-none" />
            <Skeleton className="h-8 w-1/3 self-end rounded-none" />
            <Skeleton className="h-16 w-3/4 self-start rounded-none" />
          </div>
          <div className="border-t border-[var(--border)] p-3">
            <Skeleton className="h-10 w-full rounded-none" />
          </div>
        </div>
        <Skeleton className="h-[580px] w-full rounded-none" />
      </div>
    </div>
  )
}

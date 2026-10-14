import { Skeleton } from "@/components/ui/skeleton"

/** Feed-shaped skeleton: keeps the shell and layout steady while scores load. */
export default function HomeLoading() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading launches"
    >
      <Skeleton className="h-[300px] rounded-[var(--rv-radius)] bg-white/[0.04] ring-1 ring-[var(--rv-stroke)]" />
      <Skeleton className="h-[52px] rounded-[var(--rv-radius)] bg-white/[0.04]" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton
          key={i}
          className="h-[92px] rounded-[var(--rv-radius)] bg-white/[0.035] ring-1 ring-[var(--rv-stroke)]"
        />
      ))}
    </div>
  )
}

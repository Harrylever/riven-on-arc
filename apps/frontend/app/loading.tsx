/** Feed-shaped skeleton: keeps the shell and layout steady while scores load. */
export default function HomeLoading() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading launches"
    >
      <div className="h-[300px] animate-pulse rounded-[var(--rv-radius)] bg-white/[0.04] ring-1 ring-[var(--rv-stroke)]" />
      <div className="h-[52px] animate-pulse rounded-[var(--rv-radius)] bg-white/[0.04]" />
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="h-[92px] animate-pulse rounded-[var(--rv-radius)] bg-white/[0.035] ring-1 ring-[var(--rv-stroke)]"
        />
      ))}
    </div>
  )
}

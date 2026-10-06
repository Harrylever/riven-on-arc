export default function EcosystemLoading() {
  const block = "animate-pulse rounded-[var(--rv-radius)] bg-white/[0.04] ring-1 ring-[var(--rv-stroke)]"
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading ecosystem">
      <div className="h-14 w-64 animate-pulse rounded-lg bg-white/[0.05]" />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${block} h-[210px]`} />
        ))}
      </div>
      <div className={`${block} h-[300px]`} />
    </div>
  )
}

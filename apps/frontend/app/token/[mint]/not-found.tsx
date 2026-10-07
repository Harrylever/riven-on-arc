import Link from "next/link"

export default function TokenNotFound() {
  return (
    <div className="rv-card mx-auto mt-6 flex max-w-md flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="text-4xl" aria-hidden>
        🔭
      </span>
      <h1 className="text-xl font-bold text-[var(--rv-ink)]">
        Riven isn&apos;t tracking this token
      </h1>
      <p className="text-sm text-[var(--rv-ink-2)]">
        Riven scores every token launched on Argus and Tolly on Arc. This
        address wasn&apos;t launched there, or it&apos;s not a valid Arc token
        address.
      </p>
      <div className="mt-2 flex gap-2">
        <Link
          href="/search"
          className="rounded-full bg-[var(--rv-blue)] px-4 py-2 text-sm font-semibold text-[var(--rv-on-blue)]"
        >
          Search again
        </Link>
        <Link
          href="/"
          className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--rv-ice)] ring-1 ring-[var(--rv-stroke-strong)]"
        >
          All launches
        </Link>
      </div>
    </div>
  )
}

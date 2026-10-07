"use client"

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="rv-card mx-auto my-10 w-full max-w-lg px-6 py-10 text-center">
      <p className="text-lg font-bold text-[var(--rv-ink)]">
        Something went wrong on this page
      </p>
      <p className="mt-2 text-sm text-[var(--rv-ink-2)]">
        Riven couldn&apos;t load this right now — usually the Arc RPC or the
        database blinked. Try again in a moment.
      </p>
      {error.digest && (
        <p className="rv-num mt-2 text-[11px] text-[var(--rv-ink-3)]">
          Ref {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 rounded-lg bg-[var(--rv-blue)] px-4 py-2 text-sm font-semibold text-[var(--rv-on-blue)]"
      >
        Try again
      </button>
    </div>
  )
}

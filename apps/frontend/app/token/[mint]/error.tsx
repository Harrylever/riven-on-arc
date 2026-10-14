"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function TokenError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="rv-card mx-auto my-10 w-full max-w-lg px-6 py-10 text-center">
      <p className="text-lg font-bold text-[var(--rv-ink)]">
        Couldn&apos;t load this token
      </p>
      <p className="mt-2 text-sm text-[var(--rv-ink-2)]">
        Riven couldn&apos;t read this token&apos;s data right now. Its score
        hasn&apos;t changed — try again in a moment.
      </p>
      {error.digest && (
        <p className="rv-num mt-2 text-[11px] text-[var(--rv-ink-3)]">
          Ref {error.digest}
        </p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <Button
          variant="plain"
          size="bare"
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-[var(--rv-blue)] px-4 py-2 text-sm font-semibold text-[var(--rv-on-blue)]"
        >
          Try again
        </Button>
        <Link
          href="/"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--rv-ink-2)] ring-1 ring-[var(--rv-stroke)]"
        >
          Back to tokens
        </Link>
      </div>
    </div>
  )
}

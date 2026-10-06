"use client"

import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export default function TokenError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <Alert variant="destructive">
        <AlertTitle className="font-heading uppercase">
          Failed to load token
        </AlertTitle>
        <AlertDescription className="mt-2 text-xs">
          {error.message ||
            "An unexpected error occurred while loading token details."}
        </AlertDescription>
      </Alert>

      <div className="mt-6 flex items-center justify-center gap-3">
        <Button size="sm" variant="default" onClick={() => reset()}>
          Try Again
        </Button>
        <Link href="/">
          <Button size="sm" variant="outline">
            Back to Feed
          </Button>
        </Link>
      </div>
    </div>
  )
}

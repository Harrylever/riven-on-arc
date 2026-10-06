"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export default function FeedError({
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
          Feed Unavailable
        </AlertTitle>
        <AlertDescription className="mt-2 text-xs">
          {error.message ||
            "Failed to retrieve the latest token intelligence feed."}
        </AlertDescription>
      </Alert>

      <div className="mt-6 flex justify-center">
        <Button size="sm" variant="default" onClick={() => reset()}>
          Reload Feed
        </Button>
      </div>
    </div>
  )
}

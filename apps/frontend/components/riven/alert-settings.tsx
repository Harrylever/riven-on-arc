"use client"

import { useEffect, useState } from "react"
import { useWatchlist } from "@/hooks/use-watchlist"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

/** Turns on browser notifications for anti-rug alerts on watchlisted tokens. */
export function AlertSettings() {
  const { mints } = useWatchlist()
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    "default",
  )
  useEffect(() => {
    setPerm(
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
    )
  }, [])
  return (
    <Card
      variant="riven"
      className="flex flex-wrap items-center gap-3 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[var(--rv-ink)]">
          Watchlist alerts
        </p>
        <p className="text-[12px] text-[var(--rv-ink-2)]">
          {mints.length === 0
            ? "Star tokens in the screener and Riven will warn you the moment one of them gets rugged."
            : `Watching ${mints.length} token${mints.length > 1 ? "s" : ""}. Alerts pop up while Riven is open.`}
        </p>
      </div>
      {perm === "unsupported" ? (
        <span className="text-[12px] text-[var(--rv-ink-3)]">
          Notifications not supported in this browser
        </span>
      ) : perm === "granted" ? (
        <span className="text-[12px] font-semibold text-[var(--rv-healthy)]">
          Notifications on
        </span>
      ) : (
        <Button
          variant="plain"
          size="bare"
          type="button"
          onClick={() => Notification.requestPermission().then(setPerm)}
          className="rounded-lg bg-[var(--rv-blue)] px-4 py-2 text-[13px] font-semibold text-[var(--rv-on-blue)]"
        >
          Turn on notifications
        </Button>
      )}
    </Card>
  )
}

"use client"

import { useEffect, useRef } from "react"
import { toast } from "@/components/ui/toast"
import { useWatchlist } from "@/hooks/use-watchlist"

const SEEN_KEY = "riven_seen_alerts_v1"

interface Alert {
  id: string
  type: string
  message: string
  token: { address: string; symbol: string }
}

/**
 * Anti-rug watcher: while Riven is open, polls alerts for watchlisted tokens
 * and warns once per alert — in-app toast plus a browser notification if allowed.
 */
export function RugWatcher() {
  const { mints } = useWatchlist()
  const key = mints.join(",")
  // Tokens whose existing alerts have been recorded. A newly watched token's
  // history is recorded silently on its first poll, so only new alerts toast.
  const baselined = useRef(new Set<string>())

  useEffect(() => {
    if (!key) return
    let alive = true
    const seen = new Set<string>()
    try {
      for (const id of JSON.parse(
        localStorage.getItem(SEEN_KEY) ?? "[]",
      ) as string[])
        seen.add(id)
    } catch {}
    const check = async () => {
      try {
        const res = await fetch(`/api/arc/alerts?addresses=${key}`)
        if (!res.ok) return
        const { alerts } = (await res.json()) as { alerts: Alert[] }
        if (!alive) return
        const fresh = alerts.filter((a) => !seen.has(a.id))
        fresh.forEach((a) => seen.add(a.id))
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-500)))
        } catch {}
        const known = baselined.current
        const toWarn = fresh.filter((a) =>
          known.has(a.token.address.toLowerCase()),
        )
        for (const m of key.split(",")) known.add(m.toLowerCase())
        for (const a of toWarn) {
          const title = `${a.token.symbol}: ${a.message}`
          toast.add({
            title: `Rug alert · ${a.token.symbol}`,
            description: a.message,
            type: "error",
          })
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            new Notification("Riven rug alert", { body: title, tag: a.id })
          }
        }
      } catch {}
    }
    check()
    const id = setInterval(check, 45_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [key])
  return null
}

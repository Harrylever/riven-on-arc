"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useWatchlist } from "@/hooks/use-watchlist"
import { usePerpWatch } from "@/hooks/use-perp-watch"
import { Checkbox } from "@/components/ui/checkbox"
import { RV_CHECK } from "@/components/riven/card-style"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const DEVICE_KEY = "riven_device_v1"
const ALL_CALLS_KEY = "riven_tg_all_calls_v1"

interface Status {
  enabled: boolean
  linked: boolean
  username: string | null
  url: string | null
}

/** This browser's random id: lets Telegram alerts follow its watchlist without an account. */
function deviceKey(): string {
  try {
    const have = localStorage.getItem(DEVICE_KEY)
    if (have && /^[A-Za-z0-9_-]{16,64}$/.test(have)) return have
    const fresh = crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem(DEVICE_KEY, fresh)
    return fresh
  } catch {
    return crypto.randomUUID().replace(/-/g, "")
  }
}

function TelegramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="currentColor"
      aria-hidden
    >
      <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.4 11.6c-1-.3-1.1-1 .2-1.5L20.5 2.8c.9-.3 1.7.2 1.4 1.5z" />
    </svg>
  )
}

/**
 * "Connect Telegram": opens Riven's bot with a one-time code; once the user
 * presses Start, their starred tokens (rug alerts) and tracked perp pairs
 * (Riven Scanner calls) are pinged to that chat. Hidden when no bot is configured.
 */
export function TelegramConnect({ compact = false }: { compact?: boolean }) {
  const { mints } = useWatchlist()
  const { pairs } = usePerpWatch()
  const [status, setStatus] = useState<Status | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [allCalls, setAllCalls] = useState(false)
  const key = useRef<string>("")

  useEffect(() => {
    key.current = deviceKey()
    try {
      setAllCalls(localStorage.getItem(ALL_CALLS_KEY) === "1")
    } catch {}
    fetch(`/api/telegram/link?deviceKey=${key.current}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => s && setStatus(s))
      .catch(() => {})
  }, [])

  const sync = useCallback(
    () =>
      fetch("/api/telegram/watch", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceKey: key.current,
          tokens: mints,
          perps: allCalls ? ["*", ...pairs] : pairs,
        }),
      }).catch(() => {}),
    [mints, pairs, allCalls],
  )

  // Keep the chat's watch list in step with the stars on this device.
  useEffect(() => {
    if (!status?.linked) return
    const id = window.setTimeout(() => void sync(), 600)
    return () => window.clearTimeout(id)
  }, [status?.linked, sync])

  // After "Connect", wait for the user to press Start in Telegram.
  useEffect(() => {
    if (!waiting) return
    const started = Date.now()
    const id = window.setInterval(async () => {
      const s: Status | null = await fetch(
        `/api/telegram/link?deviceKey=${key.current}`,
        { cache: "no-store" },
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      if (s?.linked || Date.now() - started > 180_000) {
        if (s) setStatus(s)
        setWaiting(false)
      }
    }, 3000)
    return () => window.clearInterval(id)
  }, [waiting])

  if (!status?.enabled) return null

  const connect = async () => {
    const s: Status | null = await fetch("/api/telegram/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceKey: key.current }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    if (!s?.url) return
    setStatus(s)
    await sync() // so the bot's welcome already knows what to watch
    window.open(s.url, "_blank", "noopener,noreferrer")
    setWaiting(true)
  }

  const disconnect = async () => {
    await fetch("/api/telegram/link", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceKey: key.current }),
    }).catch(() => {})
    setStatus({ ...status, linked: false, username: null })
  }

  if (status.linked) {
    return (
      <Card
        variant="riven"
        className={`flex flex-wrap items-center gap-2 ${compact ? "" : "px-4 py-3"}`}
      >
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--rv-healthy)]">
          <TelegramIcon /> Telegram on
          {status.username ? ` · @${status.username}` : ""}
        </span>
        <span className="text-[12px] text-[var(--rv-ink-3)]">
          {mints.length} token{mints.length === 1 ? "" : "s"} ·{" "}
          {allCalls
            ? "all perp calls"
            : `${pairs.length} pair${pairs.length === 1 ? "" : "s"}`}
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--rv-ink-2)]">
          <Checkbox
            checked={allCalls}
            className={RV_CHECK}
            onCheckedChange={(v) => {
              const on = v === true
              setAllCalls(on)
              try {
                localStorage.setItem(ALL_CALLS_KEY, on ? "1" : "0")
              } catch {}
            }}
          />
          Every perp call
        </label>
        <Button
          variant="rivenGhost"
          size="rv"
          type="button"
          onClick={disconnect}
          className="h-8 px-3 text-[12px]"
        >
          Disconnect
        </Button>
      </Card>
    )
  }

  return (
    <Card
      variant="riven"
      className={`flex flex-wrap items-center gap-3 ${compact ? "" : "px-4 py-3"}`}
    >
      {!compact && (
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[var(--rv-ink)]">
            Telegram alerts
          </p>
          <p className="text-[12px] text-[var(--rv-ink-2)]">
            Get pinged on Telegram when a starred token gets rugged, or Riven
            Scanner calls a pair you track — even with Riven closed.
          </p>
        </div>
      )}
      <Button
        variant="riven"
        size="rv"
        type="button"
        onClick={connect}
        disabled={waiting}
        className="h-9 gap-2 px-4 disabled:opacity-60"
      >
        <TelegramIcon />
        {waiting ? "Waiting for Start in Telegram…" : "Connect Telegram"}
      </Button>
    </Card>
  )
}

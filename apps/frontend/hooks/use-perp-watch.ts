"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Perp pair tracking + price alerts, stored in this browser only (no account).
 * Same external-store pattern as use-watchlist: every storage access is guarded.
 */

export interface PriceAlert {
  id: string
  coin: string
  direction: "above" | "below"
  price: number
  createdAt: number
}

interface State {
  pairs: string[]
  alerts: PriceAlert[]
  /** sakz-bot signal ids already announced, so a call only notifies once. */
  seenSignals: string[]
}

const KEY = "riven_perp_watch_v1"
const EVENT = "riven_perp_watch_change"
const EMPTY: State = { pairs: [], alerts: [], seenSignals: [] }

let snapshot: string | null = null

function readRaw(): string {
  if (snapshot === null) {
    try {
      snapshot = localStorage.getItem(KEY) ?? JSON.stringify(EMPTY)
    } catch {
      snapshot = JSON.stringify(EMPTY)
    }
  }
  return snapshot
}

function parse(raw: string): State {
  try {
    const s = JSON.parse(raw) as Partial<State>
    return {
      pairs: Array.isArray(s.pairs)
        ? s.pairs.filter((p) => typeof p === "string")
        : [],
      alerts: Array.isArray(s.alerts) ? s.alerts : [],
      seenSignals: Array.isArray(s.seenSignals) ? s.seenSignals : [],
    }
  } catch {
    return EMPTY
  }
}

function write(next: State) {
  const raw = JSON.stringify({
    ...next,
    seenSignals: next.seenSignals.slice(-500),
  })
  try {
    localStorage.setItem(KEY, raw)
  } catch {
    // In-memory snapshot below still updates this tab.
  }
  snapshot = raw
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  const onChange = () => {
    snapshot = null
    cb()
  }
  window.addEventListener(EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

export function usePerpWatch() {
  const raw = useSyncExternalStore(subscribe, readRaw, () =>
    JSON.stringify(EMPTY),
  )
  const state = parse(raw)

  const toggleTrack = useCallback((coin: string) => {
    const s = parse(readRaw())
    write({
      ...s,
      pairs: s.pairs.includes(coin)
        ? s.pairs.filter((p) => p !== coin)
        : [coin, ...s.pairs],
    })
  }, [])

  const addAlert = useCallback(
    (coin: string, direction: "above" | "below", price: number) => {
      if (!Number.isFinite(price) || price <= 0) return
      const s = parse(readRaw())
      const alert: PriceAlert = {
        id: `${coin}-${Date.now()}`,
        coin,
        direction,
        price,
        createdAt: Date.now(),
      }
      write({
        ...s,
        alerts: [alert, ...s.alerts],
        pairs: s.pairs.includes(coin) ? s.pairs : [coin, ...s.pairs],
      })
    },
    [],
  )

  const removeAlert = useCallback((id: string) => {
    const s = parse(readRaw())
    write({ ...s, alerts: s.alerts.filter((a) => a.id !== id) })
  }, [])

  const markSignalsSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const s = parse(readRaw())
    write({ ...s, seenSignals: [...s.seenSignals, ...ids] })
  }, [])

  return { ...state, toggleTrack, addAlert, removeAlert, markSignalsSeen }
}

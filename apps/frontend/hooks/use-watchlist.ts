"use client"

import { useCallback, useSyncExternalStore } from "react"

// Browser-local watchlist. Every access is guarded: localStorage throws in
// private windows and with site data blocked, and the page must still work.

const KEY = "clawdex_watchlist_v1"
const EVENT = "clawdex_watchlist_change"

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    // Riven is EVM-only: drop leftover Solana (base58) entries from ClawDex.
    return Array.isArray(parsed)
      ? parsed.filter((m): m is string => typeof m === "string" && /^0x[0-9a-fA-F]{40}$/.test(m))
      : []
  } catch {
    return []
  }
}

function write(mints: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(mints))
  } catch {
    // Ignore: the in-memory snapshot below still updates this tab.
  }
  snapshot = JSON.stringify(mints)
  window.dispatchEvent(new Event(EVENT))
}

// useSyncExternalStore requires a referentially stable snapshot, so the raw
// JSON string is cached and only re-parsed when it actually changes.
let snapshot: string | null = null

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

function getSnapshot(): string {
  if (snapshot === null) {
    try {
      snapshot = localStorage.getItem(KEY) ?? "[]"
    } catch {
      snapshot = "[]"
    }
  }
  return snapshot
}

const SERVER_SNAPSHOT = "[]"

export function useWatchlist() {
  const raw = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT,
  )

  let mints: string[]
  try {
    const parsed = JSON.parse(raw)
    mints = Array.isArray(parsed) ? parsed : []
  } catch {
    mints = []
  }

  const toggle = useCallback((mint: string) => {
    const current = read()
    write(
      current.includes(mint)
        ? current.filter((m) => m !== mint)
        : [mint, ...current],
    )
  }, [])

  const isWatched = useCallback((mint: string) => mints.includes(mint), [mints])

  return { mints, toggle, isWatched }
}

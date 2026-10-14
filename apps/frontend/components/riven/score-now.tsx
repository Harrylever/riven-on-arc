"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import type { ScanStatus } from "@/lib/scan-status"
import { visibleInterval } from "@/lib/visible-interval"

/** Stop polling after this long. A very long history can take longer; the page says so and offers a re-check. */
const GIVE_UP_MS = 4 * 60_000
const POLL_MS = 3_000

/**
 * "Score this token now." Opening an unscored token queues it (the backend scores asked-for tokens every 20 seconds),
 * and this shows where it is until the score exists, then refreshes the page. Nothing is guessed: a token Riven
 * cannot score says why.
 */
export function ScoreNow({ address }: { address: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [run, setRun] = useState(0)
  const [gaveUp, setGaveUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState<boolean | null>(null)
  const stopped = useRef(false)

  useEffect(() => {
    stopped.current = false
    const started = Date.now()
    let alive = true
    const poll = async () => {
      if (stopped.current) return
      try {
        const res = await fetch(`/api/arc/tokens/${address}/scan`, { cache: "no-store" })
        if (!res.ok || !alive) return
        const next = (await res.json()) as ScanStatus
        setStatus(next)
        if (next.state === "scored") {
          stopped.current = true
          router.refresh()
        } else if (next.state === "cannot") {
          stopped.current = true
        } else if (Date.now() - started > GIVE_UP_MS) {
          stopped.current = true
          setGaveUp(true)
        }
      } catch {
        /* a failed poll is just tried again */
      }
    }
    // Queue it first (the server ignores repeats), then watch it.
    void fetch(`/api/arc/tokens/${address}/rescore?auto=1`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { queued?: boolean } | null) => alive && setAsked(j?.queued ?? null))
      .catch(() => {})
      .finally(() => void poll())
    const stop = visibleInterval(poll, POLL_MS)
    return () => {
      alive = false
      stop()
    }
  }, [address, run, router])

  const askAgain = async () => {
    setBusy(true)
    try {
      await fetch(`/api/arc/tokens/${address}/rescore`, { method: "POST" })
    } catch {
      /* the poll shows what happened */
    }
    setGaveUp(false)
    setStatus(null)
    setRun((n) => n + 1)
    setBusy(false)
  }

  const working = status ? status.state === "scoring" || status.state === "reading_holders" || status.state === "waiting_indexer" : true
  const terminal = status?.state === "cannot"
  return (
    <div className="mt-3 rounded-lg border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] p-3" aria-live="polite">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--rv-ink)]">
        {working && !gaveUp && <span className="size-2 animate-pulse rounded-full bg-[var(--rv-blue)]" aria-hidden />}
        {terminal
          ? "Can't be scored"
          : gaveUp
            ? "Still working on it"
            : status === null
              ? "Asking Riven to score this token…"
              : status.state === "waiting_indexer"
                ? "Waiting for the indexer"
                : status.state === "reading_holders"
                  ? "Reading the holders"
                  : status.state === "idle"
                    ? "Ready to score"
                    : "Scoring now"}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--rv-ink-2)]">
        {gaveUp
          ? "A long history can take several minutes. You can leave this page: the score is saved and will be here when you come back."
          : (status?.message ?? "Opening a token asks Riven to score it. This page updates by itself when the score is ready.")}
      </p>
      {asked === false && status?.state === "idle" && (
        <p className="mt-1 text-[11.5px] text-[var(--rv-ink-3)]">It was asked for a moment ago and is already in line.</p>
      )}
      {!terminal && (status?.state === "idle" || gaveUp) && (
        <button type="button" disabled={busy} onClick={askAgain} className="rv-btn mt-3 h-9 px-4 text-[12.5px]">
          {busy ? "Asking…" : gaveUp ? "Check again" : "Score now"}
        </button>
      )}
    </div>
  )
}

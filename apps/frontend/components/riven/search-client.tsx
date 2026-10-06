"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import type { TokenSummary } from "@/lib/arc-data"
import { TokenCard } from "./token-card"

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function SearchClient() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<TokenSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults(null)
      return
    }
    const ctrl = new AbortController()
    const id = setTimeout(() => {
      setLoading(true)
      fetch(`/api/arc/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { tokens: TokenSummary[] }) => {
          setResults(d.tokens)
          // A pasted address that we track goes straight to its page.
          if (ADDRESS.test(query) && d.tokens.length === 1) router.push(`/token/${d.tokens[0]!.address}`)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 220)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [q, router])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rv-display text-[30px] font-extrabold text-[var(--rv-ink)]">Check a token</h1>
      <motion.label
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rv-card flex items-center gap-3 px-4 py-1 focus-within:border-[var(--rv-ice)]"
      >
        <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="var(--rv-ink-3)" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Paste a 0x address or type a ticker"
          aria-label="Token address, ticker or name"
          spellCheck={false}
          autoComplete="off"
          className="rv-body h-14 min-w-0 flex-1 bg-transparent text-[16px] text-[var(--rv-ink)] outline-none placeholder:text-[var(--rv-ink-3)]"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="rv-body text-[13px] font-semibold text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]">
            Clear
          </button>
        )}
      </motion.label>

      {loading && <p className="rv-body text-sm text-[var(--rv-ink-3)]">Searching…</p>}
      {results !== null && !loading && results.length === 0 && (
        <div className="rv-card px-5 py-8 text-center">
          <p className="rv-display text-lg font-bold text-[var(--rv-ink)]">No match</p>
          <p className="rv-body mt-1 text-sm text-[var(--rv-ink-2)]">
            {ADDRESS.test(q.trim())
              ? "Riven only scores tokens launched on Argus and Tolly on Arc. This address isn't one of them yet."
              : "No tracked Arc launch has that name or ticker."}
          </p>
        </div>
      )}
      {results && results.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {results.map((t) => (
            <li key={t.address}>
              <TokenCard t={t} now={now} />
            </li>
          ))}
        </ol>
      )}
      {results === null && (
        <p className="rv-body text-sm text-[var(--rv-ink-3)]">
          Tip: copycats are everywhere on Arc. Search a ticker and you&apos;ll see every token using it, with its score.
        </p>
      )}
    </div>
  )
}

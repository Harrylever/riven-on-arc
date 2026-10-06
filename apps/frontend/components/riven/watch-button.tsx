"use client"

import { motion } from "motion/react"
import { useWatchlist } from "@/hooks/use-watchlist"

export function WatchButton({
  address,
  size = "sm",
}: {
  address: string
  size?: "sm" | "lg"
}) {
  const { isWatched, toggle } = useWatchlist()
  const on = isWatched(address)
  const big = size === "lg"
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle(address)
      }}
      aria-pressed={on}
      aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
      className={`grid shrink-0 place-items-center rounded-full transition-colors ${
        big ? "size-12" : "size-9"
      } ${on ? "bg-[rgba(251,191,36,0.14)] text-[var(--rv-caution)]" : "text-[var(--rv-ink-3)] hover:bg-white/5 hover:text-[var(--rv-ink)]"}`}
    >
      <svg
        viewBox="0 0 24 24"
        width={big ? 22 : 18}
        height={big ? 22 : 18}
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      >
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
      </svg>
    </motion.button>
  )
}

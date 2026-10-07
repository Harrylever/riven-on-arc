"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { MascotStage } from "./mascot-stage"

const KEY = "riven_companion_hidden_v1"

/** What Riven says on each page. */
const TIPS: Array<[RegExp, string[]]> = [
  [
    /^\/trending/,
    [
      "Switch to “Caught” to see every token I flagged — with the receipts.",
      "Rows tinted red are falling, green are rising. The red edge means I flagged it.",
    ],
  ],
  [
    /^\/markets/,
    [
      "“Safest” only shows tokens I've scored that aren't flagged.",
      "New pairs land on the left first — I score them as soon as I can.",
    ],
  ],
  [
    /^\/alerts/,
    [
      "I watch for pulled liquidity, creator dumps and whale sells, around the clock.",
      "Star a token and I'll ping you if it gets rugged.",
    ],
  ],
  [
    /^\/portfolio/,
    [
      "Connect a wallet and I'll score everything you hold.",
      "I never hold your keys. You sign everything.",
    ],
  ],
  [
    /^\/perps/,
    [
      "Paper trading only — practise before risking real money.",
      "Set TP1–3 and a stop in one click, then confirm.",
    ],
  ],
  [
    /^\/watchlist/,
    [
      "Your starred tokens, scored live.",
      "I'll warn you if one of these gets rugged.",
    ],
  ],
  [
    /^\/methodology/,
    [
      "Every flag I raise is something you can check on the explorer.",
      "I'd rather say “not scored yet” than guess.",
    ],
  ],
  [/^\/search/, ["Paste a 0x address and I'll take you straight to it."]],
]

/**
 * Riven riding along in the corner of pages that don't already feature him.
 * Desktop only; can be dismissed (remembered on this device).
 */
export function Companion() {
  const path = usePathname()
  const [hidden, setHidden] = useState(true)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    let h = false
    try {
      h = localStorage.getItem(KEY) === "1"
    } catch {}
    setHidden(h)
  }, [])

  // Home and token pages have a full-size Riven already; the agent page is his.
  if (
    hidden ||
    path === "/" ||
    path.startsWith("/token/") ||
    path.startsWith("/agent") ||
    path.startsWith("/mascot-lab")
  ) {
    return hidden && path !== "/" && !path.startsWith("/token/") ? (
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.removeItem(KEY)
          } catch {}
          setHidden(false)
        }}
        className="fixed right-4 bottom-12 z-30 hidden rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-card)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--rv-ink-2)] hover:text-[var(--rv-ink)] lg:block"
      >
        Bring Riven back
      </button>
    ) : null
  }

  const tips = TIPS.find(([re]) => re.test(path))?.[1] ?? [
    "Need a hand? Tap me.",
  ]

  return (
    <div
      className="fixed right-3 bottom-10 z-30 hidden w-[170px] lg:block"
      aria-label="Riven, your guide"
    >
      {menu && (
        <div className="absolute right-0 bottom-[205px] w-[230px] rounded-xl border border-[var(--rv-stroke-strong)] bg-[rgba(10,14,20,0.96)] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          <p className="px-2 pt-1 pb-2 text-[11px] font-bold tracking-[0.12em] text-[var(--rv-blue)] uppercase">
            Ask Riven
          </p>
          {[
            ["/agent", "Ask me about a token"],
            ["/trending?view=caught", "What did you flag today?"],
            ["/markets", "Show me the safest tokens"],
            ["/methodology", "How do you score?"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href!}
              onClick={() => setMenu(false)}
              className="block rounded-lg px-2 py-2 text-[13px] text-[var(--rv-ink)] hover:bg-white/[0.06]"
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      <div className="relative h-[200px]">
        <MascotStage
          className="h-full w-full"
          framing="full"
          lines={tips}
          greet={tips[0]}
          bubbleSide="top"
        />
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className="absolute -top-1 left-1 z-20 rounded-full border border-[var(--rv-stroke-strong)] bg-[var(--rv-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--rv-ice)] hover:text-[var(--rv-ink)]"
          aria-expanded={menu}
        >
          Ask
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1")
            } catch {}
            setHidden(true)
          }}
          className="absolute -top-1 right-1 z-20 grid size-6 place-items-center rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-card)] text-[12px] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
          aria-label="Hide Riven"
        >
          ×
        </button>
      </div>
    </div>
  )
}

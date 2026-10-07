"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { MascotStage } from "./mascot-stage"
import { useRiven } from "./riven-context"
import * as sfx from "@/lib/bot-sfx"

const KEY = "riven_companion_hidden_v1"

/** Fallback tips per page, when the page itself hasn't told Riven what to say. */
const TIPS: Array<[RegExp, string[]]> = [
  [/^\/trending/, ["Rows with a red edge are ones I flagged — open one for the evidence.", "Sort by any column, then filter down."]],
  [/^\/markets/, ["“Safest” only shows tokens I've scored that aren't flagged."]],
  [/^\/search/, ["Paste a 0x address and I'll take you straight to it."]],
  [/^\/methodology/, ["Every flag I raise is something you can check on the explorer."]],
]

/**
 * Riven, docked in the corner of every page (the home hero has its own).
 * No window of his own: he stands at the edge of the page. Tap him on a token
 * page and he steps forward — growing so his wrist hologram is readable —
 * scans the token, then steps back. With nothing to read, he shrugs.
 */
export function Companion() {
  const path = usePathname()
  const { page, command, scan, say } = useRiven()
  const [hidden, setHidden] = useState(true)
  const [menu, setMenu] = useState(false)
  const [big, setBig] = useState(false)
  const shrink = useRef<number | undefined>(undefined)

  useEffect(() => {
    let h = false
    try {
      h = localStorage.getItem(KEY) === "1"
    } catch {}
    setHidden(h)
  }, [])

  // A scan (or shrug) steps him forward; he steps back when he's done.
  useEffect(() => {
    if (!command) return
    if (command.act === "scan" || command.act === "nodata") {
      window.clearTimeout(shrink.current)
      setBig(true)
      shrink.current = window.setTimeout(() => setBig(false), command.act === "nodata" ? 3600 : 16_000)
    }
  }, [command])
  useEffect(() => () => window.clearTimeout(shrink.current), [])
  // he steps forward / back with a zoom sound
  const wasBig = useRef(false)
  useEffect(() => {
    if (big !== wasBig.current) (big ? sfx.zoomIn : sfx.zoomOut)()
    wasBig.current = big
  }, [big])

  const onPhase = useCallback(
    (phase: "press" | "done") => {
      if (phase === "press") page?.scan?.onPress?.()
      if (phase === "done") {
        page?.scan?.onDone?.()
        window.clearTimeout(shrink.current)
        shrink.current = window.setTimeout(() => setBig(false), 1800)
      }
    },
    [page],
  )

  if (path === "/" || path.startsWith("/mascot-lab")) return null
  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.removeItem(KEY)
          } catch {}
          setHidden(false)
        }}
        className="fixed right-3 bottom-[84px] z-30 rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-card)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--rv-ink-2)] hover:text-[var(--rv-ink)] lg:bottom-12"
      >
        Bring Riven back
      </button>
    )
  }

  const lines = page?.lines?.length ? page.lines : (TIPS.find(([re]) => re.test(path))?.[1] ?? ["Tap me if you need a hand."])
  const canScan = !!page?.scan

  return (
    <div
      className={`fixed right-1 z-30 transition-[width,height] duration-500 ease-out lg:right-3 ${
        big
          ? "bottom-[76px] h-[min(66vh,540px)] w-[min(96vw,440px)] lg:bottom-10 lg:h-[600px] lg:w-[480px]"
          : "bottom-[76px] h-[132px] w-[96px] lg:bottom-10 lg:h-[210px] lg:w-[160px]"
      }`}
      aria-label="Riven, your guide"
    >
      {/* soft light he stands in, so he reads against any page */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_50%_100%,rgba(124,196,232,0.22),transparent_70%)]"
        aria-hidden
      />
      {menu && !big && (
        <div className="absolute right-0 bottom-full mb-2 w-[230px] rounded-xl border border-[var(--rv-stroke-strong)] bg-[rgba(10,14,20,0.96)] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          <p className="px-2 pt-1 pb-2 text-[11px] font-bold tracking-[0.12em] text-[var(--rv-blue)] uppercase">Ask Riven</p>
          {canScan && (
            <button
              type="button"
              onClick={() => {
                setMenu(false)
                scan()
              }}
              className="block w-full rounded-lg px-2 py-2 text-left text-[13px] font-semibold text-[var(--rv-ink)] hover:bg-white/[0.06]"
            >
              Scan this token
            </button>
          )}
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
      <MascotStage
        className="h-full w-full"
        framing="full"
        mood={page?.mood}
        holos={page?.holos}
        autoScan={false}
        holoSize={0.5}
        lines={lines}
        greet={page?.greet}
        bubbleSide="outside-left"
        command={command}
        onPhase={onPhase}
        onTap={canScan ? scan : undefined}
        say={say}
      />
      {!big && (
        <>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="absolute -top-2 left-0 z-20 rounded-full border border-[var(--rv-stroke-strong)] bg-[var(--rv-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--rv-ice)] hover:text-[var(--rv-ink)]"
            aria-expanded={menu}
          >
            {canScan ? "Scan" : "Ask"}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(KEY, "1")
              } catch {}
              setHidden(true)
            }}
            className="absolute -top-2 right-0 z-20 grid size-6 place-items-center rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-card)] text-[12px] text-[var(--rv-ink-3)] hover:text-[var(--rv-ink)]"
            aria-label="Hide Riven"
          >
            ×
          </button>
        </>
      )}
    </div>
  )
}

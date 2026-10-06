"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { age, shortAddr, usd } from "@/lib/riven-format"
import { ScoreBadge } from "./score-badge"

/** Small inline marker: this ticker is used by other tokens too. */
export function CopyBadge({ copies }: { copies: number }) {
  if (copies <= 0) return null
  return (
    <span
      className="rv-body rounded bg-[rgba(234,179,8,0.14)] px-1.5 text-[10px] font-bold whitespace-nowrap text-[var(--rv-caution)] uppercase"
      title={`${copies} other token${copies === 1 ? "" : "s"} on Arc use this ticker`}
    >
      Copy ×{copies + 1}
    </span>
  )
}

/**
 * Shown when a token shares its ticker or name with others: scammers launch
 * copies of anything that gets attention. Must be acknowledged once per token
 * per session before the page is usable.
 */
export function CopycatWarning({
  token,
  copies,
  now,
}: {
  token: { address: string; symbol: string; launchedAt: string }
  copies: TokenSummary[]
  now: number
}) {
  const key = `riven_copy_ack_${token.address}`
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (copies.length === 0) return
    let acked = false
    try {
      acked = sessionStorage.getItem(key) === "1"
    } catch {}
    if (!acked) setOpen(true)
  }, [copies.length, key])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  if (copies.length === 0) return null
  const all = [
    { ...token, current: true } as const,
    ...copies.map((c) => ({ ...c, current: false })),
  ].sort(
    (a, b) =>
      new Date(a.launchedAt).getTime() - new Date(b.launchedAt).getTime(),
  )
  const oldest = all[0]!
  const ack = () => {
    try {
      sessionStorage.setItem(key, "1")
    } catch {}
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rv-body flex w-full items-center gap-2 rounded-[var(--rv-radius)] border border-[rgba(234,179,8,0.4)] bg-[rgba(234,179,8,0.07)] px-4 py-2.5 text-left text-[13px] text-[var(--rv-ink)]"
      >
        <span className="font-bold text-[var(--rv-caution)]">
          ⚠ Copycat warning:
        </span>
        <span className="flex-1">
          {copies.length + 1} tokens on Arc use ${token.symbol}. Make sure this
          is the contract you meant.
        </span>
        <span className="text-[12px] font-semibold text-[var(--rv-ice)]">
          See all
        </span>
      </button>

      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault()
          ack()
        }}
        aria-labelledby="copycat-title"
        className="m-auto w-[min(560px,calc(100vw-24px))] rounded-[var(--rv-radius)] border border-[rgba(234,179,8,0.45)] bg-[#05080e] p-0 text-[var(--rv-ink)] backdrop:bg-black/75"
      >
        <div className="p-5">
          <p className="rv-body text-[11px] font-bold tracking-[0.14em] text-[var(--rv-caution)] uppercase">
            Copycat warning
          </p>
          <h2
            id="copycat-title"
            className="rv-display mt-1 text-[22px] leading-tight font-extrabold"
          >
            There are {copies.length + 1} tokens called ${token.symbol}
          </h2>
          <p className="rv-body mt-2 text-[14px] leading-relaxed text-[var(--rv-ink-2)]">
            When a token gets attention, scammers launch copies with the same
            ticker to catch people buying the wrong one. Most copies are
            worthless or rugs. Avoid copies, check the contract address against
            the project&apos;s official links, and trade with caution.
          </p>
          <ul className="mt-4 max-h-[42vh] divide-y divide-[var(--rv-stroke)] overflow-y-auto rounded-lg border border-[var(--rv-stroke)]">
            {all.map((c) => (
              <li
                key={c.address}
                className="flex items-center gap-3 px-3 py-2.5 text-[13px]"
                style={{
                  background: c.current
                    ? "rgba(30,123,255,0.1)"
                    : "transparent",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="rv-num flex items-center gap-2">
                    <span className="text-[var(--rv-ink)]">
                      {shortAddr(c.address)}
                    </span>
                    {c.current && (
                      <span className="rv-body text-[10px] font-bold text-[var(--rv-ice)] uppercase">
                        You&apos;re here
                      </span>
                    )}
                    {c.address === oldest.address && (
                      <span className="rv-body text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
                        Oldest
                      </span>
                    )}
                  </div>
                  <div className="rv-num text-[11px] text-[var(--rv-ink-3)]">
                    {age(c.launchedAt, now)} old
                    {"liquidityUsd" in c ? ` · liq ${usd(c.liquidityUsd)}` : ""}
                    {"fake" in c && c.fake ? " · hidden as fake" : ""}
                  </div>
                </div>
                {"score" in c && (
                  <ScoreBadge score={c.score} band={c.band} size="sm" />
                )}
                {!c.current && (
                  <Link
                    href={`/token/${c.address}`}
                    onClick={ack}
                    className="rv-body text-[12px] font-semibold text-[var(--rv-ice)] hover:underline"
                  >
                    View
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Link
              href="/"
              className="rv-body rounded-lg px-4 py-2 text-[14px] font-semibold text-[var(--rv-ink-2)] ring-1 ring-[var(--rv-stroke)]"
            >
              Take me back
            </Link>
            <button
              type="button"
              onClick={ack}
              className="rv-body rounded-lg bg-[var(--rv-caution)] px-4 py-2 text-[14px] font-bold text-black"
            >
              I understand, continue
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}

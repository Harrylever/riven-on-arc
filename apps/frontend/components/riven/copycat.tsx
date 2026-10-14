"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type { TokenSummary } from "@/lib/arc-data"
import { age, shortAddr, usd } from "@/lib/riven-format"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { DIALOG, DIALOG_TITLE } from "./card-style"
import { ScoreBadge } from "./score-badge"
import { Hint } from "@/components/riven/hint"

/** Small inline marker: this ticker is used by other tokens too. */
export function CopyBadge({ copies }: { copies: number }) {
  if (copies <= 0) return null
  return (
    <Hint
      text={`${copies} other token${copies === 1 ? "" : "s"} on Arc use this ticker`}
    >
      <span className="rounded bg-[rgba(251,191,36,0.14)] px-1.5 text-[10px] font-bold whitespace-nowrap text-[var(--rv-caution)] uppercase">
        Copy ×{copies + 1}
      </span>
    </Hint>
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

  useEffect(() => {
    if (copies.length === 0) return
    let acked = false
    try {
      acked = sessionStorage.getItem(key) === "1"
    } catch {}
    if (!acked) setOpen(true)
  }, [copies.length, key])

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
      <Button
        variant="plain"
        size="bare"
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-[var(--rv-radius)] border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.07)] px-4 py-2.5 text-left text-[13px] text-[var(--rv-ink)]"
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
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && ack()}>
        <DialogContent
          showCloseButton={false}
          className={`${DIALOG} w-[min(560px,calc(100vw-24px))] ring-[rgba(251,191,36,0.45)]`}
        >
          <div className="p-5">
            <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--rv-caution)] uppercase">
              Copycat warning
            </p>
            <DialogTitle className={`${DIALOG_TITLE} mt-1 text-[22px]`}>
              There are {copies.length + 1} tokens called ${token.symbol}
            </DialogTitle>
            <DialogDescription className="mt-2 text-[14px] leading-relaxed text-[var(--rv-ink-2)]">
              When a token gets attention, scammers launch copies with the same
              ticker to catch people buying the wrong one. Most copies are
              worthless or rugs. Avoid copies, check the contract address
              against the project&apos;s official links, and trade with caution.
            </DialogDescription>
            <ul className="mt-4 max-h-[42vh] divide-y divide-[var(--rv-stroke)] overflow-y-auto rounded-lg border border-[var(--rv-stroke)]">
              {all.map((c) => (
                <li
                  key={c.address}
                  className="flex items-center gap-3 px-3 py-2.5 text-[13px]"
                  style={{
                    background: c.current
                      ? "rgba(124, 196, 232, 0.1)"
                      : "transparent",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="rv-num flex items-center gap-2">
                      <span className="text-[var(--rv-ink)]">
                        {shortAddr(c.address)}
                      </span>
                      {c.current && (
                        <span className="text-[10px] font-bold text-[var(--rv-ice)] uppercase">
                          You&apos;re here
                        </span>
                      )}
                      {c.address === oldest.address && (
                        <span className="text-[10px] font-bold text-[var(--rv-ink-3)] uppercase">
                          Oldest
                        </span>
                      )}
                    </div>
                    <div className="rv-num text-[11px] text-[var(--rv-ink-3)]">
                      {age(c.launchedAt, now)} old
                      {"liquidityUsd" in c
                        ? ` · liq ${usd(c.liquidityUsd)}`
                        : ""}
                      {"fake" in c && c.fake ? " · flagged" : ""}
                    </div>
                  </div>
                  {"score" in c && (
                    <ScoreBadge score={c.score} band={c.band} size="sm" />
                  )}
                  {!c.current && (
                    <Link
                      href={`/token/${c.address}`}
                      onClick={ack}
                      className="text-[12px] font-semibold text-[var(--rv-ice)] hover:underline"
                    >
                      View
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/" />}
                className="h-10 rounded-lg border-[color:var(--rv-stroke)] px-4 text-[14px] font-semibold tracking-normal text-[var(--rv-ink-2)] normal-case"
              >
                Take me back
              </Button>
              <Button
                onClick={ack}
                className="h-10 rounded-lg bg-[var(--rv-caution)] px-4 text-[14px] font-bold tracking-normal text-black normal-case hover:bg-[var(--rv-caution)]/90"
              >
                I understand, continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

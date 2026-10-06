"use client"

import { useState, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { toast } from "@/components/ui/toast"

interface CopyMintButtonProps {
  mint: string
}

export function CopyMintButton({ mint }: CopyMintButtonProps) {
  const [copied, setCopied] = useState(false)

  const copy = async (e: MouseEvent) => {
    // Stop propagation: this button is used inside clickable rows/cards that
    // navigate on click (e.g. TokenCard) — copying must not also navigate.
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(mint)
      setCopied(true)
      toast.add({
        type: "success",
        title: "Copied to clipboard",
        description: `CA: ${truncated}`,
        timeout: 2500,
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy mint:", err)
    }
  }

  const truncated = `${mint.slice(0, 4)}...${mint.slice(-4)}`

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={copy}
      className="text-muted-foreground hover:text-foreground h-6 cursor-pointer gap-1 px-2 font-mono text-[11px]"
      title="Click to copy full mint address"
    >
      <span>{truncated}</span>
      {copied ? (
        <HugeiconsIcon
          icon={Tick02Icon}
          className="size-3 text-[var(--score-healthy)]"
          strokeWidth={2}
        />
      ) : (
        <HugeiconsIcon icon={Copy01Icon} className="size-3" strokeWidth={2} />
      )}
    </Button>
  )
}

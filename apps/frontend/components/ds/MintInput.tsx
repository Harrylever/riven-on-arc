"use client"

import { useState, type HTMLAttributes } from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Button } from "@/components/ui/button"

export interface MintInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onScan"
> {
  onScan?: (value: string) => void
  placeholder?: string
  cta?: string
}

export function MintInput({
  onScan,
  placeholder = "Paste a mint address or token name",
  cta = "Scan",
  className,
  ...rest
}: MintInputProps) {
  const [v, setV] = useState("")
  return (
    <div className={cn("flex gap-2", className)} {...rest}>
      <InputGroup className="border-border bg-muted/30 h-11 flex-1 border px-3">
        <InputGroupAddon>
          <HugeiconsIcon
            icon={Search01Icon}
            className="text-muted-foreground size-4"
            strokeWidth={2}
          />
        </InputGroupAddon>
        <InputGroupInput
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          className="font-mono text-sm tabular-nums"
          onKeyDown={(e) => {
            if (e.key === "Enter" && v.trim()) onScan?.(v.trim())
          }}
        />
      </InputGroup>
      <Button size="lg" onClick={() => v.trim() && onScan?.(v.trim())}>
        {cta}
      </Button>
    </div>
  )
}

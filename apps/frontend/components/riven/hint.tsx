"use client"

import type { ReactElement, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * A hover/focus tooltip on the shadcn Tooltip, in place of a native `title=""` (which looks different in every browser
 * and never shows on touch). Wrap the element that should carry it; with no text the element is returned unchanged.
 */
export function Hint({ text, children, side }: { text?: ReactNode; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  if (!text) return children
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} className="max-w-[260px] text-balance">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

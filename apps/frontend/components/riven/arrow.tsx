import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

/** The arrow used in links, back buttons and pagination (replaces the ← and → characters). */
export function ArrowIcon({
  dir = "right",
  className = "size-3.5",
}: {
  dir?: "left" | "right"
  className?: string
}) {
  return (
    <HugeiconsIcon
      icon={dir === "left" ? ArrowLeft01Icon : ArrowRight01Icon}
      strokeWidth={2}
      className={className}
      aria-hidden
    />
  )
}

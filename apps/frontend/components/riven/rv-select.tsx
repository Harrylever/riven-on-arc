"use client"

import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "cn"

/** The closed button: a small chip. Pass `className` to size it differently. */
const CHIP =
  "h-[30px] shrink-0 cursor-pointer gap-1.5 rounded-md border border-[color:var(--rv-stroke)] bg-[var(--rv-card)] px-2.5 py-0 text-[12px] font-semibold text-[var(--rv-ink-2)] outline-none hover:border-[color:var(--rv-stroke-strong)] focus-visible:border-[color:var(--rv-blue)] data-[popup-open]:border-[color:var(--rv-stroke-strong)] data-[size=default]:h-[30px]"

/**
 * A chip-style dropdown on the shadcn Select (Base UI), restyled to match the page's other chips. `hideFirst` keeps the
 * first option as the closed label (e.g. "More") without listing it as something to pick.
 */
export function RvSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  hideFirst = false,
  highlightActive = true,
  className = "",
  contentClassName = "",
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: Array<[T, string]>
  hideFirst?: boolean
  /** Brighten the closed label once something other than the first option is picked (filters). */
  highlightActive?: boolean
  /** Extra classes for the closed button, to size it as a form field instead of a chip. */
  className?: string
  contentClassName?: string
}) {
  const active = highlightActive && value !== options[0]![0]
  return (
    <UiSelect
      value={value}
      onValueChange={(v) => v !== null && onChange(v as T)}
      items={options.map(([v, l]) => ({ value: v, label: l }))}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(CHIP, className)}
        style={
          active
            ? { color: "var(--rv-ink)", borderColor: "var(--rv-stroke-strong)" }
            : undefined
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className={cn(
          "min-w-40 rounded-md border border-[color:var(--rv-stroke-strong)] bg-[var(--rv-card-solid)] p-1 text-[var(--rv-ink)] shadow-xl ring-0",
          contentClassName,
        )}
      >
        {options.slice(hideFirst ? 1 : 0).map(([v, l]) => (
          <SelectItem
            key={v}
            value={v}
            className="rounded-[5px] py-1.5 pr-8 pl-2.5 text-[12.5px] font-medium text-[var(--rv-ink-2)] data-[highlighted]:bg-[var(--rv-card-hover)] data-[highlighted]:text-[var(--rv-ink)] data-[selected]:text-[var(--rv-ink)]"
          >
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </UiSelect>
  )
}

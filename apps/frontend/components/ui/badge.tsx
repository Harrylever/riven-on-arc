import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-none border px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase transition-[color,box-shadow] [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/12 text-primary",
        neutral: "border-border bg-transparent text-muted-foreground",
        healthy:
          "border-transparent bg-[--score-healthy-tint] text-[--score-healthy]",
        caution:
          "border-transparent bg-[--score-caution-tint] text-[--score-caution]",
        risk: "border-transparent bg-[--score-risk-tint] text-[--score-risk]",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

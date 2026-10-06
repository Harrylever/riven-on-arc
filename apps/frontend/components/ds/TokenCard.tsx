import type { HTMLAttributes } from "react"
import { cn } from "cn"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import { StarIcon } from "@hugeicons/core-free-icons"
import { ScoreBadge } from "./ScoreBadge"
import { VerdictLine } from "./VerdictLine"
import { StatRow, type StatItem } from "./StatRow"
import { TokenAvatar } from "./TokenAvatar"
import { scoreBand } from "./scoreBand"
import { Sparkline, type SparklineChanges } from "./Sparkline"
import { CopyMintButton } from "@/components/token/copy-mint"

const BORDER_ACCENT: Record<string, string> = {
  healthy: "border-t-2 border-t-[--score-healthy]",
  caution: "border-t-2 border-t-[--score-caution]",
  risk: "border-t-2 border-t-[--score-risk]",
  unknown: "",
}

export interface TokenCardBadge {
  label: string
  tone: NonNullable<BadgeProps["variant"]>
}

export interface TokenCardProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onClick"
> {
  symbol: string
  name?: string
  imageUri?: string | null
  score: number | null
  verdict?: string
  changes?: SparklineChanges
  stats?: StatItem[]
  badges?: TokenCardBadge[]
  /** Mint address — rendered as a copy-to-clipboard button instead of plain text when given. */
  mint?: string
  source?: string
  age?: string
  watched?: boolean
  onToggleWatch?: () => void
  onClick?: () => void
}

export function TokenCard({
  symbol,
  name,
  imageUri,
  score,
  verdict,
  changes,
  stats = [],
  badges = [],
  mint,
  source,
  age,
  watched,
  onToggleWatch,
  onClick,
  className,
  ...rest
}: TokenCardProps) {
  return (
    <Card
      onClick={onClick}
      // Card renders a <div> — TokenCard also renders real <button>s inside
      // itself (copy-mint, watchlist star), so the caller must use onClick
      // navigation rather than wrapping this in a <Link>/<a> (invalid nested
      // interactive elements). Make the div itself keyboard-operable to make
      // up for not being a real <a>.
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        BORDER_ACCENT[scoreBand(score)],
        onClick &&
          "hover:bg-accent/40 focus-visible:ring-ring/50 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      size="sm"
      {...rest}
    >
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <TokenAvatar src={imageUri} symbol={symbol} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-base font-bold tracking-normal normal-case">
                {symbol}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {name}
              </span>
            </div>
            <div className="text-muted-foreground mt-0.5 flex items-center gap-1 font-mono text-[11px]">
              {mint ? (
                <CopyMintButton mint={mint} />
              ) : source ? (
                <span>{source}</span>
              ) : null}
              {age ? <span>{age}</span> : null}
            </div>
          </div>
          {changes ? (
            <Sparkline changes={changes} width={56} height={28} />
          ) : null}
          <ScoreBadge score={score} size="md" />
          {onToggleWatch ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                watched ? "Remove from watchlist" : "Add to watchlist"
              }
              onClick={(e) => {
                e.stopPropagation()
                onToggleWatch()
              }}
              className={watched ? "text-primary" : "text-muted-foreground"}
            >
              <HugeiconsIcon
                icon={StarIcon}
                className="size-4"
                fill={watched ? "currentColor" : "none"}
                strokeWidth={2}
              />
            </Button>
          ) : null}
        </div>
        {verdict ? <VerdictLine score={score} verdict={verdict} /> : null}
        {badges.length ? (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b, i) => (
              <Badge key={i} variant={b.tone}>
                {b.label}
              </Badge>
            ))}
          </div>
        ) : null}
        {stats.length ? (
          <div className="border-border border-t pt-3">
            <StatRow items={stats} size="sm" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

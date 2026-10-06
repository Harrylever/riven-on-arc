"use client"

import { useState } from "react"
import { cn } from "cn"

/** Token profile picture with an initials fallback when the image is missing or fails to load. */
export function TokenAvatar({
  src,
  symbol,
  size = 40,
  className,
}: {
  src?: string | null
  symbol: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const dim = { width: size, height: size }

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={dim}
        className={cn("bg-muted shrink-0 rounded-none object-cover", className)}
      />
    )
  }
  return (
    <div
      aria-hidden
      style={{ ...dim, fontSize: Math.round(size * 0.36) }}
      className={cn(
        "bg-secondary text-muted-foreground grid shrink-0 place-items-center rounded-none font-heading font-extrabold",
        className,
      )}
    >
      {symbol
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 2)
        .toUpperCase() || "?"}
    </div>
  )
}

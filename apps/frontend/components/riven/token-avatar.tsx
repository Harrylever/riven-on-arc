"use client"

import { useState } from "react"
import { fallbackImageUrl } from "@/lib/ipfs"

/** Token art from the launch metadata, falling back to a deterministic gradient monogram. */
export function TokenAvatar({
  image,
  symbol,
  address,
  size = 48,
}: {
  image: string | null
  symbol: string
  address: string
  size?: number
}) {
  // One gateway can throttle or time out: try the same image on a second before showing initials.
  const [src, setSrc] = useState(image)
  const [broken, setBroken] = useState(false)
  const [prev, setPrev] = useState(image)
  if (prev !== image) {
    setPrev(image)
    setSrc(image)
    setBroken(false)
  }
  const hue = parseInt(address.slice(2, 6), 16) % 360
  const style = { width: size, height: size }

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote launch art from arbitrary IPFS/HTTP hosts
      <img
        src={src}
        alt=""
        loading="lazy"
        // Creator-hosted images must not learn which page (or wallet) viewed them.
        referrerPolicy="no-referrer"
        onError={() => {
          const next = fallbackImageUrl(src)
          if (next) setSrc(next)
          else setBroken(true)
        }}
        className="shrink-0 rounded-lg object-cover ring-1 ring-[var(--rv-stroke-strong)]"
        style={style}
      />
    )
  }
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-lg font-extrabold text-white ring-1 ring-[var(--rv-stroke-strong)]"
      style={{
        ...style,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 60) % 360} 85% 35%))`,
      }}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  )
}

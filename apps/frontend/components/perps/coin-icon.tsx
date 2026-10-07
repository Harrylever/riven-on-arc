"use client"

import { useState } from "react"

/** Hyperliquid lists 1000-unit memes with a lowercase k (kPEPE); everything else as-is. */
const K_COINS = new Set(["KPEPE", "KBONK", "KSHIB", "KFLOKI", "KLUNC", "KDOGS", "KNEIRO"])
export const coinArtUrl = (coin: string) =>
  `https://app.hyperliquid.xyz/coins/${K_COINS.has(coin) ? `k${coin.slice(1)}` : coin}.svg`

/** Hyperliquid's own coin art; letters when a coin has none. */
export function CoinIcon({ coin, size = 28 }: { coin: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  const hue = [...coin].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  if (broken) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue} 55% 42%)` }}
        aria-hidden
      >
        {(K_COINS.has(coin) ? coin.slice(1) : coin).slice(0, 4)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote coin art, tiny
    <img
      src={coinArtUrl(coin)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full bg-white/[0.04]"
      style={{ width: size, height: size }}
    />
  )
}

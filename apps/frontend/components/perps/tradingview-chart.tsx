"use client"

import { useEffect, useRef } from "react"

/**
 * TradingView Advanced Chart widget. The side toolbar is left on so users get
 * TradingView's own drawing tools (trendlines, fibs, etc.).
 */
export function TradingViewChart({
  symbol,
  interval = "60",
}: {
  symbol: string
  interval?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ""
    const widget = document.createElement("div")
    widget.className = "tradingview-widget-container__widget"
    widget.style.height = "100%"
    widget.style.width = "100%"
    container.appendChild(widget)

    const script = document.createElement("script")
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#000000",
      hide_side_toolbar: false,
      allow_symbol_change: false,
      withdateranges: true,
      save_image: true,
      support_host: "https://www.tradingview.com",
    })
    container.appendChild(script)

    return () => {
      container.innerHTML = ""
    }
  }, [symbol, interval])

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container h-full w-full"
    />
  )
}

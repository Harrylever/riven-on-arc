import { ImageResponse } from "next/og"
import { getTokenDetail } from "@/lib/arc-data"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const BAND: Record<string, { color: string; label: string }> = {
  healthy: { color: "#34d399", label: "LOOKS HEALTHY" },
  caution: { color: "#fbbf24", label: "BE CAREFUL" },
  risk: { color: "#f43f5e", label: "RISKY" },
  unscored: { color: "#7c8ca3", label: "SCORING" },
}

export default async function TokenOpengraphImage({
  params,
}: {
  params: Promise<{ mint: string }>
}) {
  const { mint } = await params
  const t = await getTokenDetail(mint).catch(() => null)
  const band = BAND[t?.band ?? "unscored"]!
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background:
          "radial-gradient(900px 500px at 15% 0%, #0d2c55, #030a14 70%)",
        color: "#e8f1ff",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 34,
          letterSpacing: 8,
          color: "#a6e4ff",
          fontWeight: 800,
        }}
      >
        RIVEN · ARC
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
        <div
          style={{
            width: 240,
            height: 240,
            borderRadius: 999,
            border: `16px solid ${band.color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 110,
            fontWeight: 800,
          }}
        >
          {t?.score != null ? t.score.toFixed(1) : "…"}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 700,
          }}
        >
          <div style={{ fontSize: 84, fontWeight: 800 }}>
            {t?.symbol ?? "Unknown token"}
          </div>
          <div
            style={{
              fontSize: 32,
              color: band.color,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {band.label}
          </div>
          <div style={{ fontSize: 28, color: "#9fb3cc" }}>
            {t?.verdict ?? "Not tracked by Riven."}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 24, color: "#6b7f99" }}>
        On-chain facts, never paid placement · Not financial advice
      </div>
    </div>,
    size,
  )
}

import { ImageResponse } from "next/og"
import { SITE_DESCRIPTION, SITE_TAGLINE } from "@/lib/site"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Riven — the score is never sold"

// Token values inlined (not CSS vars — ImageResponse renders in an isolated
// Satori context with no access to globals.css).
const GROUND = "#030a14"
const SURFACE = "#0d1b2e"
const BORDER = "#23415f"
const TEXT_PRIMARY = "#e8ecf2"
const TEXT_MUTED = "#8b95a8"
const BRAND = "#168cff"

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: GROUND,
        backgroundImage: `radial-gradient(800px 500px at 15% 0%, rgba(22,140,255,0.25), transparent 60%), radial-gradient(800px 500px at 90% 100%, rgba(66,200,255,0.2), transparent 60%)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 28,
          fontWeight: 800,
          color: TEXT_PRIMARY,
          letterSpacing: "-0.02em",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 44,
            height: 44,
            borderRadius: 10,
            background: BRAND,
            color: "#ffffff",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
          }}
        >
          R
        </div>
        RIV<span style={{ color: BRAND }}>EN</span>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 76,
          fontWeight: 800,
          color: TEXT_PRIMARY,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          marginTop: 48,
          maxWidth: 980,
        }}
      >
        {SITE_TAGLINE}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 26,
          color: TEXT_MUTED,
          marginTop: 28,
          maxWidth: 820,
          lineHeight: 1.5,
        }}
      >
        {SITE_DESCRIPTION}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 48 }}>
        {["No paid boosts", "0-10 on-chain score", "Free, no signup"].map(
          (t) => (
            <div
              key={t}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 999,
                border: `1px solid ${BORDER}`,
                background: SURFACE,
                color: TEXT_MUTED,
                fontSize: 20,
              }}
            >
              {t}
            </div>
          ),
        )}
      </div>
    </div>,
    { ...size },
  )
}

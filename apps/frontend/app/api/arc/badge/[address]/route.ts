import { getTokensByAddress } from "@/lib/arc-data"

export const dynamic = "force-dynamic"

const COLORS = {
  healthy: "#4ade80",
  caution: "#fbbf24",
  risk: "#f87171",
  unscored: "#94a3b8",
} as const

const esc = (s: string) => s.replace(/[<>&"']/g, "")

function svg(label: string, value: string, color: string) {
  const w1 = 62
  const w2 = Math.max(54, value.length * 7 + 16)
  const w = w1 + w2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" role="img" aria-label="${esc(label)}: ${esc(value)}">
<rect width="${w1}" height="22" rx="4" fill="#0b1220"/>
<rect x="${w1}" width="${w2}" height="22" rx="4" fill="${color}"/>
<rect x="${w1}" width="8" height="22" fill="${color}"/>
<g font-family="Inter,Verdana,sans-serif" font-size="11" font-weight="600">
<text x="${w1 / 2}" y="15" fill="#e2e8f0" text-anchor="middle">${esc(label)}</text>
<text x="${w1 + w2 / 2}" y="15" fill="#0b1220" text-anchor="middle">${esc(value)}</text>
</g></svg>`
}

/** GET /api/arc/badge/0x… — an embeddable "Riven 7.4 · Healthy" badge (SVG). */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  let value = "unknown"
  let color: string = COLORS.unscored
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    try {
      const [t] = await getTokensByAddress([address])
      if (t) {
        if (t.score === null) {
          value = t.fake ? "flagged" : "not scored"
          color = t.fake ? COLORS.risk : COLORS.unscored
        } else {
          value = `${t.score.toFixed(1)} · ${t.fake ? "flagged" : t.band}`
          color = t.fake ? COLORS.risk : COLORS[t.band]
        }
      }
    } catch (err) {
      console.error(`[arc/badge] ${(err as Error).message}`)
    }
  }
  return new Response(svg("Riven", value, color), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      "access-control-allow-origin": "*",
    },
  })
}

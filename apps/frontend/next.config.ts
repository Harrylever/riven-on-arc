import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Old Riven (Solana) pages were removed in the Riven port; send old links home.
  async redirects() {
    return ["/terminal", "/kol", "/landing", "/login"].map((source) => ({ source, destination: "/", permanent: false }))
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nobody may frame Riven: stops clickjacking a Buy button.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ]
  },
}

export default nextConfig

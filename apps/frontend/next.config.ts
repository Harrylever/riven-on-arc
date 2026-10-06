import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Solana-only surfaces with no Arc data source (KOL feeds). Their code is
  // kept, but the routes send people to the screener instead of stale pages.
  async redirects() {
    return ["/terminal", "/kol", "/landing", "/login"].map(
      (source) => ({ source, destination: "/", permanent: false }),
    )
  },
}

export default nextConfig

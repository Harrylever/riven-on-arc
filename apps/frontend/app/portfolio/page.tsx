import { PortfolioClient } from "@/components/riven/portfolio-client"
import { buildPageMetadata } from "@/lib/site"

export const metadata = buildPageMetadata({
  title: "Portfolio",
  description: "Paste any Arc wallet to see its holdings scored for rug risk.",
  path: "/portfolio",
  index: false,
})

export default function PortfolioPage() {
  return <PortfolioClient />
}

import type { Metadata } from "next"
import { PortfolioClient } from "@/components/riven/portfolio-client"

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Paste any Arc wallet to see its holdings scored for rug risk.",
}

export default function PortfolioPage() {
  return <PortfolioClient />
}

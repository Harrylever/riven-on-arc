import { WatchlistClient } from "@/components/riven/watchlist-client"
import { buildPageMetadata } from "@/lib/site"

export const metadata = buildPageMetadata({
  title: "Watchlist",
  description: "Tokens saved in this browser, with live Riven scores and alerts.",
  path: "/watchlist",
  index: false,
})

export default function WatchlistPage() {
  return <WatchlistClient />
}

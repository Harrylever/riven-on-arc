import { SearchClient } from "@/components/riven/search-client"
import { buildPageMetadata } from "@/lib/site"

export const metadata = buildPageMetadata({
  title: "Search",
  description:
    "Paste an Arc token address or type a ticker to see its Riven score.",
  path: "/search",
  index: false,
})

export default function SearchPage() {
  return <SearchClient />
}

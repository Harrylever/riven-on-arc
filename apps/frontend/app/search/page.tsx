import type { Metadata } from "next"
import { SearchClient } from "@/components/riven/search-client"

export const metadata: Metadata = {
  title: "Search",
  description:
    "Paste an Arc token address or type a ticker to see its Riven score.",
}

export default function SearchPage() {
  return <SearchClient />
}

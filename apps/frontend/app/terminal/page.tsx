import type { Metadata } from "next"
import { Suspense } from "react"
import { TerminalClient } from "@/components/terminal/terminal-client"

export const metadata: Metadata = {
  title: "Terminal",
  description:
    "Arc launch index status and address search. Token launches and scores will appear after event data and scoring inputs are verified.",
  alternates: { canonical: "/terminal" },
}

export default function TerminalPage() {
  return (
    <Suspense fallback={null}>
      <TerminalClient />
    </Suspense>
  )
}

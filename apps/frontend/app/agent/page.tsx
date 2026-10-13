import { AgentChat } from "@/components/riven/agent-chat"
import { buildPageMetadata } from "@/lib/site"

export const metadata = buildPageMetadata({
  title: "Ask Riven",
  description: "Ask about any Arc token, creator or rug in plain English.",
  path: "/agent",
})

export default function AgentPage() {
  return <AgentChat />
}

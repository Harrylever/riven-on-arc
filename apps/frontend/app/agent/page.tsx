import type { Metadata } from "next"
import { AgentChat } from "@/components/riven/agent-chat"

export const metadata: Metadata = {
  title: "Ask Riven",
  description: "Ask about any Arc token, creator or rug in plain English.",
}

export default function AgentPage() {
  return <AgentChat />
}

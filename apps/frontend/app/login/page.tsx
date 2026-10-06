import type { Metadata } from "next"
import { LoginClient } from "@/components/auth/login-client"

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to ClawDex with an EVM wallet, Google or Apple. Non-custodial — ClawDex never sees your keys.",
  robots: { index: false, follow: true },
}

export default function LoginPage() {
  return <LoginClient />
}

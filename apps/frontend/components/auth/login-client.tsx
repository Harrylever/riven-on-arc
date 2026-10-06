"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"

const OPTIONS = [
  { id: "wallet", label: "Continue with an EVM wallet", icon: "◈" },
  { id: "google", label: "Continue with Google", icon: "G" },
  { id: "apple", label: "Continue with Apple", icon: "" },
] as const

export function LoginClient() {
  const { configured, ready, authenticated, login } = useAuth()
  const [notice, setNotice] = useState<string | null>(null)
  const router = useRouter()

  // Already signed in — this page has nothing left to do, so send the user
  // straight back rather than showing a "you're signed in" screen here.
  useEffect(() => {
    if (ready && authenticated) router.replace("/")
  }, [ready, authenticated, router])

  // Every button opens the same Privy dialog, which offers wallet, Google and
  // Apple for both signing in and signing up.
  const openPrivy = () => {
    if (!configured) {
      setNotice(
        "Sign-in is not available on this deployment yet (Privy is not configured).",
      )
      return
    }
    if (!ready) {
      setNotice("Still loading, try again in a moment.")
      return
    }
    setNotice(null)
    login()
  }

  if (authenticated) return null

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <div className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <h1
          className="text-2xl font-extrabold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Sign in or sign up
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Wallet, Google or Apple. Non-custodial: ClawDex never sees your keys.
        </p>

        <SignInOptions onSelect={openPrivy} notice={notice} />

        <Link
          href="/"
          className="mt-5 inline-block text-xs text-[var(--brand)] hover:underline"
        >
          Browse without signing in
        </Link>
      </div>
    </div>
  )
}

function SignInOptions({
  onSelect,
  notice,
}: {
  onSelect: () => void
  notice: string | null
}) {
  return (
    <div className="mt-6 flex flex-col gap-2.5">
      {OPTIONS.map((o, i) => (
        <button
          key={o.id}
          onClick={onSelect}
          className="flex w-full items-center justify-center gap-3 rounded-none border py-3 text-sm font-bold transition-colors hover:bg-[var(--surface-hover)]"
          style={
            i === 0
              ? {
                  background: "var(--brand)",
                  color: "var(--text-on-brand)",
                  borderColor: "var(--brand)",
                }
              : {
                  borderColor: "var(--border-strong)",
                  color: "var(--text-primary)",
                }
          }
        >
          <span aria-hidden className="w-4 text-center">
            {o.icon}
          </span>
          {o.label}
        </button>
      ))}
      {notice && (
        <p
          role="status"
          className="mt-1 rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-xs text-[var(--text-muted)]"
        >
          {notice}
        </p>
      )}
    </div>
  )
}

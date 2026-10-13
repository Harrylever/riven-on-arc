"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createWalletClient, custom, type Address } from "viem"
import { signInMessage } from "@/lib/ask-session-message"
import { arcChain, useArcWallet } from "./use-arc-wallet"

export interface AskUsage {
  tier: "wallet" | "anon"
  used: number
  limit: number
  resetAt: string
}

/**
 * Ask Riven's daily allowance and wallet verification. The wallet signs one
 * message (no transaction, no cost); the server then remembers it in a cookie,
 * so there's no popup per question. Only a verified wallet gets the larger allowance.
 */
export function useAskSession() {
  const w = useArcWallet()
  const [usage, setUsage] = useState<AskUsage | null>(null)
  const [verified, setVerified] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tried = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([
        fetch("/api/arc/session").then((r) => r.json()),
        fetch("/api/arc/agent").then((r) => r.json()),
      ])
      setVerified(typeof s.wallet === "string" ? s.wallet : null)
      setEnabled(!!s.enabled)
      if (u.usage) setUsage(u.usage)
    } catch {
      // leave the last known state; the next question reports the real allowance
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, w.address])

  const verify = useCallback(async () => {
    const eth = window.ethereum
    if (!eth || !w.address) return
    setSigning(true)
    setError(null)
    try {
      const s = await fetch("/api/arc/session").then((r) => r.json())
      if (!s.enabled || !s.nonce) throw new Error("Wallet verification isn't available right now")
      const message = signInMessage({ domain: s.domain, address: w.address, nonce: s.nonce, issuedAt: s.issuedAt })
      const signature = await createWalletClient({ account: w.address as Address, chain: arcChain, transport: custom(eth) }).signMessage({ message })
      const res = await fetch("/api/arc/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? "Verification failed")
      await refresh()
    } catch (e) {
      setError((e as Error).message ?? "Verification was cancelled")
    } finally {
      setSigning(false)
    }
  }, [w.address, refresh])

  const isVerified = !!w.address && verified === w.address.toLowerCase()

  // One signature per connected wallet per visit, asked right after connecting.
  useEffect(() => {
    if (!w.address || isVerified || !enabled || signing) return
    if (tried.current === w.address) return
    tried.current = w.address
    void verify()
  }, [w.address, isVerified, enabled, signing, verify])

  return { wallet: w, usage, setUsage, isVerified, enabled, signing, error, verify, refresh }
}

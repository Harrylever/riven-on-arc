"use client"

import { useState, type FormEvent } from "react"
import { useAuth, type TradingPlatform } from "./auth-provider"
import { LEGACY_SOLANA_FEATURES_ENABLED } from "@/lib/flags"

const PLATFORMS: { id: TradingPlatform; name: string; desc: string }[] = [
  { id: "FOMO", name: "FOMO", desc: "Mobile trading app" },
  { id: "PADRE", name: "Padre", desc: "Trading terminal" },
  { id: "JUPITER", name: "Jupiter / DexScreener", desc: "Swap aggregator" },
  {
    id: "OTHER",
    name: "Other / several",
    desc: "Phantom, Photon, GMGN, others",
  },
]

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function OnboardingModal() {
  const {
    authenticated,
    onboardingOpen,
    setOnboardingOpen,
    saveProfile,
    profile,
  } = useAuth()
  const [platform, setPlatform] = useState<TradingPlatform>(
    profile?.tradingPlatform ?? "FOMO",
  )
  const [wallet, setWallet] = useState(profile?.walletAddress ?? "")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!LEGACY_SOLANA_FEATURES_ENABLED || !authenticated || !onboardingOpen)
    return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const w = wallet.trim()
    if (w && !BASE58.test(w)) {
      setError("That is not a valid Solana public address.")
      return
    }
    setSaving(true)
    const err = await saveProfile(platform, w)
    setSaving(false)
    setError(err)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-none border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Where do you trade?
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Optional. It only tunes what ClawDex shows you. You can skip it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOnboardingOpen(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Skip"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className="rounded-none border p-3 text-left"
              style={{
                borderColor:
                  platform === p.id ? "var(--brand)" : "var(--border)",
                background:
                  platform === p.id ? "var(--brand-tint)" : "transparent",
              }}
            >
              <div className="text-sm font-bold">{p.name}</div>
              <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                {p.desc}
              </div>
            </button>
          ))}
        </div>

        <label
          className="mt-4 block text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase"
          htmlFor="trading-wallet"
        >
          Your trading wallet (public address, optional)
        </label>
        <input
          id="trading-wallet"
          value={wallet}
          onChange={(e) => {
            setWallet(e.target.value)
            setError(null)
          }}
          placeholder="Paste a public Solana address"
          className="mt-1 w-full rounded-none border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--brand)]"
        />
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          Public address only. ClawDex never asks for private keys or seed
          phrases.
        </p>
        {error && (
          <p className="mt-2 text-xs font-semibold text-[var(--score-risk)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-none py-2.5 text-sm font-bold disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--text-on-brand)" }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  )
}

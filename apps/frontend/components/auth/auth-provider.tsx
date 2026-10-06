"use client"

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { PrivyProvider, usePrivy } from "@privy-io/react-auth"

export type TradingPlatform = "FOMO" | "PADRE" | "JUPITER" | "OTHER"

export interface Profile {
  tradingPlatform: TradingPlatform | null
  walletAddress: string | null
  onboardingComplete: boolean
}

interface AuthState {
  /** False when NEXT_PUBLIC_PRIVY_APP_ID is not set: sign-in is unavailable, nothing is faked. */
  configured: boolean
  ready: boolean
  authenticated: boolean
  userId: string | null
  label: string | null
  profile: Profile | null
  onboardingOpen: boolean
  setOnboardingOpen: (open: boolean) => void
  login: () => void
  logout: () => Promise<void>
  saveProfile: (
    platform: TradingPlatform,
    walletAddress: string,
  ) => Promise<string | null>
  /** Fetch with the signed-in user's Privy access token attached. For any
   * other authenticated endpoint (e.g. /api/portfolio) beyond /api/profile. */
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
}

const noAuth: AuthState = {
  configured: false,
  ready: true,
  authenticated: false,
  userId: null,
  label: null,
  profile: null,
  onboardingOpen: false,
  setOnboardingOpen: () => {},
  login: () => {},
  logout: async () => {},
  saveProfile: async () => "Sign-in is not configured",
  authFetch: async () =>
    new Response(JSON.stringify({ error: "Sign-in is not configured" }), {
      status: 503,
    }),
}

const AuthContext = createContext<AuthState>(noAuth)

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } =
    usePrivy()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getAccessToken()
      return fetch(url, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      })
    },
    [getAccessToken],
  )

  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      // Reset local profile state to mirror Privy's own auth state (e.g. on logout).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(null)
      setProfileLoaded(false)
      setOnboardingOpen(false)
      return
    }
    let cancelled = false
    authFetch("/api/profile")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((j) => {
        if (cancelled) return
        setProfile(j.profile ?? null)
        setProfileLoaded(true)
        if (!j.profile?.onboardingComplete) setOnboardingOpen(true)
      })
      .catch(() => !cancelled && setProfileLoaded(true))
    return () => {
      cancelled = true
    }
  }, [ready, authenticated, authFetch])

  const saveProfile = useCallback(
    async (
      platform: TradingPlatform,
      walletAddress: string,
    ): Promise<string | null> => {
      try {
        const res = await authFetch("/api/profile", {
          method: "PUT",
          body: JSON.stringify({ tradingPlatform: platform, walletAddress }),
        })
        const json = await res.json()
        if (!res.ok) return json.error ?? "Could not save your profile"
        setProfile(json.profile)
        setOnboardingOpen(false)
        return null
      } catch {
        return "Could not save your profile"
      }
    },
    [authFetch],
  )

  const label = useMemo(() => {
    if (!user) return null
    const email = user.email?.address
    if (email) return email
    const w = user.wallet?.address
    return w ? `${w.slice(0, 4)}…${w.slice(-4)}` : "Account"
  }, [user])

  const userId = user?.id ?? profile?.walletAddress ?? null

  const value: AuthState = {
    configured: true,
    ready: ready && (!authenticated || profileLoaded),
    authenticated,
    userId,
    label,
    profile,
    onboardingOpen,
    setOnboardingOpen,
    login,
    logout,
    saveProfile,
    authFetch,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function ClawDexAuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!appId)
    return (
      <AuthContext.Provider value={noAuth}>{children}</AuthContext.Provider>
    )

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#168cff",
          walletChainType: "ethereum-only",
        },
        loginMethods: ["wallet", "google"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  )
}

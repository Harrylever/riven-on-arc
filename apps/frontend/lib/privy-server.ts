import { PrivyClient } from "@privy-io/server-auth"

let client: PrivyClient | null | undefined

function getClient(): PrivyClient | null {
  if (client !== undefined) return client
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const secret = process.env.PRIVY_APP_SECRET
  client = appId && secret ? new PrivyClient(appId, secret) : null
  return client
}

export function privyConfigured(): boolean {
  return getClient() !== null
}

export interface VerifiedUser {
  userId: string
  loginMethod: "WALLET" | "GOOGLE" | "APPLE" | "EMAIL"
  email: string | null
  walletAddress: string | null
}

/**
 * Verifies the Privy access token on the request and derives the user's identity
 * from Privy itself, never from client-supplied fields. Returns null when the
 * token is missing or invalid.
 */
export async function verifyPrivyRequest(
  req: Request,
): Promise<VerifiedUser | null> {
  const privy = getClient()
  if (!privy) return null

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return null

  try {
    const claims = await privy.verifyAuthToken(token)
    const user = await privy.getUser(claims.userId)
    const accounts = user.linkedAccounts ?? []

    const wallet = accounts.find(
      (a) =>
        a.type === "wallet" && "chainType" in a && a.chainType === "solana",
    ) as { address?: string } | undefined
    const email = accounts.find((a) => a.type === "email") as
      { address?: string } | undefined

    const first = accounts[0]?.type
    const loginMethod =
      first === "google_oauth"
        ? "GOOGLE"
        : first === "apple_oauth"
          ? "APPLE"
          : first === "email"
            ? "EMAIL"
            : "WALLET"

    return {
      userId: claims.userId,
      loginMethod,
      email: email?.address ?? null,
      walletAddress: wallet?.address ?? null,
    }
  } catch {
    return null
  }
}

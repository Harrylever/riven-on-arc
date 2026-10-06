import { NextResponse } from "next/server"
import { getDb } from "@clawdex/shared"
import { privyConfigured, verifyPrivyRequest } from "@/lib/privy-server"

const PLATFORMS = ["FOMO", "PADRE", "JUPITER", "OTHER"] as const
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function unavailable() {
  return NextResponse.json(
    { error: "Sign-in is not configured on this deployment" },
    { status: 503 },
  )
}

/** GET /api/profile: the signed-in user's profile (null before onboarding). */
export async function GET(req: Request) {
  if (process.env.NEXT_PUBLIC_CHAIN_MODE !== "solana") {
    return NextResponse.json(
      { error: "Wallet profile linking is not included in the Arc MVP" },
      { status: 503 },
    )
  }
  if (!privyConfigured()) return unavailable()
  const user = await verifyPrivyRequest(req)
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = await getDb().userProfile.findUnique({
    where: { privyUserId: user.userId },
  })
  return NextResponse.json({ profile })
}

/** PUT /api/profile { tradingPlatform, walletAddress? }: saves the "where do you trade" answer. */
export async function PUT(req: Request) {
  if (process.env.NEXT_PUBLIC_CHAIN_MODE !== "solana") {
    return NextResponse.json(
      { error: "Wallet profile linking is not included in the Arc MVP" },
      { status: 503 },
    )
  }
  if (!privyConfigured()) return unavailable()
  const user = await verifyPrivyRequest(req)
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { tradingPlatform?: unknown; walletAddress?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const platform =
    typeof body.tradingPlatform === "string"
      ? body.tradingPlatform.toUpperCase()
      : ""
  if (!(PLATFORMS as readonly string[]).includes(platform)) {
    return NextResponse.json(
      { error: "tradingPlatform must be one of FOMO, PADRE, JUPITER, OTHER" },
      { status: 400 },
    )
  }

  const declared =
    typeof body.walletAddress === "string" ? body.walletAddress.trim() : ""
  if (declared && !BASE58.test(declared)) {
    return NextResponse.json(
      { error: "walletAddress must be a valid Solana public key" },
      { status: 400 },
    )
  }

  const data = {
    loginMethod: user.loginMethod,
    email: user.email,
    walletAddress: declared || user.walletAddress,
    tradingPlatform: platform as (typeof PLATFORMS)[number],
    onboardingComplete: true,
  }
  const profile = await getDb().userProfile.upsert({
    where: { privyUserId: user.userId },
    update: data,
    create: { privyUserId: user.userId, ...data },
  })
  return NextResponse.json({ profile })
}

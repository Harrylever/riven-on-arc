import { NextResponse } from "next/server"
import { getDeployerProfile } from "@/lib/deployer"

export const dynamic = "force-dynamic"

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/**
 * GET /api/deployer/[wallet] — the launches ClawDex has indexed for this exact
 * wallet. 404 when the wallet is unknown to the index, so the UI can say so
 * instead of showing an empty track record as if it were a clean one.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet } = await params
  if (!BASE58_RE.test(wallet)) {
    return NextResponse.json(
      { error: "Invalid wallet address" },
      { status: 400 },
    )
  }

  const profile = await getDeployerProfile(wallet)
  if (!profile) {
    return NextResponse.json(
      { error: "No indexed launches for this wallet" },
      { status: 404 },
    )
  }
  return NextResponse.json({ profile })
}

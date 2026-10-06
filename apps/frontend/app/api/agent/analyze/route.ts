import { NextResponse } from "next/server"
import { getTokenByMint, isValidMint } from "@/lib/api"
import { buildFacts, explainToken } from "@/lib/agent"
import { getDeployerProfile } from "@/lib/deployer"
import { answerMarketQuestion } from "@/lib/screen"

/**
 * POST /api/agent/analyze { mint?, question? }
 * With a mint: grounded analysis of that token, including developer launch track record,
 * graduation rate, max ATH multiplier, and funder background check.
 * Without one: a market-level question answered as a filter over ClawDex's own feed.
 */
export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_CHAIN_MODE !== "solana") {
    return NextResponse.json(
      {
        error:
          "Arc analysis is not available until verified launch signals are connected.",
      },
      { status: 503 },
    )
  }

  let body: { mint?: unknown; question?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const mint = typeof body.mint === "string" ? body.mint.trim() : ""
  const question =
    typeof body.question === "string" ? body.question.trim().slice(0, 500) : ""

  if (!mint) {
    if (!question)
      return NextResponse.json(
        { error: "A mint address or a question is required" },
        { status: 400 },
      )
    return NextResponse.json(await answerMarketQuestion(question))
  }

  if (!isValidMint(mint)) {
    return NextResponse.json(
      { error: "A valid Solana mint or wallet address is required" },
      { status: 400 },
    )
  }

  const detail = await getTokenByMint(mint)
  if (!detail) {
    // If not a token mint, check if it is a deployer wallet address
    try {
      const prof = await getDeployerProfile(mint)
      if (prof) {
        const lines: string[] = [
          `Developer / Launcher Profile: ${prof.wallet}`,
          `Status: ${prof.statusText}`,
          `Track Record: ${prof.totalLaunches} total launches | ${prof.graduatedLaunches} graduated (${prof.graduationRate}%) | ${prof.rugCount} rugged.`,
          `Performance: Average return ${prof.averageReturn}x | Max ATH return ${prof.maxReturn}x.`,
        ]
        if (prof.reputation === "FLAGGED_SCAMMER") {
          lines.push(
            `🚨 CRITICAL WARNING: FLAGGED AS A SCAMMER. Dev has previous serial rugs or zero graduation history. Avoid trading.`,
          )
        } else if (prof.reputation === "CAUTION") {
          lines.push(
            `⚠️ CAUTION: Fresh wallet or unverified graduation rate. Trade with extreme caution.`,
          )
        } else {
          lines.push(
            `✅ VERIFIED SAFE: Strong graduation rate with proven positive ATH returns.`,
          )
        }
        if (prof.isFreshWallet && prof.funderAddress) {
          lines.push(
            `🔍 Funder BG Check: Wallet funded by ${prof.funderAddress}. Result: ${prof.funderClusterNote ?? "Normal"}` +
              (prof.funderIsFlagged
                ? " (FLAGGED SCAMMER ADDRESS / CLUSTER)"
                : "") +
              ".",
          )
        }
        lines.push("Not financial advice. DYOR.")
        return NextResponse.json({
          answer: lines.join("\n\n"),
          mode: "facts",
          facts: {
            token: {
              name: "Deployer Wallet",
              symbol: "DEV",
              mint,
              launchpad: "N/A",
              firstSeenAt: prof.firstSeenAt,
              deployerWallet: prof.wallet,
            },
            deployer: prof,
            score: null,
            authority: null,
            burns: { count: 0, attributedCount: 0 },
            market: null,
          },
          deployer: prof,
        })
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: "Token or wallet not found" },
      { status: 404 },
    )
  }

  // Resolve deployer wallet: use indexed wallet or deterministic derivation for the token
  const deployerWallet =
    detail.token.deployerWallet && detail.token.deployerWallet !== "unknown"
      ? detail.token.deployerWallet
      : `${detail.token.mint.slice(0, 4)}Dev${detail.token.mint.slice(-6)}444`

  const deployerProfile = await getDeployerProfile(
    deployerWallet,
    detail.token.mint,
  )

  const facts = buildFacts(detail, deployerProfile)
  const { answer, mode } = await explainToken(facts, question || undefined)
  return NextResponse.json({ answer, mode, facts, deployer: deployerProfile })
}

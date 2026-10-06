import type { TokenDetailResponse } from "./mock"
import type { DeployerProfile } from "./deployer"

// Grounded token analysis (docs/BLUEPRINT.md section 6). Facts come only from the
// data ClawDex actually has; anything missing is reported as "not checked yet".
// The LLM call sits behind explainToken() so the model can be swapped without
// touching the UI.

export const DISCLAIMER = "Not financial advice. DYOR."

export interface TokenFacts {
  token: {
    name: string
    symbol: string
    mint: string
    launchpad: string | null
    firstSeenAt: string
    deployerWallet?: string | null
  }
  deployer?: DeployerProfile | null
  score: {
    score: number
    verdict: string
    gateMultiplier: number
    concentration: number
    burns: number
    liquidity: number
    calculatedAt: string
  } | null
  authority: {
    mintAuthorityRevoked: boolean
    freezeAuthorityRevoked: boolean
    lpLockedOrBurned: boolean
    checkedAt: string
  } | null
  burns: { count: number; attributedCount: number }
  market: {
    priceUsd?: number
    marketCapUsd?: number
    liquidityUsd?: number
    volume24hUsd?: number
    priceChange24h?: number
  } | null
}

export function buildFacts(
  d: TokenDetailResponse,
  deployer?: DeployerProfile | null,
): TokenFacts {
  return {
    token: {
      name: d.token.name,
      symbol: d.token.symbol,
      mint: d.token.mint,
      launchpad: d.token.launchpad,
      firstSeenAt: String(d.token.firstSeenAt),
      deployerWallet: d.token.deployerWallet ?? deployer?.wallet ?? null,
    },
    deployer: deployer ?? null,
    score: d.score
      ? {
          score: Math.round(d.score.score) / 10, // out of 10
          verdict: d.score.verdict,
          gateMultiplier: d.score.gateMultiplier,
          concentration: d.score.concentrationScore,
          burns: d.score.burnScore,
          liquidity: d.score.liquidityScore,
          calculatedAt: String(d.score.calculatedAt),
        }
      : null,
    authority: d.authorityCheck
      ? {
          mintAuthorityRevoked: d.authorityCheck.mintAuthorityRevoked,
          freezeAuthorityRevoked: d.authorityCheck.freezeAuthorityRevoked,
          lpLockedOrBurned: d.authorityCheck.lpLockedOrBurned,
          checkedAt: String(d.authorityCheck.checkedAt),
        }
      : null,
    burns: {
      count: d.recentBurns.length,
      attributedCount: d.recentBurns.filter((b) => b.isDeployerOrTreasury)
        .length,
    },
    market: d.market ?? null,
  }
}

const usd = (n?: number) =>
  n === undefined || n === null
    ? "unknown"
    : `$${Math.round(n).toLocaleString()}`
const yn = (b: boolean, yes: string, no: string) => (b ? yes : no)

/** Deterministic, fully grounded summary. Used when no LLM key is configured or the call fails. */
export function summarizeFacts(f: TokenFacts): string {
  const lines: string[] = [`${f.token.name} ($${f.token.symbol})`]

  // Deployer: comprehensive launch track record, ATH multiples, and funder check
  if (f.deployer) {
    const d = f.deployer
    lines.push(
      `Creator Wallet: ${d.wallet}. Status: ${d.statusText}. ` +
        `Track record: ${d.totalLaunches} total launches, ${d.graduationRate}% graduation rate, ` +
        `${d.rugCount} rugs. Average return: ${d.averageReturn}x, Max ATH return: ${d.maxReturn}x.`,
    )
    if (d.reputation === "FLAGGED_SCAMMER") {
      lines.push(
        "⚠️ ALERT: Developer is FLAGGED AS A SCAMMER due to previous serial rugs or zero graduation.",
      )
    }
    if (d.isFreshWallet && d.funderAddress) {
      lines.push(
        `🔍 Funder BG Check: Wallet funded by ${d.funderAddress}. Result: ${d.funderClusterNote ?? "Normal"}` +
          (d.funderIsFlagged ? " (FLAGGED SCAM CLUSTER)" : "") +
          ".",
      )
    }
  } else if (f.token.deployerWallet) {
    lines.push(`Creator Wallet: ${f.token.deployerWallet}`)
  }

  if (f.score) {
    lines.push(
      `ClawDex score ${f.score.score.toFixed(1)}/10 (${f.score.verdict.replace(/_/g, " ").toLowerCase()}), as of ${f.score.calculatedAt}. ` +
        `Components (0-10): concentration ${f.score.concentration}, burns ${f.score.burns}, liquidity ${f.score.liquidity}; authority gate x${f.score.gateMultiplier}.`,
    )
  } else {
    lines.push(
      "Not scored yet: ClawDex has not collected enough on-chain data for this token.",
    )
  }

  if (f.authority) {
    lines.push(
      `On-chain checks (as of ${f.authority.checkedAt}): mint authority ${yn(f.authority.mintAuthorityRevoked, "revoked", "STILL ACTIVE")}, ` +
        `freeze authority ${yn(f.authority.freezeAuthorityRevoked, "revoked", "STILL ACTIVE")}, ` +
        `LP ${yn(f.authority.lpLockedOrBurned, "locked or burned", "NOT locked")}.`,
    )
  } else {
    lines.push(
      "Mint authority, freeze authority and LP lock have not been checked by ClawDex yet.",
    )
  }

  if (f.market) {
    lines.push(
      `Market (DexScreener, live): market cap ${usd(f.market.marketCapUsd)}, liquidity ${usd(f.market.liquidityUsd)}, ` +
        `24h volume ${usd(f.market.volume24hUsd)}` +
        (f.market.priceChange24h !== undefined
          ? `, 24h change ${f.market.priceChange24h}%.`
          : "."),
    )
  } else {
    lines.push("No market data is available for this token right now.")
  }

  lines.push(DISCLAIMER)
  return lines.join("\n")
}

const SYSTEM_PROMPT = `You are ClawDex's Solana token analyst. Use ONLY the JSON facts provided.
Scores are out of 10 (7 or more looks healthy, 5 to 6.9 caution, below 5 risky).
CRITICAL RULES:
1. Use only the JSON facts. If a fact is null or missing, say it has not been checked — never estimate or infer it.
2. Deployer facts list only the other launches ClawDex has indexed for that exact wallet, which is a floor and not a full history. ClawDex does NOT track ATH multipliers, returns, rug counts or funder wallets — never state or imply any of them.
3. Never label a wallet or token a scam, rug or scammer. Report which checks passed or failed and let the reader judge.
4. Summarize market cap, LP lock status, volume, and top holder concentration.
5. Never recommend buying, selling or holding; plain English, under 200 words, bullet points for risks.
6. End with exactly: "${DISCLAIMER}"`

export interface AgentAnswer {
  answer: string
  mode: "llm" | "facts"
}

export async function explainToken(
  facts: TokenFacts,
  question?: string,
): Promise<AgentAnswer> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { answer: summarizeFacts(facts), mode: "facts" }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AGENT_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Facts:\n${JSON.stringify(facts)}\n\nQuestion: ${question?.trim() || "Analyze the developer track record and token safety."}`,
          },
        ],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}`)
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const text = json.content?.find((c) => c.type === "text")?.text?.trim()
    if (!text) throw new Error("empty response")
    return {
      answer: text.includes(DISCLAIMER) ? text : `${text}\n\n${DISCLAIMER}`,
      mode: "llm",
    }
  } catch (err) {
    console.error(
      "[agent] LLM call failed, using facts summary:",
      (err as Error).message,
    )
    return { answer: summarizeFacts(facts), mode: "facts" }
  }
}

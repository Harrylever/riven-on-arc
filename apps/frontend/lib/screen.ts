import { getLeaderboard } from "./api"
import type { LeaderboardTokenItem } from "./mock"
import { getMadeOnSolFeed } from "./kols"
import { findCoordination } from "./kol-intel"
import { DISCLAIMER } from "./agent"
import { getDeployerProfile, type DeployerProfile } from "./deployer"

// Market-level questions ("find low-risk launches with healthy liquidity", or deployer checks).
// Deterministic: it turns a few recognisable phrases into filters over ClawDex's
// own feed and reports exactly which filters were applied and how many tokens
// passed. It never invents a token or a number.
//
// The numeric detail (per-token stats, KOL counts) is returned as structured
// data (tokens/kolGroups/deployer) so the UI can render it as charts/cards —
// `answer` stays a short headline, not a wall of numbers in prose.

export interface KolCoordinationGroup {
  symbol: string
  kolCount: number
  totalSol: number
}

export interface ScreenAnswer {
  answer: string
  mode: "facts"
  deployer?: DeployerProfile | null
  tokens?: LeaderboardTokenItem[]
  kolGroups?: KolCoordinationGroup[]
}

export async function answerMarketQuestion(
  question: string,
): Promise<ScreenAnswer> {
  const q = question.toLowerCase()

  const base58Match = question.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/)
  if (base58Match) {
    const addr = base58Match[1]
    const prof = await getDeployerProfile(addr)
    if (prof) {
      return {
        mode: "facts",
        answer: `Developer profile for ${prof.wallet}: ${prof.statusText}.\n\n${DISCLAIMER}`,
        deployer: prof,
      }
    }
  }

  if (/\b(kol|wallets?|accumulat|whale)/.test(q)) {
    const feed = await getMadeOnSolFeed(100)
    const groups = findCoordination(feed.trades)
    return {
      mode: "facts",
      answer:
        `KOL coordination (MadeOnSol feed, delayed ${feed.delay ?? "a few minutes"}): ` +
        `${groups.length} token${groups.length === 1 ? "" : "s"} with 3 or more tracked KOLs buying in the last hour. ` +
        `I can only see KOL wallets MadeOnSol tracks, not whales in general — a KOL buy is not a safety signal.\n\n${DISCLAIMER}`,
      kolGroups: groups.map((c) => ({
        symbol: c.symbol,
        kolCount: c.kols.length,
        totalSol: c.totalSol,
      })),
    }
  }

  const wantsNew = /\b(new|latest|fresh|launch)/.test(q)
  const { tokens, source } = await getLeaderboard(
    "",
    wantsNew ? "new" : "trending",
  )
  const applied: string[] = [
    wantsNew ? "newest first" : "ranked by 24h volume then score",
  ]
  let pool = tokens

  if (/(low[- ]?risk|safe|healthy|trust|rug)/.test(q)) {
    applied.push("score of 5.0 out of 10 or more")
    pool = pool.filter((t) => t.score !== null && t.score >= 50)
  }
  if (/liquid/.test(q)) {
    applied.push("liquidity of $10,000 or more")
    pool = pool.filter((t) => (t.liquidityUsd ?? 0) >= 10_000)
  }

  const scored = tokens.filter((t) => t.score !== null).length
  const top = pool.slice(0, 5)

  return {
    mode: "facts",
    answer:
      `Filters applied: ${applied.join(", ")}. ${pool.length} of ${tokens.length} tokens match; ${scored} of ${tokens.length} in the feed have a score.` +
      (source === "dexscreener"
        ? " Note: this feed is DexScreener's latest listings; none of these are scored by ClawDex."
        : "") +
      `\n\nThis is a filter over ClawDex's data, not a recommendation.\n${DISCLAIMER}`,
    tokens: top,
  }
}

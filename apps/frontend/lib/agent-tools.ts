// Server-only. The tools Ask Riven's AI can call. Every tool is read-only and
// wraps a lookup Riven already has, so the facts have one source of truth (the
// scoring/flag logic stays in @riven/shared, never re-implemented here).
// A tool returns grounded facts as text; the model may only phrase those facts.
import { getCreatorRecord, getPortfolio } from "./arc-data"
import { parseScreenerQuery } from "./agent-intent"
import { coinsIn, getNews } from "./news"
import { getHyperliquidMarkets } from "./hyperliquid"
import { times, usd } from "./riven-format"
import {
  DISCLAIMER,
  compareTokens,
  explainPerp,
  explainTicker,
  explainToken,
  marketOverview,
  perpsOverview,
  rugAlerts,
  screenerAnswer,
  type AgentReply,
  type AgentTopic,
} from "./riven-agent"

export interface ToolContext {
  /** Wallet proven by the signed session cookie; null = not verified. */
  wallet: string | null
  /** The token or perp pair on the page the question came from. */
  topic?: AgentTopic
  /** The token Riven last talked about. */
  subject?: string
}

export interface AgentTool {
  name: string
  description: string
  /** JSON Schema for the arguments. */
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] }
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<AgentReply>
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const fail = (msg: string): AgentReply => ({ text: `${msg} ${DISCLAIMER}`, tokens: [] })

export const TOOLS: AgentTool[] = [
  {
    name: "get_token",
    description:
      "Risk score, flags, liquidity, holders, creator history and recent activity for ONE token on Arc. Use for any question about a specific token.",
    parameters: {
      type: "object",
      properties: { token: { type: "string", description: "A 0x contract address or a ticker like PEPE or $PEPE" } },
      required: ["token"],
    },
    async run(args) {
      const ref = text(args.token, 60).replace(/^\$/, "")
      if (!ref) return fail("No token given.")
      return ADDRESS.test(ref) ? explainToken(ref.toLowerCase()) : explainTicker(ref)
    },
  },
  {
    name: "screen_tokens",
    description:
      "Find and rank Arc tokens with the screener. Pass the request in plain English: e.g. 'biggest gainers in the last hour', 'safest new launches', 'under $50K market cap with socials', 'most liquid', 'riskiest'.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "The screener request in plain English" } },
      required: ["query"],
    },
    async run(args) {
      const parsed = parseScreenerQuery(text(args.query, 300))
      if (!parsed) return fail("I couldn't turn that into screener filters.")
      return screenerAnswer(parsed)
    },
  },
  {
    name: "compare_tokens",
    description: "Side-by-side comparison of 2 to 4 tokens: score, market cap, liquidity, volume, flags.",
    parameters: {
      type: "object",
      properties: {
        tokens: { type: "array", items: { type: "string" }, description: "Tickers or 0x addresses, 2 to 4 of them" },
      },
      required: ["tokens"],
    },
    async run(args) {
      const refs = Array.isArray(args.tokens) ? args.tokens.map((t) => text(t, 60).replace(/^\$/, "")).filter(Boolean).slice(0, 4) : []
      if (refs.length < 2) return fail("I need at least two tokens to compare.")
      return compareTokens(refs)
    },
  },
  {
    name: "get_creator",
    description: "A creator wallet's launch history on Arc: how many tokens, how many alive, dead or rugged, best peak.",
    parameters: {
      type: "object",
      properties: { wallet: { type: "string", description: "The creator's 0x wallet address" } },
      required: ["wallet"],
    },
    async run(args) {
      const w = text(args.wallet, 60)
      if (!ADDRESS.test(w)) return fail("That isn't a valid wallet address.")
      const r = await getCreatorRecord(w.toLowerCase())
      if (!r) return fail("Riven has no launches from that wallet.")
      return {
        text: [
          `This wallet launched ${r.launches} token${r.launches > 1 ? "s" : ""} that Riven tracks: ${r.alive} still alive, ${r.dead} dead, ${r.rugged} rugged. Best peak: ${times(r.bestAthX)}.`,
          ...r.tokens.slice(0, 6).map((x) => `• ${x.symbol}: peak ${times(x.athX)}, now ${times(x.nowX)} — ${x.status}`),
          `Source: swaps Riven indexed on Arc mainnet. ${DISCLAIMER}`,
        ].join("\n"),
        tokens: [],
      }
    },
  },
  {
    name: "my_portfolio",
    description:
      "The Arc tokens the USER'S OWN verified wallet holds, with each one's risk score and how many are flagged. Use for 'what do I hold', 'is my bag safe', 'which of my tokens are risky'.",
    parameters: { type: "object", properties: {} },
    async run(_args, ctx) {
      if (!ctx.wallet)
        return fail("The user hasn't connected and verified a wallet, so I can't see their holdings. Tell them to connect their wallet and verify it in Ask Riven.")
      const p = await getPortfolio(ctx.wallet)
      if (!p) return fail("I couldn't read that wallet's holdings.")
      if (p.holdings.length === 0) return { text: `Riven sees no tracked Arc tokens in ${ctx.wallet}. ${DISCLAIMER}`, tokens: [] }
      const top = p.holdings.slice(0, 8)
      return {
        text: [
          `Wallet ${ctx.wallet.slice(0, 6)}…${ctx.wallet.slice(-4)} holds ${p.holdings.length} tracked tokens worth about ${usd(p.totalUsd)}; ${p.atRisk} of them are high-risk or flagged.`,
          ...top.map(
            (h) =>
              `• ${h.token.symbol}: ${h.valueUsd === null ? "value unknown" : usd(h.valueUsd)}, score ${h.token.score === null ? "pending" : `${h.token.score.toFixed(1)}/10`}${h.token.fake ? " (flagged)" : ""}`,
          ),
          `Source: Riven's index of Arc token balances. ${DISCLAIMER}`,
        ].join("\n"),
        tokens: top.map((h) => h.token),
      }
    },
  },
  {
    name: "rug_alerts",
    description: "The latest anti-rug alerts on Arc: liquidity pulls, big creator or whale sales, score drops.",
    parameters: { type: "object", properties: {} },
    run: () => rugAlerts(),
  },
  {
    name: "market_overview",
    description: "The state of the whole Arc market right now: volume, real USDC in pools, 24h alerts, trending tokens.",
    parameters: { type: "object", properties: {} },
    run: () => marketOverview(),
  },
  {
    name: "perp_market",
    description: "Price action, scanner signals and the news moving one perp coin (BTC, ETH, SOL, HYPE…).",
    parameters: {
      type: "object",
      properties: { coin: { type: "string", description: "The coin symbol, e.g. BTC" } },
      required: ["coin"],
    },
    async run(args) {
      const coin = text(args.coin, 20).replace(/^\$/, "").toUpperCase()
      if (!/^[A-Z0-9]{1,20}$/.test(coin)) return fail("That isn't a coin symbol.")
      return explainPerp(coin)
    },
  },
  {
    name: "perps_overview",
    description: "Which perp markets are moving and what the signal scanner is calling right now.",
    parameters: { type: "object", properties: {} },
    run: () => perpsOverview(""),
  },
  {
    name: "crypto_news",
    description: "Latest crypto headlines, optionally only those about one coin.",
    parameters: {
      type: "object",
      properties: { coin: { type: "string", description: "Optional coin symbol to filter by" } },
    },
    async run(args) {
      const raw = text(args.coin, 20).replace(/^\$/, "").toUpperCase()
      const known = (await getHyperliquidMarkets().catch(() => [])).map((m) => m.symbol.toUpperCase())
      const coin = raw ? (coinsIn(raw, new Set(known))[0] ?? raw) : undefined
      const news = await getNews({ coin, limit: 6, known }).catch(() => [])
      if (news.length === 0) return fail("Riven's news feeds returned nothing right now.")
      return {
        text: [
          coin ? `Latest headlines about ${coin}:` : "Latest crypto headlines:",
          ...news.map((n) => `• ${n.title} (${n.source}${n.coins.length ? `, about ${n.coins.join(", ")}` : ""})`),
          `Source: crypto news RSS. ${DISCLAIMER}`,
        ].join("\n"),
        tokens: [],
      }
    },
  },
  {
    name: "page_context",
    description:
      "What the user is looking at right now (the token or perp pair on their current page). Use when they say 'this', 'it' or 'here' with no name.",
    parameters: { type: "object", properties: {} },
    async run(_args, ctx) {
      if (ctx.topic?.kind === "token") return explainToken(ctx.topic.address)
      if (ctx.topic?.kind === "perp") return explainPerp(ctx.topic.coin)
      if (ctx.subject) return explainToken(ctx.subject)
      return fail("The user isn't on a token or pair page and hasn't named one.")
    },
  },
]

const byName = new Map(TOOLS.map((t) => [t.name, t]))

/** Run a tool the model asked for. Never throws: a failure becomes an honest "couldn't fetch" fact. */
export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<AgentReply> {
  const tool = byName.get(name)
  if (!tool) return fail(`There is no tool called ${name}.`)
  const a = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
  try {
    return await tool.run(a, ctx)
  } catch (err) {
    console.warn(`[agent-tools] ${name} failed: ${(err as Error).message}`)
    return fail(`I couldn't fetch that data right now (${name} failed), so I can't say anything about it.`)
  }
}

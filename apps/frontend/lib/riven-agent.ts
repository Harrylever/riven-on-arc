// Server-only: answers questions from Riven's own data. Never invents numbers,
// never says buy or sell, always ends with the disclaimer (AGENTS.md agent rules).
import { getAlerts, getCreatorRecord, getScreener, getTokenDetail, searchTokens, type TokenSummary } from "./arc-data"
import { DEFAULT_FILTERS } from "./screener-params"
import { usd, times } from "./riven-format"

export const DISCLAIMER = "Not financial advice. DYOR."

export interface AgentReply {
  text: string
  tokens: TokenSummary[]
}

const ADDRESS = /0x[0-9a-fA-F]{40}/
const TICKER = /\$([A-Za-z0-9]{2,15})/

function line(t: TokenSummary) {
  const s = t.score === null ? "not scored yet" : `${t.score.toFixed(1)}/10`
  return `• ${t.symbol} — ${s}, MC ${usd(t.marketCap)}, 24h vol ${usd(t.volume.h24)}`
}

async function explainToken(address: string): Promise<AgentReply> {
  const t = await getTokenDetail(address)
  if (!t) {
    return {
      text: `Riven isn't tracking that token yet, so I can't say anything about it without guessing. ${DISCLAIMER}`,
      tokens: [],
    }
  }
  const dangers = t.flags.filter((f) => f.level === "danger").map((f) => `⚠ ${f.text}`)
  const warnings = t.flags.filter((f) => f.level === "warning").map((f) => `• ${f.text}`)
  const goods = t.flags.filter((f) => f.level === "good").map((f) => `✓ ${f.text}`)
  const parts = [
    t.score === null
      ? `${t.symbol} isn't scored yet — Riven is still reading its on-chain data.`
      : `${t.symbol} scores ${t.score.toFixed(1)}/10 (${t.verdict})`,
  ]
  if (t.fake) parts.push(`Riven hides it from the screener as fake: ${t.fakeReasons.join("; ")}.`)
  if (dangers.length) parts.push(dangers.slice(0, 4).join("\n"))
  if (warnings.length) parts.push(warnings.slice(0, 3).join("\n"))
  if (goods.length) parts.push(goods.slice(0, 3).join("\n"))
  if (t.creatorRecord && t.creatorRecord.launches > 1) {
    const r = t.creatorRecord
    parts.push(
      `Creator has ${r.launches} launches: ${r.alive} alive, ${r.dead} dead, ${r.rugged} rugged. Best peak ${times(r.bestAthX)}.`,
    )
  }
  if (t.alerts.length) parts.push(`Recent alerts: ${t.alerts.slice(0, 3).map((a) => a.message).join("; ")}.`)
  parts.push(`Source: Riven score ${t.scoredAt ? `from ${new Date(t.scoredAt).toUTCString()}` : "pending"}, Arc mainnet. ${DISCLAIMER}`)
  return { text: parts.join("\n\n"), tokens: [t] }
}

async function explainTicker(ticker: string): Promise<AgentReply> {
  const found = await searchTokens(ticker)
  if (found.length === 1) return explainToken(found[0]!.address)
  if (found.length > 1) {
    return {
      text: [
        `${found.length} tokens on Arc use “${ticker}” — copycats are common. Pick the right contract:`,
        ...found.slice(0, 6).map((t) => `${line(t)}${t.fake ? " (hidden as fake)" : ""}`),
        DISCLAIMER,
      ].join("\n"),
      tokens: found.slice(0, 6),
    }
  }
  return { text: `Riven isn't tracking a token called “${ticker}” on Arc. ${DISCLAIMER}`, tokens: [] }
}

/** Routes a plain-English question to the right lookup. */
export async function answer(question: string): Promise<AgentReply> {
  const q = question.trim()
  const lower = q.toLowerCase()
  const addr = q.match(ADDRESS)?.[0]?.toLowerCase()

  if (addr) {
    if (/creator|dev|wallet|launched|deployer/.test(lower)) {
      const r = await getCreatorRecord(addr)
      if (r) {
        return {
          text: [
            `This wallet launched ${r.launches} token${r.launches > 1 ? "s" : ""} that Riven tracks: ${r.alive} still alive, ${r.dead} dead, ${r.rugged} rugged. Best peak: ${times(r.bestAthX)}.`,
            ...r.tokens.slice(0, 6).map((x) => `• ${x.symbol}: peak ${times(x.athX)}, now ${times(x.nowX)} — ${x.status}`),
            `Source: swaps Riven indexed on Arc mainnet. ${DISCLAIMER}`,
          ].join("\n"),
          tokens: [],
        }
      }
    }
    return explainToken(addr)
  }

  // An explicit $TICKER always means "tell me about this token".
  const dollar = q.match(TICKER)?.[1]
  if (dollar) return explainTicker(dollar)

  if (/rug|alert|dump|pulled/.test(lower)) {
    const alerts = await getAlerts({ limit: 8 })
    if (alerts.length === 0) return { text: `No rugs, dumps or score drops caught recently. ${DISCLAIMER}`, tokens: [] }
    return {
      text: [
        "Latest anti-rug alerts on Arc:",
        ...alerts.map((a) => `• ${a.token.symbol}: ${a.message}`),
        `Source: Riven's rug radar. ${DISCLAIMER}`,
      ].join("\n"),
      tokens: [],
    }
  }

  if (/safe|healthy|low[- ]?risk|best|legit/.test(lower)) {
    const list = (await getScreener({ ...DEFAULT_FILTERS, sort: "safest", band: "healthy" }, 6)).tokens
    if (list.length === 0) {
      return {
        text: `Right now Riven has no token on Arc scoring 7/10 or higher — most launches are flagged. That's the honest answer, not a gap in the data. ${DISCLAIMER}`,
        tokens: [],
      }
    }
    return {
      text: ["Highest-scoring real tokens on Arc right now:", ...list.map(line), `Ranked by Riven score. ${DISCLAIMER}`].join("\n"),
      tokens: list,
    }
  }

  if (/trend|hot|volume|pump|moving|gainer/.test(lower)) {
    const list = (await getScreener({ ...DEFAULT_FILTERS, sort: /gainer|pump/.test(lower) ? "gainers" : "trending" }, 6)).tokens
    return {
      text: [
        "Most traded tokens on Arc in the last 24h (fakes hidden):",
        ...list.map(line),
        `Market data from DexScreener, scores from Riven. ${DISCLAIMER}`,
      ].join("\n"),
      tokens: list,
    }
  }

  if (/new|launch|just/.test(lower)) {
    const list = (await getScreener({ ...DEFAULT_FILTERS, sort: "new" }, 6)).tokens
    return { text: ["Newest real launches on Arc:", ...list.map(line), DISCLAIMER].join("\n"), tokens: list }
  }

  const bare = q.split(/\s+/).length <= 3 ? q.replace(/[^A-Za-z0-9]/g, "") : null
  if (bare) {
    const reply = await explainTicker(bare)
    if (reply.tokens.length > 0) return reply
  }

  return {
    text: [
      "I can answer from Riven's data on Arc. Try:",
      "• “Is $TICKER safe?” or paste a 0x token address",
      "• “Who created 0x…?” for a creator's launch history",
      "• “What rugged today?” · “Safest tokens” · “What's trending?”",
      DISCLAIMER,
    ].join("\n"),
    tokens: [],
  }
}

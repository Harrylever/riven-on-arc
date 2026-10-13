import { NextResponse } from "next/server"
import { getDb } from "@riven/shared"
import { PERPS_ENABLED } from "@/lib/flags"
import { getMockPerpSignals } from "@/lib/mock-perps"

/** Prisma Decimal / string / number → number, with a fallback for null or junk. */
function num(
  v: { toString(): string } | number | string | null | undefined,
  fallback = 0,
): number {
  if (v === null || v === undefined) return fallback
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : fallback
}

// Live signal data: never served from a build-time or route cache.
export const dynamic = "force-dynamic"

/** Invented demo signals are opt-in for local development only — never mixed into real calls. */
const DEMO_SIGNALS =
  process.env.USE_MOCK_DATA === "true" &&
  process.env.VERCEL_ENV !== "production"

const VALID_EXCHANGES = new Set(["BYBIT", "MEXC", "BINANCE"] as const)
const VALID_BIASES = new Set(["LONG", "SHORT"] as const)

/**
 * GET /api/perp-signals — read-only mirror of sakz-bot-main's perpetual-futures signals.
 *
 * Query params:
 * - status: 'all' (default) | 'open' (outcome = 'pending') | 'resolved'
 * - exchange: 'BYBIT' | 'MEXC' | 'BINANCE' (optional)
 * - bias: 'LONG' | 'SHORT' (optional)
 * - symbol: substring filter e.g. 'BTC' (optional)
 * - take: 1-500 (default 100)
 * - latest: '1' alias for status='open'
 *
 * Returns: { signals, stats }
 */
export async function GET(req: Request) {
  // Feature-flagged off: return before touching the DB at all, not just an
  // empty result — this must cost nothing while the perps surface is hidden.
  if (!PERPS_ENABLED) {
    return NextResponse.json({ signals: [], stats: null }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const statusParam = (searchParams.get("status") || "all").toLowerCase()
  const latestParam = searchParams.get("latest") === "1"
  const isOpenOnly = statusParam === "open" || latestParam
  const isResolvedOnly = statusParam === "resolved"

  const rawExchange = (searchParams.get("exchange") || "").toUpperCase()
  const exchange = VALID_EXCHANGES.has(
    rawExchange as "BYBIT" | "MEXC" | "BINANCE",
  )
    ? (rawExchange as "BYBIT" | "MEXC" | "BINANCE")
    : undefined

  const rawBias = (searchParams.get("bias") || "").toUpperCase()
  const bias = VALID_BIASES.has(rawBias as "LONG" | "SHORT")
    ? (rawBias as "LONG" | "SHORT")
    : undefined

  const rawSymbol = (searchParams.get("symbol") || "")
    .trim()
    .toUpperCase()
    .replace(/^\$/, "")
    .replace(/[-/]/g, "")
    .replace(/PERP$/, "")
  const symbol = rawSymbol.length > 0 ? rawSymbol : undefined

  const take = Math.min(
    Math.max(Number(searchParams.get("take")) || 100, 1),
    500,
  )

  try {
    const db = getDb()

    // Expired calls (never hit a target or the stop in 48h) aren't shown.
    const where: Record<string, unknown> = { outcome: { not: "expired" } }
    if (isOpenOnly) {
      where.outcome = "pending"
    } else if (isResolvedOnly) {
      where.outcome = { notIn: ["pending", "expired"] }
    }
    if (exchange) {
      where.exchange = exchange
    }
    if (bias) {
      where.bias = bias
    }
    if (symbol) {
      where.symbol = { contains: symbol, mode: "insensitive" }
    }

    const rows = await db.perpSignal.findMany({
      where,
      orderBy: { scanTime: "desc" },
      take,
      ...(isOpenOnly
        ? { distinct: ["exchange", "symbol", "bias"] as const }
        : {}),
    })

    const mockData = getMockPerpSignals({
      status: statusParam,
      exchange,
      bias,
      symbol,
      take,
    })

    const dbSignals = rows.map((s) => ({
      id: s.id,
      exchange: s.exchange,
      symbol: s.symbol,
      bias: s.bias,
      confidence: s.confidence,
      rawConfidence: s.rawConfidence,
      winProb: s.winProb === null ? null : num(s.winProb),
      entryPrice: num(s.entryPrice),
      entryLow: num(s.entryLow),
      entryHigh: num(s.entryHigh),
      stopLoss: num(s.stopLoss),
      t1: num(s.t1),
      t2: num(s.t2),
      t3: num(s.t3),
      scanTime: s.scanTime.toISOString(),
      outcome: s.outcome,
      resolvedAt: s.resolvedAt ? s.resolvedAt.toISOString() : null,
      entryConfirmed: s.entryConfirmed,
      bestTargetHit: s.bestTargetHit,
      slAfterTarget: s.slAfterTarget,
      createdAt: s.createdAt.toISOString(),
    }))

    // Demo signals only when explicitly enabled. Mixing invented calls in with
    // real ones would show users trade levels no engine ever produced.
    const seenKeys = new Set(
      dbSignals.map((s) => `${s.exchange}-${s.symbol}-${s.bias}`),
    )
    const additionalMock = DEMO_SIGNALS
      ? mockData.signals.filter(
          (m) => !seenKeys.has(`${m.exchange}-${m.symbol}-${m.bias}`),
        )
      : []
    const signals = [...dbSignals, ...additionalMock].slice(0, take)

    // ?stats=0: callers that only need the calls (e.g. the market table's badges) skip
    // the track-record query, which reads every resolved row.
    if (searchParams.get("stats") === "0") return NextResponse.json({ signals })

    // Track record stats: only calls that ended at a target or the stop. Expired calls
    // (neither within 48h) are not a result, and they are purged on a schedule, so counting
    // them would make the rates move depending on when the last purge ran.
    const resolvedRows = await db.perpSignal.findMany({
      where: {
        outcome: { notIn: ["pending", "expired"] },
      },
      select: {
        outcome: true,
        entryConfirmed: true,
        bestTargetHit: true,
        confidence: true,
      },
    })

    const totalResolved = resolvedRows.length
    let missedEntries = 0
    let confirmedTrades = 0
    let wins = 0
    let slHits = 0

    let t1Hits = 0
    let t2Hits = 0
    let t3Hits = 0

    const bands = {
      high: { total: 0, wins: 0, winRate: 0 },
      medium: { total: 0, wins: 0, winRate: 0 },
      low: { total: 0, wins: 0, winRate: 0 },
    }

    for (const r of resolvedRows) {
      if (r.entryConfirmed === 0) {
        missedEntries++
        continue
      }

      confirmedTrades++
      const isWin =
        r.outcome === "t1_hit" ||
        r.outcome === "t2_hit" ||
        r.outcome === "t3_hit"

      if (isWin) {
        wins++
      } else if (r.outcome === "sl_hit") {
        slHits++
      }

      // Reaching T3 means T1 and T2 were reached too: count cumulatively.
      const rank = Math.max(
        r.bestTargetHit === "t3" || r.outcome === "t3_hit" ? 3 : 0,
        r.bestTargetHit === "t2" || r.outcome === "t2_hit" ? 2 : 0,
        r.bestTargetHit === "t1" || r.outcome === "t1_hit" ? 1 : 0,
      )
      if (rank >= 1) t1Hits++
      if (rank >= 2) t2Hits++
      if (rank >= 3) t3Hits++

      const conf = r.confidence ?? 5
      const bandKey = conf >= 8 ? "high" : conf >= 5 ? "medium" : "low"
      bands[bandKey].total++
      if (isWin) {
        bands[bandKey].wins++
      }
    }

    for (const key of ["high", "medium", "low"] as const) {
      bands[key].winRate =
        bands[key].total > 0
          ? Number(((bands[key].wins / bands[key].total) * 100).toFixed(1))
          : 0
    }

    const winRate =
      confirmedTrades > 0
        ? Number(((wins / confirmedTrades) * 100).toFixed(1))
        : 0

    const stopLossRate =
      confirmedTrades > 0
        ? Number(((slHits / confirmedTrades) * 100).toFixed(1))
        : 0

    const stats = {
      totalResolved,
      confirmedTrades,
      missedEntries,
      wins,
      slHits,
      winRate,
      stopLossRate,
      perTargetHit: {
        t1: t1Hits,
        t2: t2Hits,
        t3: t3Hits,
        t1Rate:
          confirmedTrades > 0
            ? Number(((t1Hits / confirmedTrades) * 100).toFixed(1))
            : 0,
        t2Rate:
          confirmedTrades > 0
            ? Number(((t2Hits / confirmedTrades) * 100).toFixed(1))
            : 0,
        t3Rate:
          confirmedTrades > 0
            ? Number(((t3Hits / confirmedTrades) * 100).toFixed(1))
            : 0,
      },
      confidenceBands: bands,
      criteria:
        "Resolved calls only: a target or the stop was hit. Calls that expired without either, and missed entries (never filled), are left out of the rates.",
    }

    return NextResponse.json({ signals, stats })
  } catch (err) {
    console.warn("[api/perp-signals] database unavailable:", err)
    if (!DEMO_SIGNALS) {
      return NextResponse.json(
        { signals: [], stats: null, error: "unavailable" },
        { status: 503 },
      )
    }
    const mock = getMockPerpSignals({
      status: statusParam,
      exchange,
      bias,
      symbol,
      take,
    })
    return NextResponse.json({ ...mock, demo: true })
  }
}

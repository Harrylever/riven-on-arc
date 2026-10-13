export interface MockPerpSignal {
  id: string
  exchange: "BYBIT" | "MEXC" | "BINANCE"
  symbol: string
  bias: "LONG" | "SHORT"
  confidence: number
  entryPrice: number
  entryLow: number
  entryHigh: number
  stopLoss: number
  t1: number
  t2: number
  t3: number
  scanTime: string
  outcome: string
  resolvedAt: string | null
  entryConfirmed: number
  bestTargetHit: string | null
  slAfterTarget: number
  createdAt: string
}

const NOW = Date.now()
const mins = (m: number) => new Date(NOW - m * 60 * 1000).toISOString()
const hours = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString()

export const MOCK_PERP_SIGNALS: MockPerpSignal[] = [
  // 1. Live Active Calls (pending)
  {
    id: "perp-demo-01",
    exchange: "BYBIT",
    symbol: "SOLUSDT",
    bias: "LONG",
    confidence: 9,
    entryPrice: 154.2,
    entryLow: 152.8,
    entryHigh: 154.2,
    stopLoss: 147.5,
    t1: 161.0,
    t2: 168.5,
    t3: 178.0,
    scanTime: mins(18),
    outcome: "pending",
    resolvedAt: null,
    entryConfirmed: 1,
    bestTargetHit: null,
    slAfterTarget: 0,
    createdAt: mins(18),
  },
  {
    id: "perp-demo-02",
    exchange: "BINANCE",
    symbol: "BTCUSDT",
    bias: "LONG",
    confidence: 8,
    entryPrice: 65850.0,
    entryLow: 65200.0,
    entryHigh: 65850.0,
    stopLoss: 63900.0,
    t1: 67800.0,
    t2: 69500.0,
    t3: 72000.0,
    scanTime: mins(42),
    outcome: "pending",
    resolvedAt: null,
    entryConfirmed: 1,
    bestTargetHit: null,
    slAfterTarget: 0,
    createdAt: mins(42),
  },
  {
    id: "perp-demo-03",
    exchange: "MEXC",
    symbol: "ETHUSDT",
    bias: "SHORT",
    confidence: 7,
    entryPrice: 2640.0,
    entryLow: 2640.0,
    entryHigh: 2685.0,
    stopLoss: 2750.0,
    t1: 2550.0,
    t2: 2470.0,
    t3: 2360.0,
    scanTime: mins(75),
    outcome: "pending",
    resolvedAt: null,
    entryConfirmed: 1,
    bestTargetHit: null,
    slAfterTarget: 0,
    createdAt: mins(75),
  },
  {
    id: "perp-demo-04",
    exchange: "BYBIT",
    symbol: "SUIUSDT",
    bias: "LONG",
    confidence: 8,
    entryPrice: 1.84,
    entryLow: 1.79,
    entryHigh: 1.84,
    stopLoss: 1.71,
    t1: 1.98,
    t2: 2.12,
    t3: 2.35,
    scanTime: mins(110),
    outcome: "pending",
    resolvedAt: null,
    entryConfirmed: 1,
    bestTargetHit: null,
    slAfterTarget: 0,
    createdAt: mins(110),
  },
  {
    id: "perp-demo-05",
    exchange: "BINANCE",
    symbol: "AVAXUSDT",
    bias: "SHORT",
    confidence: 6,
    entryPrice: 28.5,
    entryLow: 28.5,
    entryHigh: 29.2,
    stopLoss: 30.4,
    t1: 26.8,
    t2: 25.1,
    t3: 23.5,
    scanTime: mins(150),
    outcome: "pending",
    resolvedAt: null,
    entryConfirmed: 0, // Missed entry test
    bestTargetHit: null,
    slAfterTarget: 0,
    createdAt: mins(150),
  },

  // 2. Resolved Calls (Wins - Target Hits)
  {
    id: "perp-demo-06",
    exchange: "BYBIT",
    symbol: "NEARUSDT",
    bias: "LONG",
    confidence: 9,
    entryPrice: 5.12,
    entryLow: 4.98,
    entryHigh: 5.12,
    stopLoss: 4.75,
    t1: 5.5,
    t2: 5.85,
    t3: 6.4,
    scanTime: hours(6),
    outcome: "t2_hit",
    resolvedAt: hours(3),
    entryConfirmed: 1,
    bestTargetHit: "t2",
    slAfterTarget: 0,
    createdAt: hours(6),
  },
  {
    id: "perp-demo-07",
    exchange: "BINANCE",
    symbol: "LINKUSDT",
    bias: "LONG",
    confidence: 8,
    entryPrice: 11.45,
    entryLow: 11.1,
    entryHigh: 11.45,
    stopLoss: 10.7,
    t1: 12.2,
    t2: 12.9,
    t3: 13.8,
    scanTime: hours(10),
    outcome: "t3_hit",
    resolvedAt: hours(2),
    entryConfirmed: 1,
    bestTargetHit: "t3",
    slAfterTarget: 0,
    createdAt: hours(10),
  },
  {
    id: "perp-demo-08",
    exchange: "MEXC",
    symbol: "DOGEUSDT",
    bias: "SHORT",
    confidence: 7,
    entryPrice: 0.118,
    entryLow: 0.118,
    entryHigh: 0.122,
    stopLoss: 0.126,
    t1: 0.111,
    t2: 0.104,
    t3: 0.096,
    scanTime: hours(14),
    outcome: "t1_hit",
    resolvedAt: hours(8),
    entryConfirmed: 1,
    bestTargetHit: "t1",
    slAfterTarget: 1, // SL after target hit test
    createdAt: hours(14),
  },

  // 3. Resolved Calls (Stopped Out)
  {
    id: "perp-demo-09",
    exchange: "BYBIT",
    symbol: "FETUSDT",
    bias: "LONG",
    confidence: 6,
    entryPrice: 1.42,
    entryLow: 1.37,
    entryHigh: 1.42,
    stopLoss: 1.31,
    t1: 1.56,
    t2: 1.68,
    t3: 1.85,
    scanTime: hours(18),
    outcome: "sl_hit",
    resolvedAt: hours(12),
    entryConfirmed: 1,
    bestTargetHit: null,
    slAfterTarget: 0,
    createdAt: hours(18),
  },

  // 4. Resolved Calls (Missed Entry - Excluded from Win Rate)
  {
    id: "perp-demo-10",
    exchange: "BINANCE",
    symbol: "WIFUSDT",
    bias: "SHORT",
    confidence: 7,
    entryPrice: 2.45,
    entryLow: 2.45,
    entryHigh: 2.55,
    stopLoss: 2.68,
    t1: 2.22,
    t2: 2.05,
    t3: 1.85,
    scanTime: hours(24),
    outcome: "expired",
    resolvedAt: hours(4),
    entryConfirmed: 0, // Missed entry test
    bestTargetHit: null,
    slAfterTarget: 0,
    createdAt: hours(24),
  },
  {
    id: "perp-demo-11",
    exchange: "MEXC",
    symbol: "PEPEUSDT",
    bias: "LONG",
    confidence: 9,
    entryPrice: 0.0000098,
    entryLow: 0.0000094,
    entryHigh: 0.0000098,
    stopLoss: 0.0000089,
    t1: 0.0000108,
    t2: 0.0000119,
    t3: 0.0000135,
    scanTime: hours(30),
    outcome: "t1_hit",
    resolvedAt: hours(20),
    entryConfirmed: 1,
    bestTargetHit: "t1",
    slAfterTarget: 0,
    createdAt: hours(30),
  },
]

export function getMockPerpSignals(params: {
  status?: string
  exchange?: string
  bias?: string
  symbol?: string
  take?: number
}) {
  const status = params.status?.toLowerCase() ?? "all"
  let filtered = [...MOCK_PERP_SIGNALS]

  if (status === "open") {
    filtered = filtered.filter((s) => s.outcome === "pending")
  } else if (status === "resolved") {
    filtered = filtered.filter((s) => s.outcome !== "pending")
  }
  if (params.exchange && params.exchange !== "ALL") {
    filtered = filtered.filter((s) => s.exchange === params.exchange)
  }
  if (params.bias && params.bias !== "ALL") {
    filtered = filtered.filter((s) => s.bias === params.bias)
  }
  if (params.symbol) {
    const q = params.symbol.toUpperCase()
    filtered = filtered.filter((s) => s.symbol.toUpperCase().includes(q))
  }

  const take = Math.min(Math.max(params.take || 100, 1), 500)
  const signals = filtered.slice(0, take)

  // Track record calculated across ALL resolved mock signals
  const resolved = MOCK_PERP_SIGNALS.filter((s) => s.outcome !== "pending" && s.outcome !== "expired")
  const totalResolved = resolved.length

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

  for (const r of resolved) {
    if (r.entryConfirmed === 0) {
      missedEntries++
      continue
    }

    confirmedTrades++
    const isWin =
      r.outcome === "t1_hit" || r.outcome === "t2_hit" || r.outcome === "t3_hit"

    if (isWin) {
      wins++
    } else if (r.outcome === "sl_hit") {
      slHits++
    }

    if (r.bestTargetHit === "t1" || r.outcome === "t1_hit") t1Hits++
    if (r.bestTargetHit === "t2" || r.outcome === "t2_hit") t2Hits++
    if (r.bestTargetHit === "t3" || r.outcome === "t3_hit") t3Hits++

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

  return { signals, stats }
}

export interface TokenIdentity {
  id: string
  mint: string
  name: string
  symbol: string
  decimals: number
  imageUri: string | null
  metadataUri: string | null
  launchpad: string | null
  discoveredVia: string | null
  firstSeenAt: string | Date
  deployerWallet?: string | null
}

export interface TokenScoreDetail {
  id: string
  tokenId: string
  score: number
  gateMultiplier: number
  concentrationScore: number
  burnScore: number
  liquidityScore: number
  verdict: string
  calculatedAt: string | Date
  partial?: boolean
  confidence?: string
}

export interface TokenAuthorityDetail {
  id: string
  tokenId: string
  mintAuthorityRevoked: boolean
  freezeAuthorityRevoked: boolean
  lpLockedOrBurned: boolean
  passCount: number
  checkedAt: string | Date
}

export interface TokenBurnDetail {
  id: string
  tokenId: string
  signature: string
  burnerWallet: string
  amount: number
  isDeployerOrTreasury: boolean
  burnedAt: string | Date
}

export interface TokenMarketData {
  pairAddress?: string
  priceUsd?: number
  marketCapUsd?: number
  liquidityUsd?: number
  volume24hUsd?: number
  priceChange24h?: number
  priceChange1h?: number
  dex?: string
  txns24h?: number
}

export interface TokenDetailResponse {
  token: TokenIdentity
  score: TokenScoreDetail | null
  authorityCheck: TokenAuthorityDetail | null
  recentBurns: TokenBurnDetail[]
  market?: TokenMarketData | null
}

export interface LeaderboardTokenItem {
  tokenId: string
  mint: string
  name: string
  symbol: string
  score: number | null
  calculatedAt: string | Date
  imageUri?: string | null
  priceUsd?: number | null
  marketCapUsd?: number | null
  liquidityUsd?: number | null
  volume24hUsd?: number | null
  priceChange24h?: number | null
  firstSeenAt?: string | Date
  launchpad?: string | null
  dex?: string | null
  txns24h?: number | null
  priceChange5m?: number | null
  priceChange1h?: number | null
  priceChange6h?: number | null
  volume5mUsd?: number | null
  volume1hUsd?: number | null
  volume6hUsd?: number | null
  boosts?: number | null
  traders?: number | null
  holderCount?: number | null
  /** True once the bonding curve completed or the token moved to an AMM pool. */
  graduated?: boolean | null
  /** 0-1 share of the bonding curve sold; null once graduated or not a curve token. */
  bondingProgress?: number | null
  deployerWallet?: string | null
  curveMarketCapSol?: number | null
  /** SOL sitting in the bonding curve — the real liquidity for a pre-graduation token. */
  curveSolReserves?: number | null
  twitter?: string | null
  website?: string | null
  telegram?: string | null
  xVerified?: boolean
}

export interface LeaderboardResponse {
  tokens: LeaderboardTokenItem[]
  source?: "db" | "dexscreener" | "mock" | "arc-indexing"
}

export const MOCK_TOKENS: TokenDetailResponse[] = [
  // 1. Green (~74 score): All 3 checks pass, solid metrics
  {
    token: {
      id: "mock-token-green-1",
      mint: "Grn11111111111111111111111111111111111111111",
      name: "Solaris Nexus",
      symbol: "SOLAR",
      decimals: 6,
      imageUri: null,
      metadataUri: null,
      launchpad: "CLAWPUMP",
      discoveredVia: "WEBHOOK",
      firstSeenAt: "2026-09-20T10:00:00.000Z",
    },
    score: {
      id: "score-green-1",
      tokenId: "mock-token-green-1",
      score: 74,
      gateMultiplier: 1.0,
      concentrationScore: 8.2,
      burnScore: 7.0,
      liquidityScore: 6.8,
      verdict: "LOOKS_HEALTHY",
      calculatedAt: "2026-09-20T23:30:00.000Z",
    },
    authorityCheck: {
      id: "auth-green-1",
      tokenId: "mock-token-green-1",
      mintAuthorityRevoked: true,
      freezeAuthorityRevoked: true,
      lpLockedOrBurned: true,
      passCount: 3,
      checkedAt: "2026-09-20T23:30:00.000Z",
    },
    recentBurns: [
      {
        id: "burn-green-1",
        tokenId: "mock-token-green-1",
        signature:
          "5GrnSig11111111111111111111111111111111111111111111111111111111111111111",
        burnerWallet: "TreasuryDeployerWallet1111111111111111111111",
        amount: 50000000000,
        isDeployerOrTreasury: true,
        burnedAt: "2026-09-20T11:00:00.000Z",
      },
    ],
    market: {
      pairAddress: "B5PXjnNaxboDqNThTPLp1XE9BJiYoQuYiTW146mzNiJ3",
      priceUsd: 0.042,
      marketCapUsd: 4200000,
      liquidityUsd: 650000,
      volume24hUsd: 1200000,
      priceChange24h: 18.4,
    },
  },

  // 2. Yellow (~58 score): All 3 pass, moderate concentration/liquidity
  {
    token: {
      id: "mock-token-yellow-2",
      mint: "Ylw22222222222222222222222222222222222222222",
      name: "Pulse Protocol",
      symbol: "PULSE",
      decimals: 6,
      imageUri: null,
      metadataUri: null,
      launchpad: "PUMPFUN",
      discoveredVia: "WEBHOOK",
      firstSeenAt: "2026-09-20T14:30:00.000Z",
    },
    score: {
      id: "score-yellow-2",
      tokenId: "mock-token-yellow-2",
      score: 58,
      gateMultiplier: 1.0,
      concentrationScore: 6.0,
      burnScore: 5.5,
      liquidityScore: 5.8,
      verdict: "MIXED",
      calculatedAt: "2026-09-20T23:35:00.000Z",
    },
    authorityCheck: {
      id: "auth-yellow-2",
      tokenId: "mock-token-yellow-2",
      mintAuthorityRevoked: true,
      freezeAuthorityRevoked: true,
      lpLockedOrBurned: true,
      passCount: 3,
      checkedAt: "2026-09-20T23:35:00.000Z",
    },
    recentBurns: [],
    market: {
      pairAddress: "B5PXjnNaxboDqNThTPLp1XE9BJiYoQuYiTW146mzNiJ3",
      priceUsd: 0.0012,
      marketCapUsd: 1200000,
      liquidityUsd: 140000,
      volume24hUsd: 340000,
      priceChange24h: -5.2,
    },
  },

  // 3. Red (~30 score): 1 check failed (LP unlocked, gate 0.5)
  {
    token: {
      id: "mock-token-red-3",
      mint: "Red33333333333333333333333333333333333333333",
      name: "Viper Swap",
      symbol: "VIPER",
      decimals: 9,
      imageUri: null,
      metadataUri: null,
      launchpad: "LAUNCHLAB",
      discoveredVia: "WEBHOOK",
      firstSeenAt: "2026-09-20T18:00:00.000Z",
    },
    score: {
      id: "score-red-3",
      tokenId: "mock-token-red-3",
      score: 30,
      gateMultiplier: 0.5,
      concentrationScore: 7.0,
      burnScore: 4.0,
      liquidityScore: 6.0,
      verdict: "RISKY",
      calculatedAt: "2026-09-20T23:40:00.000Z",
    },
    authorityCheck: {
      id: "auth-red-3",
      tokenId: "mock-token-red-3",
      mintAuthorityRevoked: true,
      freezeAuthorityRevoked: true,
      lpLockedOrBurned: false,
      passCount: 2,
      checkedAt: "2026-09-20T23:40:00.000Z",
    },
    recentBurns: [],
    market: {
      pairAddress: "B5PXjnNaxboDqNThTPLp1XE9BJiYoQuYiTW146mzNiJ3",
      priceUsd: 0.00005,
      marketCapUsd: 48000,
      liquidityUsd: 12000,
      volume24hUsd: 95000,
      priceChange24h: -32.1,
    },
  },

  // 4. Hard-Red capped at 20: all 3 checks failed (gate 0.0, score capped at 20)
  {
    token: {
      id: "mock-token-hardred-4",
      mint: "HardRed44444444444444444444444444444444444444",
      name: "Shadow Mint",
      symbol: "SHADOW",
      decimals: 9,
      imageUri: null,
      metadataUri: null,
      launchpad: "PUMPFUN",
      discoveredVia: "WEBHOOK",
      firstSeenAt: "2026-09-20T21:00:00.000Z",
    },
    score: {
      id: "score-hardred-4",
      tokenId: "mock-token-hardred-4",
      score: 0,
      gateMultiplier: 0.0,
      concentrationScore: 4.5,
      burnScore: 0.0,
      liquidityScore: 2.0,
      verdict: "RISKY",
      calculatedAt: "2026-09-20T23:45:00.000Z",
    },
    authorityCheck: {
      id: "auth-hardred-4",
      tokenId: "mock-token-hardred-4",
      mintAuthorityRevoked: false,
      freezeAuthorityRevoked: false,
      lpLockedOrBurned: false,
      passCount: 0,
      checkedAt: "2026-09-20T23:45:00.000Z",
    },
    recentBurns: [],
    market: {
      pairAddress: "B5PXjnNaxboDqNThTPLp1XE9BJiYoQuYiTW146mzNiJ3",
      priceUsd: 0.000002,
      marketCapUsd: 2100,
      liquidityUsd: 500,
      volume24hUsd: 8000,
      priceChange24h: -85.5,
    },
  },

  // 5. Sparse / Null fields: Newly discovered or unresolved token
  {
    token: {
      id: "mock-token-null-5",
      mint: "Null55555555555555555555555555555555555555555",
      name: "Aether Unindexed",
      symbol: "AETH",
      decimals: 6,
      imageUri: null,
      metadataUri: null,
      launchpad: null,
      discoveredVia: "ON_DEMAND",
      firstSeenAt: "2026-09-20T23:50:00.000Z",
    },
    score: null,
    authorityCheck: null,
    recentBurns: [],
    market: null,
  },
]

export function getMockLeaderboard(): LeaderboardResponse {
  return {
    tokens: MOCK_TOKENS.map((item) => ({
      tokenId: item.token.id,
      mint: item.token.mint,
      name: item.token.name,
      symbol: item.token.symbol,
      score: item.score?.score ?? 0,
      calculatedAt: item.score?.calculatedAt ?? item.token.firstSeenAt,
      imageUri: item.token.imageUri,
      priceUsd: item.market?.priceUsd ?? null,
      marketCapUsd: item.market?.marketCapUsd ?? null,
      liquidityUsd: item.market?.liquidityUsd ?? null,
      volume24hUsd: item.market?.volume24hUsd ?? null,
      priceChange24h: item.market?.priceChange24h ?? null,
    })).sort((a, b) => b.score - a.score),
  }
}

export function getMockTokenByMint(mint: string): TokenDetailResponse | null {
  return MOCK_TOKENS.find((item) => item.token.mint === mint) ?? null
}

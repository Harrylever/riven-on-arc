export const ARC_SCORING_V1 = {
  totalMax: 10,
  bands: {
    risk: { min: 0, max: 4.9 },
    caution: { min: 5, max: 6.9 },
    healthy: { min: 7, max: 10 },
  },
  authority: {
    noLiveMint: 2,
    noUpgradeableAdmin: 1,
    noPauseBlacklist: 1,
    taxPenalty: 1,
    liveMintOrUpgradeCap: 4.9,
    liveBlacklistCap: 5.9,
  },
  lpLock: {
    lockedForever: 3,
    timeLockedLong: 2,
    timeLockedShort: 1,
    withdrawable: 0,
    noLiquidity: null,
  },
  concentration: {
    maxPoints: 2,
    threshold: 0.25,
  },
  burns: {
    maxPoints: 1,
    attributedOnly: true,
  },
} as const;

export type ArcScoreBand = keyof typeof ARC_SCORING_V1.bands;

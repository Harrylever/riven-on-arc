// Where is an unscored token on its way to a score? Derived from what the database already knows, so the token page
// can show real progress instead of a spinner. No server-only imports: used by the API route and its tests.

export type ScanState =
  /** it has a score */
  | "scored"
  /** its history is too long (or the RPC cannot serve it): it will not be scored, and says so */
  | "cannot"
  /** the indexer has not reached this token's launch block yet */
  | "waiting_indexer"
  /** the token's transfer history is being read */
  | "reading_holders"
  /** asked for, and the holder history is in: the next 20-second pass scores it */
  | "scoring"
  /** nobody has asked yet */
  | "idle"

export interface ScanInput {
  score: number | null
  holderHistory: string | null
  /** ms timestamp of the last "score this" request */
  requestedAt: number | null
  launchBlock: number | null
  /** The token's launch pool venue (UNISWAP_V4, BONDING_CURVE, OTHER...). OTHER pools cannot be read, so cannot be scored. */
  poolVenue: string | null
  /** how far the activity indexer has read */
  activityBlock: number | null
  now: number
}

export interface ScanStatus {
  state: ScanState
  message: string
  /** Rough minutes until the indexer reaches the token, for "waiting_indexer". */
  minutes?: number
}

const REQUEST_WINDOW_MS = 30 * 60_000
/** Arc produces a block about every half second. */
const SECONDS_PER_BLOCK = 0.51

export function scanStatus(i: ScanInput): ScanStatus {
  if (i.score !== null) return { state: "scored", message: "Scored." }
  if (i.poolVenue === "OTHER")
    return {
      state: "cannot",
      message:
        "This token trades on a kind of pool Riven can't read yet (it reads Uniswap v4 pools and launchpad curves), so it can't be scored. Riven doesn't guess a score.",
    }
  if (i.holderHistory === "too_long")
    return { state: "cannot", message: "This token's history is longer than Riven can replay, so it stays unscored rather than guessed." }
  if (i.holderHistory === "unavailable")
    return { state: "cannot", message: "The chain node could not serve this token's history, so it stays unscored rather than guessed." }
  if (i.launchBlock !== null && i.activityBlock !== null && i.launchBlock > i.activityBlock) {
    const minutes = Math.max(1, Math.ceil(((i.launchBlock - i.activityBlock) * SECONDS_PER_BLOCK) / 60))
    return {
      state: "waiting_indexer",
      minutes,
      message: `Riven's indexer is about ${minutes} min behind this token's launch. It scores the token as soon as it catches up.`,
    }
  }
  const asked = i.requestedAt !== null && i.now - i.requestedAt < REQUEST_WINDOW_MS
  if (i.holderHistory === "partial")
    return {
      state: asked ? "reading_holders" : "idle",
      message: asked ? "Reading every transfer since launch to see who holds the supply. Busy tokens take longer." : "Not scored yet.",
    }
  return {
    state: asked ? "scoring" : "idle",
    message: asked ? "Checking the contract, the liquidity and the holders." : "Not scored yet.",
  }
}

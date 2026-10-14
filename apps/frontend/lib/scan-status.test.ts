import { describe, expect, test } from "bun:test"
import { scanStatus, type ScanInput } from "./scan-status"

const NOW = 1_800_000_000_000
const base: ScanInput = { score: null, holderHistory: "complete", poolVenue: "UNISWAP_V4", requestedAt: NOW - 5_000, launchBlock: 100, activityBlock: 200, now: NOW }
const s = (over: Partial<ScanInput>) => scanStatus({ ...base, ...over })

describe("scanStatus", () => {
  test("a scored token is scored, whatever else is true", () => {
    expect(s({ score: 4.9, holderHistory: "partial" }).state).toBe("scored")
  })
  test("a token on a pool type Riven cannot read is told so at once, not left 'scoring'", () => {
    const r = s({ poolVenue: "OTHER", holderHistory: "partial" })
    expect(r.state).toBe("cannot")
    expect(r.message).toContain("can't read yet")
    expect(s({ poolVenue: "BONDING_CURVE" }).state).toBe("scoring")
  })
  test("a history Riven cannot replay says so, instead of spinning forever", () => {
    expect(s({ holderHistory: "too_long" })).toMatchObject({ state: "cannot" })
    expect(s({ holderHistory: "unavailable" }).message).toContain("rather than guessed")
  })
  test("a token launched after the indexer's position waits for it, with a time estimate", () => {
    const r = s({ launchBlock: 200 + 1200, activityBlock: 200 })
    expect(r.state).toBe("waiting_indexer")
    expect(r.minutes).toBe(11) // 1200 blocks * 0.51s = 612s
  })
  test("partial history that was asked for is being read; not asked yet is idle", () => {
    expect(s({ holderHistory: "partial" }).state).toBe("reading_holders")
    expect(s({ holderHistory: "partial", requestedAt: null }).state).toBe("idle")
  })
  test("complete history that was asked for is being scored", () => {
    expect(s({}).state).toBe("scoring")
    expect(s({ holderHistory: null }).state).toBe("scoring")
  })
  test("an old request does not keep a token 'in progress' forever", () => {
    expect(s({ requestedAt: NOW - 31 * 60_000 }).state).toBe("idle")
  })
})

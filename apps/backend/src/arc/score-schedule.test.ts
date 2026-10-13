import { describe, expect, test } from "bun:test"
import { SCORE_SCHEDULE as cfg, isDead, isDue, type ScheduleToken } from "./score-schedule"

const NOW = Date.UTC(2026, 9, 14, 12)
const M = 60_000
const H = 60 * M
const tok = (over: Partial<ScheduleToken> & { ageMs?: number }): ScheduleToken => ({
  launchTime: new Date(NOW - (over.ageMs ?? 3 * 24 * H)),
  rescoreRequestedAt: null,
  liquidityUsd: 5_000,
  volume24h: 1_000,
  lastScoredAt: undefined,
  lastMethodology: "arc-v5",
  ...over,
})
const due = (t: ScheduleToken) => isDue(t, NOW, "arc-v5")

describe("dead tokens", () => {
  test("a day-old token with known liquidity under the floor is dead", () => {
    expect(isDead(tok({ liquidityUsd: 10 }), NOW)).toBe(true)
  })
  test("unknown liquidity is not dead: the market sync just has not read it yet", () => {
    expect(isDead(tok({ liquidityUsd: null }), NOW)).toBe(false)
  })
  test("a brand-new token is never dead, even at $0 (the first day is when rugs happen)", () => {
    expect(isDead(tok({ ageMs: 30 * M, liquidityUsd: 0 }), NOW)).toBe(false)
  })
})

describe("never scored", () => {
  test("is scored when it has any life, and skipped when old and dead", () => {
    expect(due(tok({}))).toBe(true)
    expect(due(tok({ liquidityUsd: 3 }))).toBe(false)
  })
  test("but a dead token is scored once a visitor asks, and your own fresh token always is", () => {
    expect(due(tok({ liquidityUsd: 3, rescoreRequestedAt: new Date(NOW - 5 * M) }))).toBe(true)
    expect(due(tok({ ageMs: 20 * M, liquidityUsd: 0 }))).toBe(true)
  })
  test("a request goes stale after the window instead of queueing forever", () => {
    expect(due(tok({ liquidityUsd: 3, rescoreRequestedAt: new Date(NOW - cfg.requestWindowMs - M) }))).toBe(false)
  })
})

describe("rescore cadence", () => {
  test("newborn every 2 min, first day every 10, trading every 30, quiet every 6 h", () => {
    expect(due(tok({ ageMs: 30 * M, lastScoredAt: NOW - 3 * M }))).toBe(true)
    expect(due(tok({ ageMs: 30 * M, lastScoredAt: NOW - 1 * M }))).toBe(false)
    expect(due(tok({ ageMs: 5 * H, lastScoredAt: NOW - 5 * M }))).toBe(false)
    expect(due(tok({ ageMs: 5 * H, lastScoredAt: NOW - 11 * M }))).toBe(true)
    expect(due(tok({ lastScoredAt: NOW - 20 * M }))).toBe(false)
    expect(due(tok({ lastScoredAt: NOW - 31 * M }))).toBe(true)
    expect(due(tok({ volume24h: 0, lastScoredAt: NOW - 2 * H }))).toBe(false)
    expect(due(tok({ volume24h: 0, lastScoredAt: NOW - 7 * H }))).toBe(true)
  })
  test("a dead token that was scored is still re-checked on the slow cadence, so a pulled pool is noticed", () => {
    expect(due(tok({ liquidityUsd: 0, volume24h: 0, lastScoredAt: NOW - 7 * H }))).toBe(true)
  })
  test("a methodology change rescores it right away", () => {
    expect(due(tok({ lastScoredAt: NOW - M, lastMethodology: "arc-v4" }))).toBe(true)
  })
})

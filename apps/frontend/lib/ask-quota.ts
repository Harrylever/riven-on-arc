// Server-only. Daily Ask Riven allowance: 10 questions for a verified wallet, 3
// without one, plus a per-IP ceiling so many wallets on one machine can't farm it.
//
// Three counters per UTC day:
//   wallet  – calls by a verified wallet                 (limit WALLET_LIMIT)
//   anon    – calls with no verified wallet, by IP hash  (limit ANON_LIMIT)
//   ip      – every call from an IP hash                 (limit IP_CEILING)
import { createHash } from "node:crypto"
import { getDb } from "@riven/shared"

export const WALLET_LIMIT = 10
export const ANON_LIMIT = 3
export const IP_CEILING = 30

export type CounterKind = "wallet" | "anon" | "ip"
export type Tier = "wallet" | "anon"

/** Where the counts live. Prisma in production, a Map in tests. */
export interface QuotaStore {
  /** Add `by` to the counter and return its new value. */
  add(kind: CounterKind, key: string, day: string, by: 1 | -1): Promise<number>
  get(kind: CounterKind, key: string, day: string): Promise<number>
}

export interface Usage {
  tier: Tier
  used: number
  limit: number
  /** ISO time the allowance resets (next 00:00 UTC). */
  resetAt: string
}

export type Decision =
  | { ok: true; usage: Usage; release: () => Promise<void> }
  | { ok: false; reason: "tier" | "ip"; usage: Usage }

export interface Identity {
  /** Lower-case 0x address proven by the signed session, or null. */
  wallet: string | null
  /** Hash of the caller's IP (see hashIp). */
  ipHash: string
}

export const utcDay = (now = new Date()) => now.toISOString().slice(0, 10)

export function nextResetAt(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

/** IPs are stored only as a salted hash. */
export function hashIp(ip: string, secret: string): string {
  return createHash("sha256").update(`${secret}|${ip}`).digest("hex").slice(0, 32)
}

function plan(id: Identity) {
  return id.wallet
    ? { tier: "wallet" as const, kind: "wallet" as const, key: id.wallet, limit: WALLET_LIMIT }
    : { tier: "anon" as const, kind: "anon" as const, key: id.ipHash, limit: ANON_LIMIT }
}

/** Current usage without spending a call. */
export async function peekUsage(store: QuotaStore, id: Identity, now = new Date()): Promise<Usage> {
  const p = plan(id)
  const used = await store.get(p.kind, p.key, utcDay(now))
  return { tier: p.tier, used, limit: p.limit, resetAt: nextResetAt(now) }
}

/**
 * Spend one call. Counters are bumped first and rolled back if any limit is
 * exceeded, so concurrent requests can't slip past the limit. `release()` hands
 * the call back (used when our side fails after the call was spent).
 */
export async function spendCall(store: QuotaStore, id: Identity, now = new Date()): Promise<Decision> {
  const day = utcDay(now)
  const p = plan(id)
  const resetAt = nextResetAt(now)

  const tierUsed = await store.add(p.kind, p.key, day, 1)
  const ipUsed = await store.add("ip", id.ipHash, day, 1)
  const rollback = async () => {
    await Promise.all([store.add(p.kind, p.key, day, -1), store.add("ip", id.ipHash, day, -1)])
  }

  if (tierUsed > p.limit) {
    await rollback()
    return { ok: false, reason: "tier", usage: { tier: p.tier, used: p.limit, limit: p.limit, resetAt } }
  }
  if (ipUsed > IP_CEILING) {
    await rollback()
    return { ok: false, reason: "ip", usage: { tier: p.tier, used: tierUsed - 1, limit: p.limit, resetAt } }
  }
  let released = false
  return {
    ok: true,
    usage: { tier: p.tier, used: tierUsed, limit: p.limit, resetAt },
    release: async () => {
      if (released) return
      released = true
      await rollback()
    },
  }
}

/** Postgres-backed store: one atomic upsert per change. */
export const prismaQuotaStore: QuotaStore = {
  async add(kind, key, day, by) {
    const row = await getDb().askUsage.upsert({
      where: { kind_key_day: { kind, key, day } },
      create: { kind, key, day, count: Math.max(by, 0) },
      update: { count: { increment: by } },
      select: { count: true },
    })
    return row.count
  },
  async get(kind, key, day) {
    const row = await getDb().askUsage.findUnique({
      where: { kind_key_day: { kind, key, day } },
      select: { count: true },
    })
    return row?.count ?? 0
  },
}

/** In-memory store for tests. */
export function memoryQuotaStore(): QuotaStore {
  const m = new Map<string, number>()
  const k = (kind: string, key: string, day: string) => `${kind}|${key}|${day}`
  return {
    async add(kind, key, day, by) {
      const next = Math.max((m.get(k(kind, key, day)) ?? 0) + by, 0)
      m.set(k(kind, key, day), next)
      return next
    },
    async get(kind, key, day) {
      return m.get(k(kind, key, day)) ?? 0
    },
  }
}

import { describe, expect, test } from "bun:test"

// The step timeout is read when the module loads, so set a tiny one first (30 ms).
process.env.ARC_STEP_TIMEOUT_MIN = "0.0005"
const { ArcPipelineService } = await import("./pipeline.service")

const ok = (name: string, ran: string[]) => async () => {
  ran.push(name)
  return { done: name }
}

function build(over: Record<string, () => Promise<unknown>> = {}) {
  const ran: string[] = []
  const svc = new ArcPipelineService(
    { indexLaunchpadsOnce: over.launches ?? ok("launches", ran) } as never,
    { indexPoolsOnce: over.pools ?? ok("pools", ran), verifyQuoteCurrenciesOnce: ok("quotes", ran) } as never,
    { indexActivityOnce: over.activity ?? ok("activity", ran) } as never,
    { syncOnce: over.market ?? ok("market", ran) } as never,
    { backfillOnce: over.backfill ?? ok("backfill", ran) } as never,
    { scoreOnce: ok("scoring", ran) } as never,
  )
  return { svc, ran }
}

describe("pipeline steps", () => {
  test("a step that never returns is reported by name and the later steps still run", async () => {
    const { svc, ran } = build({ pools: () => new Promise(() => {}) })
    const out = (await svc.runOnce({ score: false })) as Record<string, { error?: string }>
    expect(out.pools?.error).toContain("pool indexing timed out")
    // activity, market sync and holder backfill come after pool indexing and must not be starved by it
    expect(ran).toEqual(expect.arrayContaining(["launches", "activity", "market", "backfill"]))
    const status = svc.getStatus()
    expect(status.steps["pool indexing"]?.ok).toBe(false)
    expect(status.steps["market sync"]?.ok).toBe(true)
    expect(status.lastFinishedAt).not.toBeNull()
  })
  test("a step that throws is reported and does not stop the run", async () => {
    const { svc, ran } = build({ market: async () => { throw new Error("DexScreener 500") } })
    const out = (await svc.runOnce({ score: false })) as Record<string, { error?: string }>
    expect(out.market?.error).toBe("DexScreener 500")
    expect(ran).toContain("backfill")
  })
})

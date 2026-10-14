import { describe, expect, test } from "bun:test"
import type { PublicClient } from "viem"
import { USDC, UNISWAP_V3_POSITION_MANAGER } from "./config"
import { findLaunchPosition, pairsWithUsdc, pickLaunchPosition, readV3, v3LpState, type MintLog, type PositionTransferLog } from "./v3"

const NPM = UNISWAP_V3_POSITION_MANAGER
const ZERO = "0x0000000000000000000000000000000000000000"
const WALLET = "0x849290aa3e000000000000000000000000000001"
const TOKEN = "0x3333f23800a32de29cc102ff1a6ee90b3e413333"
const POOL = "0x12c641c0d6068220caa329e4ddd3e1090b43f665"

// Modelled on the real MURMUR pool (liquidity minted through the position manager, full range, NFT #55259).
const mint = (over: Partial<MintLog> = {}): MintLog => ({
  sender: NPM, owner: NPM, tickLower: -887220, tickUpper: 887220, amount: 5_000_000n, blockNumber: 24_815_273n, logIndex: 4, transactionHash: "0xaaa", ...over,
})
const nftMint = (over: Partial<PositionTransferLog> = {}): PositionTransferLog => ({ from: ZERO, to: WALLET, tokenId: 55259n, transactionHash: "0xaaa", ...over })

describe("pickLaunchPosition", () => {
  test("finds the NFT minted in the same transaction as the first liquidity", () => {
    expect(pickLaunchPosition([mint()], [nftMint()])).toMatchObject({ v3: true, tokenId: "55259", tickLower: -887220, tickUpper: 887220, mintBlock: "24815273", txHash: "0xaaa" })
  })
  test("takes the earliest mint, whatever order the logs come in, and ignores empty mints", () => {
    const later = mint({ blockNumber: 24_815_300n, transactionHash: "0xbbb", tickLower: -100, tickUpper: 100 })
    const empty = mint({ blockNumber: 24_815_200n, amount: 0n, transactionHash: "0xccc" })
    const r = pickLaunchPosition([later, empty, mint()], [nftMint({ transactionHash: "0xbbb", tokenId: 9n }), nftMint()])
    expect(r?.txHash).toBe("0xaaa")
    expect(r?.tokenId).toBe("55259")
  })
  test("orders mints in the same block by log index", () => {
    const a = mint({ logIndex: 9, transactionHash: "0x2", tickLower: 1 })
    const b = mint({ logIndex: 3, transactionHash: "0x1", tickLower: 2 })
    expect(pickLaunchPosition([a, b], [])?.txHash).toBe("0x1")
  })
  test("does not take an NFT from another transaction", () => {
    expect(pickLaunchPosition([mint()], [nftMint({ transactionHash: "0xother" })])?.tokenId).toBeNull()
  })
  test("liquidity not minted through the position manager has no NFT", () => {
    const direct = mint({ sender: "0x00000000000000000000000000000000000000d1", owner: "0x00000000000000000000000000000000000000d1" })
    const r = pickLaunchPosition([direct], [nftMint()])
    expect(r?.tokenId).toBeNull()
    expect(r?.owner).toBe("0x00000000000000000000000000000000000000d1")
  })
  test("no liquidity minted: nothing to find", () => {
    expect(pickLaunchPosition([], [nftMint()])).toBeNull()
  })
})

describe("v3LpState", () => {
  const classify = async (o: string) => (o === WALLET ? ("unlocked" as const) : ("unknown_contract" as const))
  test("no launch position found: nothing is claimed", async () => {
    expect(await v3LpState(null, classify)).toBeNull()
  })
  test("a closed position (the NFT is gone, like C3) is a pull", async () => {
    expect(await v3LpState({ owner: null, liquidity: null }, classify)).toBe("removed")
  })
  test("a position with no liquidity left (like MURMUR) is a pull, even though a wallet still holds the NFT", async () => {
    expect(await v3LpState({ owner: WALLET, liquidity: 0n }, classify)).toBe("removed")
  })
  test("live liquidity held by a plain wallet is unlocked; held by a contract is classified by the shared rules", async () => {
    expect(await v3LpState({ owner: WALLET.toUpperCase().replace("0X", "0x"), liquidity: 10n }, classify)).toBe("unlocked")
    expect(await v3LpState({ owner: "0x00000000000000000000000000000000000000c1", liquidity: 10n }, classify)).toBe("unknown_contract")
  })
})

describe("pairsWithUsdc", () => {
  test("only a pool of this token against the ERC-20 USDC can be read", () => {
    const r = (token0: string, token1: string) => ({ sqrtPriceX96: 1n, fee: 3000, token0, token1, usdcRaw: 0n })
    expect(pairsWithUsdc(r(USDC, TOKEN), TOKEN)).toBe(true)
    expect(pairsWithUsdc(r(TOKEN, USDC), TOKEN)).toBe(true)
    expect(pairsWithUsdc(r(TOKEN, "0x00000000000000000000000000000000000000ee"), TOKEN)).toBe(false)
    expect(pairsWithUsdc(r(USDC, "0x00000000000000000000000000000000000000ee"), TOKEN)).toBe(false)
  })
})

/** A node that answers each contract call from a table, so readV3's handling of reverts can be tested. */
function fakeClient(answers: { positionExists: boolean; liquidity?: bigint; poolFails?: boolean }) {
  return {
    multicall: async ({ contracts }: { contracts: Array<{ functionName: string; address: string }> }) =>
      contracts.map((c) => {
        const ok = (result: unknown) => ({ status: "success" as const, result })
        const bad = { status: "failure" as const, error: new Error("revert") }
        switch (c.functionName) {
          case "slot0": return answers.poolFails ? bad : ok([79228162514264337593543950336n, 0, 0, 0, 0, 0, true])
          case "fee": return ok(3000)
          case "token0": return ok(USDC)
          case "token1": return ok(TOKEN)
          case "balanceOf": return ok(1_234_567n)
          case "ownerOf": return answers.positionExists ? ok(WALLET) : bad
          case "positions": return answers.positionExists ? ok([0n, ZERO, USDC, TOKEN, 3000, 0, 0, answers.liquidity ?? 1n, 0n, 0n, 0n, 0n]) : bad
          default: return bad
        }
      }),
  } as unknown as PublicClient
}

describe("readV3", () => {
  test("reads the pool and the launch position", async () => {
    const r = (await readV3(fakeClient({ positionExists: true, liquidity: 77n }), [{ pool: POOL, positionId: "55259" }])).get(POOL)!
    expect(r.pool).toMatchObject({ fee: 3000, usdcRaw: 1_234_567n, token0: USDC, token1: TOKEN })
    expect(r.position).toEqual({ owner: WALLET, liquidity: 77n })
  })
  test("calls that revert for the NFT mean the position was closed", async () => {
    const r = (await readV3(fakeClient({ positionExists: false }), [{ pool: POOL, positionId: "55612" }])).get(POOL)!
    expect(r.position).toEqual({ owner: null, liquidity: null })
  })
  test("a pool with no launch position has no position reading at all", async () => {
    const r = (await readV3(fakeClient({ positionExists: true }), [{ pool: POOL, positionId: null }])).get(POOL)!
    expect(r.position).toBeNull()
  })
  test("a malformed pool id (\"<pool>:<token>\") is set aside instead of breaking the batch for every other pool", async () => {
    const bad = `${POOL}:${TOKEN}` as `0x${string}`
    const out = await readV3(fakeClient({ positionExists: true }), [{ pool: bad, positionId: null }, { pool: POOL, positionId: "55259" }])
    expect(out.get(bad.toLowerCase())).toEqual({ pool: null, position: null })
    expect(out.get(POOL)!.pool).not.toBeNull()
  })
  test("a pool that cannot be read says so instead of guessing", async () => {
    const r = (await readV3(fakeClient({ positionExists: true, poolFails: true }), [{ pool: POOL, positionId: "1" }])).get(POOL)!
    expect(r.pool).toBeNull()
  })
})

/** A node whose pool logs appear only from a given block, counting the getLogs calls it receives. */
function logClient(firstMintBlock: bigint | null) {
  const calls: Array<{ address: string; from: bigint; to: bigint }> = []
  const client = {
    getLogs: async (q: { address: string; fromBlock: bigint; toBlock: bigint }) => {
      calls.push({ address: q.address, from: q.fromBlock, to: q.toBlock })
      if (q.address.toLowerCase() === NPM) return [{ args: { from: ZERO, to: WALLET, tokenId: 55259n }, transactionHash: "0xaaa" }]
      if (firstMintBlock !== null && q.fromBlock <= firstMintBlock && firstMintBlock <= q.toBlock)
        return [{ args: { sender: NPM, owner: NPM, tickLower: -887220, tickUpper: 887220, amount: 5n }, blockNumber: firstMintBlock, logIndex: 1, transactionHash: "0xaaa" }]
      return []
    },
  } as unknown as PublicClient
  return { client, calls }
}

describe("findLaunchPosition", () => {
  test("a mint in the first chunk costs two log queries, not a scan of the whole window", async () => {
    const { client, calls } = logClient(1_000_050n)
    const r = await findLaunchPosition(client, POOL as `0x${string}`, 1_000_000n, 2_000_000n)
    expect(r?.tokenId).toBe("55259")
    expect(calls.length).toBe(2)
    expect(calls[0]!.address).toBe(POOL)
    expect(calls[1]!.address.toLowerCase()).toBe(NPM) // the position manager's Transfer in that block
  })
  test("keeps looking chunk by chunk until it finds the first mint", async () => {
    const { client, calls } = logClient(1_025_000n)
    const r = await findLaunchPosition(client, POOL as `0x${string}`, 1_000_000n, 2_000_000n)
    expect(r?.mintBlock).toBe("1025000")
    expect(calls.filter((c) => c.address === POOL).length).toBe(3) // three 9,999-block chunks
  })
  test("no liquidity anywhere in the window: not found, after a bounded number of queries", async () => {
    const { client, calls } = logClient(null)
    expect(await findLaunchPosition(client, POOL as `0x${string}`, 1_000_000n, 2_000_000n)).toBeNull()
    expect(calls.length).toBeLessThanOrEqual(7)
  })
  test("never reads past the chain head", async () => {
    const { client, calls } = logClient(null)
    await findLaunchPosition(client, POOL as `0x${string}`, 1_000_000n, 1_005_000n)
    expect(Math.max(...calls.map((c) => Number(c.to)))).toBeLessThanOrEqual(1_005_000)
  })
})

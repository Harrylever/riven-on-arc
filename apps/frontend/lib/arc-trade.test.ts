import { describe, expect, test } from "bun:test"
import { decodeAbiParameters, decodeFunctionData, parseAbi, type Address, type Hex } from "viem"
import { ARC, encodeSwap, type PoolKey } from "./arc-trade"

const ROUTER_ABI = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"])
const TOKEN = "0xf2c09536cf44b31a8267cf1cb25a5d8ac5695726" as Address
const USER = "0x00000000000000000000000000000000000000aa" as Address
const KEY: PoolKey = {
  currency0: ARC.usdc,
  currency1: TOKEN,
  fee: 10_000,
  tickSpacing: 200,
  hooks: "0x0000000000000000000000000000000000000000",
}

const POOL_KEY = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const

function decode(data: Hex) {
  const { args } = decodeFunctionData({ abi: ROUTER_ABI, data })
  const [commands, inputs, deadline] = args
  const [actions, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], inputs[0]!)
  const [swap] = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "poolKey", ...POOL_KEY },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "reserved", type: "uint256" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    params[0]!,
  )
  const settle = decodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bool" }], params[1]!)
  const take = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], params[2]!)
  return { commands, deadline, actions, swap, settle, take }
}

describe("encodeSwap (Universal Router V4_SWAP)", () => {
  test("buy: USDC in, token out to the user, with minOut and deadline", () => {
    const d = decode(encodeSwap({ key: KEY, zeroForOne: true, amountIn: 1_000_000n, minOut: 990n, recipient: USER, deadline: 123n }))
    expect(d.commands).toBe("0x10") // V4_SWAP
    expect(d.actions).toBe("0x060b0e") // SWAP_EXACT_IN_SINGLE, SETTLE, TAKE
    expect(d.deadline).toBe(123n)
    expect(d.swap.zeroForOne).toBe(true)
    expect(d.swap.amountIn).toBe(1_000_000n)
    expect(d.swap.amountOutMinimum).toBe(990n)
    expect(d.swap.reserved).toBe(0n)
    expect(d.swap.poolKey.currency0.toLowerCase()).toBe(ARC.usdc.toLowerCase())
    // SETTLE pays USDC from the user (payerIsUser = true); TAKE sends the token to the user.
    expect(d.settle[0].toLowerCase()).toBe(ARC.usdc.toLowerCase())
    expect(d.settle[2]).toBe(true)
    expect(d.take[0].toLowerCase()).toBe(TOKEN)
    expect(d.take[1].toLowerCase()).toBe(USER)
  })

  test("sell: token in, USDC out", () => {
    const d = decode(encodeSwap({ key: KEY, zeroForOne: false, amountIn: 5n, minOut: 1n, recipient: USER, deadline: 1n }))
    expect(d.settle[0].toLowerCase()).toBe(TOKEN)
    expect(d.take[0].toLowerCase()).toBe(ARC.usdc.toLowerCase())
  })
})

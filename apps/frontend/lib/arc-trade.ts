// Server-only. Builds unsigned Uniswap v4 swap transactions for the user's own
// wallet to sign. Riven never holds keys or funds and never broadcasts anything.
import { getDb } from "@clawdex/shared"
import {
  createPublicClient,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  http,
  parseAbi,
  parseAbiItem,
  parseUnits,
  type Address,
  type Hex,
} from "viem"

/**
 * Arc mainnet Uniswap v4 addresses, from developers.uniswap.org/contracts/v4/deployments
 * (2026-10-06) and matched against on-chain activity: 0x4fcA…9Fb1 routes most
 * swaps Riven indexes.
 */
export const ARC = {
  chainId: 5042,
  rpc: process.env.ARC_RPC_URL ?? "https://rpc.mainnet.arc.io",
  usdc: "0x3600000000000000000000000000000000000000" as Address,
  eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address,
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address,
  universalRouter: "0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1" as Address,
  quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94" as Address,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
}

const client = createPublicClient({ transport: http(ARC.rpc, { timeout: 20_000, retryCount: 4, retryDelay: 1_500 }) })

const INITIALIZE = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
)
const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)",
])
const PERMIT2_ABI = parseAbi([
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
])
const ROUTER_ABI = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"])

export interface PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

export interface TxRequest {
  to: Address
  data: Hex
  value: string
  label: string
}

const keyCache = new Map<string, PoolKey>()

/** The v4 PoolKey for a token's USDC pool, read from its Initialize event. */
export async function poolKeyFor(token: string): Promise<{ key: PoolKey; decimals: number } | null> {
  const t = await getDb().token.findUnique({
    where: { mint: token.toLowerCase() },
    include: { pools: { where: { venue: "UNISWAP_V4" }, orderBy: { createdAt: "asc" } } },
  })
  const pool = t?.pools[0]
  if (!t || !pool || t.launchBlock === null) return null
  const cached = keyCache.get(pool.address)
  if (cached) return { key: cached, decimals: t.decimals ?? 18 }
  const logs = await client.getLogs({
    address: ARC.poolManager,
    event: INITIALIZE,
    args: { id: pool.address as Hex },
    fromBlock: t.launchBlock - BigInt(5),
    toBlock: t.launchBlock + BigInt(5),
  })
  const a = logs[0]?.args
  if (!a?.currency0 || !a.currency1 || a.fee === undefined || a.tickSpacing === undefined || !a.hooks) return null
  // Only route USDC pairs: approvals, labels and amounts all assume USDC is one side.
  const usdc = ARC.usdc.toLowerCase()
  if (a.currency0.toLowerCase() !== usdc && a.currency1.toLowerCase() !== usdc) return null
  const key: PoolKey = {
    currency0: a.currency0,
    currency1: a.currency1,
    fee: a.fee,
    tickSpacing: a.tickSpacing,
    hooks: a.hooks,
  }
  keyCache.set(pool.address, key)
  return { key, decimals: t.decimals ?? 18 }
}

/**
 * Universal Router V4_SWAP: SWAP_EXACT_IN_SINGLE → SETTLE → TAKE. Layout copied
 * from real swaps through this router on Arc (2026-10-06): the swap params carry
 * one extra uint256 (0) before hookData, SETTLE pays the open delta from the user
 * via Permit2, TAKE sends the open delta to the recipient.
 */
export function encodeSwap(p: {
  key: PoolKey
  zeroForOne: boolean
  amountIn: bigint
  minOut: bigint
  recipient: Address
  deadline: bigint
}): Hex {
  const currencyIn = p.zeroForOne ? p.key.currency0 : p.key.currency1
  const currencyOut = p.zeroForOne ? p.key.currency1 : p.key.currency0
  const swapParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "reserved", type: "uint256" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [{ poolKey: p.key, zeroForOne: p.zeroForOne, amountIn: p.amountIn, amountOutMinimum: p.minOut, reserved: BigInt(0), hookData: "0x" }],
  )
  const settle = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "bool" }],
    [currencyIn, BigInt(0), true],
  )
  const take = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    [currencyOut, p.recipient, BigInt(0)],
  )
  const v4Input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], ["0x060b0e", [swapParams, settle, take]])
  return encodeFunctionData({ abi: ROUTER_ABI, functionName: "execute", args: ["0x10", [v4Input], p.deadline] })
}

export async function quote(key: PoolKey, zeroForOne: boolean, amountIn: bigint): Promise<bigint | null> {
  const data = encodeFunctionData({
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
  })
  try {
    const res = await client.call({ to: ARC.quoter, data })
    if (!res.data) return null
    const [amountOut] = decodeFunctionResult({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", data: res.data })
    return amountOut
  } catch {
    return null
  }
}

/**
 * Approvals the wallet still needs: token → Permit2, then Permit2 → Universal
 * Router. Always for this trade's exact amount and briefly — never unlimited,
 * so a later phishing signature can't drain the wallet through Permit2.
 */
export async function approvalsNeeded(
  wallet: Address,
  tokenIn: Address,
  amountIn: bigint,
  display: string,
): Promise<TxRequest[]> {
  const [erc20Allowance, p2] = await Promise.all([
    client.readContract({ address: tokenIn, abi: erc20Abi, functionName: "allowance", args: [wallet, ARC.permit2] }),
    client.readContract({ address: ARC.permit2, abi: PERMIT2_ABI, functionName: "allowance", args: [wallet, tokenIn, ARC.universalRouter] }),
  ])
  const out: TxRequest[] = []
  if (erc20Allowance < amountIn) {
    out.push({
      to: tokenIn,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ARC.permit2, amountIn] }),
      value: "0",
      label: `Allow Permit2 to spend ${display} (this trade only)`,
    })
  }
  const [p2Amount, p2Expiry] = p2
  const now = Math.floor(Date.now() / 1000)
  if (p2Amount < amountIn || p2Expiry < now + 300) {
    out.push({
      to: ARC.permit2,
      data: encodeFunctionData({
        abi: PERMIT2_ABI,
        functionName: "approve",
        args: [tokenIn, ARC.universalRouter, amountIn, now + 30 * 60],
      }),
      value: "0",
      label: `Let the Uniswap router use ${display} (expires in 30 min)`,
    })
  }
  return out
}

/** 0.05 USDC (6 decimals) left for gas when buying with USDC. */
const GAS_RESERVE_USDC = BigInt(50_000)

export async function buildTrade(p: {
  token: string
  side: "buy" | "sell"
  amount: string
  wallet: string
  slippageBps: number
}) {
  const wallet = p.wallet.toLowerCase() as Address
  const pk = await poolKeyFor(p.token)
  if (!pk) return { error: "This token has no Uniswap v4 USDC pool Riven can route through." }
  const { key, decimals } = pk
  const usdc = ARC.usdc.toLowerCase()
  const usdcIs0 = key.currency0.toLowerCase() === usdc
  const tokenAddr = (usdcIs0 ? key.currency1 : key.currency0) as Address
  // Buying = USDC in, token out.
  const zeroForOne = p.side === "buy" ? usdcIs0 : !usdcIs0
  const inDecimals = p.side === "buy" ? 6 : decimals
  const outDecimals = p.side === "buy" ? decimals : 6
  // Parse the decimal string exactly ("0.29" must be 290000, not 289999).
  const text = String(p.amount).trim()
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: "Enter an amount greater than zero." }
  let amountIn: bigint
  try {
    amountIn = parseUnits(text, inDecimals)
  } catch {
    return { error: "Enter an amount greater than zero." }
  }
  if (amountIn <= BigInt(0)) return { error: "Enter an amount greater than zero." }
  if (!Number.isFinite(p.slippageBps)) return { error: "Slippage must be a number." }
  const tokenIn = p.side === "buy" ? ARC.usdc : tokenAddr

  const [amountOut, balance] = await Promise.all([
    quote(key, zeroForOne, amountIn),
    client.readContract({ address: tokenIn, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
  ])
  if (amountOut === null || amountOut === BigInt(0)) return { error: "No quote — the pool may be empty or the trade too large." }
  const slippage = BigInt(Math.min(Math.max(Math.round(p.slippageBps), 10), 5000))
  const minOut = (amountOut * (BigInt(10000) - slippage)) / BigInt(10000)
  const approvals = await approvalsNeeded(
    wallet,
    tokenIn,
    amountIn,
    `${text} ${p.side === "buy" ? "USDC" : "tokens"}`,
  )
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)

  return {
    amountIn: (Number(amountIn) / 10 ** inDecimals).toString(),
    amountOut: (Number(amountOut) / 10 ** outDecimals).toString(),
    minOut: (Number(minOut) / 10 ** outDecimals).toString(),
    // USDC is also Arc's gas: keep ~0.05 back on buys so the swap can pay for itself.
    insufficient: balance < amountIn + (p.side === "buy" ? GAS_RESERVE_USDC : BigInt(0)),
    approvals,
    swap: {
      to: ARC.universalRouter,
      data: encodeSwap({ key, zeroForOne, amountIn, minOut, recipient: wallet, deadline }),
      value: "0",
      label: p.side === "buy" ? "Buy" : "Sell",
    } satisfies TxRequest,
  }
}

/** Native USDC (18-dec gas balance) + ERC-20 faces of USDC/EURC for a wallet. */
export async function walletBalances(wallet: string) {
  const w = wallet as Address
  const [native, eurc] = await Promise.all([
    client.getBalance({ address: w }),
    client.readContract({ address: ARC.eurc, abi: erc20Abi, functionName: "balanceOf", args: [w] }).catch(() => BigInt(0)),
  ])
  return { usdc: Number(native) / 1e18, eurc: Number(eurc) / 1e6 }
}

// Server-only. Builds unsigned Uniswap v4 swap transactions for the user's own
// wallet to sign. Riven never holds keys or funds and never broadcasts anything.
import { getDb } from "@riven/shared"
import { DEFAULT_MAX_TRADE_USD, evaluateGuards } from "./trade-guards"
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

const client = createPublicClient({
  transport: http(ARC.rpc, {
    timeout: 20_000,
    retryCount: 4,
    retryDelay: 1_500,
  }),
})

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
const ROUTER_ABI = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
])

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

const keyCache = new Map<string, { at: number; keys: PoolKey[] }>()
const KEY_CACHE_MS = 10 * 60_000
/** Public Arc RPCs refuse topic-filtered ranges beyond ~10k blocks; a paid RPC can raise this. */
const LOG_CHUNK = BigInt(process.env.ARC_TRADE_LOG_CHUNK_BLOCKS ?? "9999")
const LOG_PARALLEL = 3
const MAX_POOL_SCAN = BigInt(500_000)

/** Initialize events for one currency pair, in block chunks that halve when an RPC refuses a range. */
async function initializeLogs(currency0: Address, currency1: Address, from: bigint, to: bigint) {
  const range = async (f: bigint, t: bigint): Promise<Awaited<ReturnType<typeof fetchRange>>> => {
    try {
      return await fetchRange(f, t)
    } catch (err) {
      if (t - f < BigInt(2_000)) throw err
      const mid = (f + t) / BigInt(2)
      return [...(await range(f, mid)), ...(await range(mid + BigInt(1), t))]
    }
  }
  const fetchRange = (f: bigint, t: bigint) =>
    client.getLogs({
      address: ARC.poolManager,
      event: INITIALIZE,
      args: { currency0, currency1 },
      fromBlock: f,
      toBlock: t,
    })
  const chunks: Array<[bigint, bigint]> = []
  for (let f = from; f <= to; f += LOG_CHUNK) {
    chunks.push([f, f + LOG_CHUNK - BigInt(1) > to ? to : f + LOG_CHUNK - BigInt(1)])
  }
  const out: Awaited<ReturnType<typeof fetchRange>> = []
  for (let i = 0; i < chunks.length; i += LOG_PARALLEL) {
    const batch = await Promise.all(chunks.slice(i, i + LOG_PARALLEL).map(([f, t]) => range(f, t)))
    for (const logs of batch) out.push(...logs)
    // A pool is almost always created at or just after launch: once one turns up,
    // the batch that found it (a few tens of thousands of blocks) is enough.
    if (out.length > 0) break
  }
  return out
}

/**
 * Every v4 pool pairing this token with USDC (each fee tier and hook is its own
 * pool), read from Initialize events filtered by the currency pair. The database
 * can't say which pool is the real one for tokens found by pool history, so the
 * caller quotes each candidate and routes through the best.
 */
export async function poolKeysFor(
  token: string,
): Promise<{ keys: PoolKey[]; decimals: number } | null> {
  const mint = token.toLowerCase()
  const t = await getDb().token.findUnique({
    where: { mint },
    select: { decimals: true, launchBlock: true, creationBlock: true },
  })
  if (!t) return null
  const decimals = t.decimals ?? 18
  const cached = keyCache.get(mint)
  if (cached && Date.now() - cached.at < KEY_CACHE_MS) return cached.keys.length ? { keys: cached.keys, decimals } : null

  const head = await client.getBlockNumber()
  const start = t.launchBlock ?? t.creationBlock
  const from = start !== null ? (start > BigInt(5) ? start - BigInt(5) : BigInt(0)) : head > BigInt(1_000_000) ? head - BigInt(1_000_000) : BigInt(0)
  const usdc = ARC.usdc.toLowerCase()
  const usdcIs0 = usdc < mint
  const logs = await initializeLogs(
    (usdcIs0 ? ARC.usdc : mint) as Address,
    (usdcIs0 ? mint : ARC.usdc) as Address,
    from,
    // never scan more than ~500k blocks (about 3 days) for a pool that should exist near launch
    head - from > MAX_POOL_SCAN ? from + MAX_POOL_SCAN : head,
  )
  const seen = new Set<string>()
  const keys: PoolKey[] = []
  for (const l of logs) {
    const a = l.args
    if (!a.currency0 || !a.currency1 || a.fee === undefined || a.tickSpacing === undefined || !a.hooks) continue
    const id = `${a.fee}:${a.tickSpacing}:${a.hooks.toLowerCase()}`
    if (seen.has(id)) continue
    seen.add(id)
    keys.push({ currency0: a.currency0, currency1: a.currency1, fee: a.fee, tickSpacing: a.tickSpacing, hooks: a.hooks })
  }
  // Cache hits for 10 minutes, but never a miss: a flaky RPC must not hide a real pool.
  if (keys.length) keyCache.set(mint, { at: Date.now(), keys })
  return keys.length ? { keys, decimals } : null
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
    [
      {
        poolKey: p.key,
        zeroForOne: p.zeroForOne,
        amountIn: p.amountIn,
        amountOutMinimum: p.minOut,
        reserved: BigInt(0),
        hookData: "0x",
      },
    ],
  )
  const settle = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "bool" }],
    [currencyIn, BigInt(0), true],
  )
  const take = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    [currencyOut, p.recipient, BigInt(0)],
  )
  const v4Input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    ["0x060b0e", [swapParams, settle, take]],
  )
  return encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: "execute",
    args: ["0x10", [v4Input], p.deadline],
  })
}

export async function quote(
  key: PoolKey,
  zeroForOne: boolean,
  amountIn: bigint,
): Promise<bigint | null> {
  const data = encodeFunctionData({
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
  })
  try {
    const res = await client.call({ to: ARC.quoter, data })
    if (!res.data) return null
    const [amountOut] = decodeFunctionResult({
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      data: res.data,
    })
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
    client.readContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: "allowance",
      args: [wallet, ARC.permit2],
    }),
    client.readContract({
      address: ARC.permit2,
      abi: PERMIT2_ABI,
      functionName: "allowance",
      args: [wallet, tokenIn, ARC.universalRouter],
    }),
  ])
  const out: TxRequest[] = []
  if (erc20Allowance < amountIn) {
    out.push({
      to: tokenIn,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [ARC.permit2, amountIn],
      }),
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
  const pks = await poolKeysFor(p.token)
  if (!pks)
    return {
      error: "This token has no Uniswap v4 USDC pool Riven can route through.",
    }
  const { keys, decimals } = pks
  const usdc = ARC.usdc.toLowerCase()
  // Every candidate pool shares the same currency order, so the swap direction is shared too.
  const usdcIs0 = keys[0]!.currency0.toLowerCase() === usdc
  const tokenAddr = (usdcIs0 ? keys[0]!.currency1 : keys[0]!.currency0) as Address
  // Buying = USDC in, token out.
  const zeroForOne = p.side === "buy" ? usdcIs0 : !usdcIs0
  const inDecimals = p.side === "buy" ? 6 : decimals
  const outDecimals = p.side === "buy" ? decimals : 6
  // Parse the decimal string exactly ("0.29" must be 290000, not 289999).
  const text = String(p.amount).trim()
  if (!/^\d+(\.\d+)?$/.test(text))
    return { error: "Enter an amount greater than zero." }
  let amountIn: bigint
  try {
    amountIn = parseUnits(text, inDecimals)
  } catch {
    return { error: "Enter an amount greater than zero." }
  }
  if (amountIn <= BigInt(0))
    return { error: "Enter an amount greater than zero." }
  if (!Number.isFinite(p.slippageBps))
    return { error: "Slippage must be a number." }
  const tokenIn = p.side === "buy" ? ARC.usdc : tokenAddr

  const [quotes, balance] = await Promise.all([
    Promise.all(keys.map((k) => quote(k, zeroForOne, amountIn))),
    client.readContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    }),
  ])
  // Route through whichever pool pays the most for this size.
  let best = -1
  quotes.forEach((q, i) => {
    if (q !== null && q > BigInt(0) && (best < 0 || q > quotes[best]!)) best = i
  })
  const amountOut = best >= 0 ? quotes[best]! : null
  const key = keys[Math.max(best, 0)]!
  if (amountOut === null || amountOut === BigInt(0))
    return { error: "No quote — the pool may be empty or the trade too large." }
  // Pre-flight: size cap, price impact against the marginal price, and (for buys)
  // whether the quoted tokens can be sold straight back at a sane price.
  const smallAmount = amountIn / BigInt(50) > BigInt(0) ? amountIn / BigInt(50) : amountIn
  const [small, back] = await Promise.all([
    quote(key, zeroForOne, smallAmount),
    p.side === "buy" ? quote(key, !zeroForOne, amountOut) : Promise.resolve(null),
  ])
  const inHuman = Number(amountIn) / 10 ** inDecimals
  const outHuman = Number(amountOut) / 10 ** outDecimals
  const guards = evaluateGuards({
    side: p.side,
    usdLeg: p.side === "buy" ? inHuman : outHuman,
    amountIn: inHuman,
    amountOut: outHuman,
    smallIn: Number(smallAmount) / 10 ** inDecimals,
    smallOut: small === null ? null : Number(small) / 10 ** outDecimals,
    backOut: back === null ? null : Number(back) / 1e6,
    // dynamic-fee pools carry a flag in the fee field; assume 1% there
    feeFraction: key.fee >= 0x800000 ? 0.01 : key.fee / 1_000_000,
    maxUsd: Number(process.env.TRADE_MAX_USDC) || DEFAULT_MAX_TRADE_USD,
  })
  if (guards.error) return { error: guards.error }
  const slippage = BigInt(
    Math.min(Math.max(Math.round(p.slippageBps), 10), 5000),
  )
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
    warnings: guards.warnings,
    priceImpactPct: guards.priceImpact === null ? null : guards.priceImpact * 100,
    roundTripLossPct: guards.roundTripLoss === null ? null : guards.roundTripLoss * 100,
    // USDC is also Arc's gas: keep ~0.05 back on buys so the swap can pay for itself.
    insufficient:
      balance < amountIn + (p.side === "buy" ? GAS_RESERVE_USDC : BigInt(0)),
    approvals,
    swap: {
      to: ARC.universalRouter,
      data: encodeSwap({
        key,
        zeroForOne,
        amountIn,
        minOut,
        recipient: wallet,
        deadline,
      }),
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
    client
      .readContract({
        address: ARC.eurc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [w],
      })
      .catch(() => BigInt(0)),
  ])
  return { usdc: Number(native) / 1e18, eurc: Number(eurc) / 1e6 }
}

import { defineChain, fallback, http, parseAbiItem, type AbiEvent, type Address } from "viem";

export const ARC_CHAIN_ID = 5042;

export const arc = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? "https://rpc.mainnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
  contracts: {
    // Verified 2026-10-06: Multicall3 bytecode is deployed at the canonical address.
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

/**
 * Arc RPCs, best first. Measured 2026-10-07 on 6 × 10k-block Swap-log queries:
 * Blockdaemon served 5/6 (60k logs in 7.5s), QuickNode 3/6, Circle's default
 * endpoint rate-limited all of them, dRPC's free plan caps ranges at <10k blocks.
 * ARC_RPC_URLS (comma-separated; e.g. a paid Alchemy key) go in front.
 */
const DEFAULT_RPCS = [
  "https://rpc.blockdaemon.mainnet.arc.io",
  "https://rpc.quicknode.mainnet.arc.io",
  "https://rpc.mainnet.arc.io",
  "https://rpc.drpc.mainnet.arc.io",
];
export function arcRpcUrls(): string[] {
  const own = (process.env.ARC_RPC_URLS ?? process.env.ARC_RPC_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return [...own, ...DEFAULT_RPCS.filter((u) => !own.includes(u))];
}
/** One transport for every Arc client: a busy or rate-limited RPC hands off to the next. */
export function arcTransport(opts: { timeout?: number } = {}) {
  return fallback(
    arcRpcUrls().map((u) => http(u, { timeout: opts.timeout ?? 20_000, retryCount: 1, retryDelay: 800 })),
    { retryCount: 2 },
  );
}

export const USDC: Address = "0x3600000000000000000000000000000000000000";
/** USDC is Arc's gas token too: v4 pools can quote it natively as currency 0x0. */
export const NATIVE: Address = "0x0000000000000000000000000000000000000000";

/**
 * Arc's USDC exists as an ERC-20 (6 decimals) and as the native gas coin (18).
 * A v4 pool quotes exactly one of them, recorded in Pool.quoteMint. Treating a
 * native pool as 6-decimal inflates every amount, price and liquidity figure by 10^12.
 */
export const isNativeQuote = (quoteMint: string | null | undefined): boolean =>
  (quoteMint ?? "").toLowerCase() === NATIVE.toLowerCase();
export const quoteDecimals = (quoteMint: string | null | undefined): number => (isNativeQuote(quoteMint) ? 18 : 6);
/** Is the pool's USDC side currency0? (Pool currencies are sorted by address; 0x0 sorts first.) */
export const quoteIsCurrency0 = (quoteMint: string | null | undefined, token: string): boolean =>
  (isNativeQuote(quoteMint) ? NATIVE : USDC).toLowerCase() < token.toLowerCase();

/**
 * Other DEX factories on Arc, found from DexScreener's Arc pairs (pool.factory(),
 * 2026-10-07). Their pool-creation events all index token0/token1 as the first
 * two topics (Uniswap v2/v3, Solidly/Aerodrome, Algebra), so one decoder covers them.
 */
export const DEX_FACTORIES: Array<{ dex: string; factory: Address }> = [
  { dex: "uniswap-v3", factory: "0xf0db7b58379503491d857dB50AC9ece64c653918" },
  { dex: "arctide", factory: "0x6AFd30Cb35D8B70Cfd84C9AcA92ddc2Dda2879Cb" },
  { dex: "aero", factory: "0xb89Df768aF2CFE637ceB352c587Fe8edAf491d03" },
  { dex: "lunya", factory: "0x711492DF23F320745de6fD7f0ab9564FDBfeA016" },
  { dex: "other", factory: "0xC481038C013FE96F38CE7A2dC417b2B1B78b16A4" },
];

// Uniswap v4 on Arc. Verified 2026-10-06 from a real Argus launch tx: PoolManager emits
// Initialize/ModifyLiquidity/Swap, PositionManager is "Uniswap v4 Positions NFT", and
// StateView was read from the Argus pool helper's stateView() and answers getSlot0.
export const POOL_MANAGER: Address = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
/** First block with PoolManager code (binary-searched via eth_getCode, 2026-10-07). */
export const POOL_MANAGER_DEPLOY_BLOCK = 1_948_056n;
export const POSITION_MANAGER: Address = "0x6049c9a0e26405c0985f9e3685c87d0ae917f82b";
export const STATE_VIEW: Address = "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b";

// Argus deploys a per-token EIP-1167 clone of this locker and binds the LP position NFT
// to it. Its bytecode exposes collect()/addLiquidity() but no decrease/withdraw/transfer
// of the position, so liquidity it holds is treated as locked (bytecode-derived, medium).
export const ARGUS_LOCKER_IMPL: Address = "0xb2ed8112db1bc11f7e7ab7969c2a9d1f819cfc6a";

/** Hook on Argus pools (seen on every sampled Argus launch). Tags pool-indexed tokens as Argus. */
export const ARGUS_V4_HOOK: Address = "0x3e4039be9c353d8be7cbb2d590469691f8f3e044";

export const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

// ~24h of ~510ms blocks. Used when no cursor and no ARC_INDEX_START_BLOCK is set,
// so a fresh deploy shows recent launches quickly instead of replaying all history.
export const DEFAULT_LOOKBACK_BLOCKS = 170_000n;

export type LaunchpadSourceId = "argus" | "tolly";

export interface LaunchpadSource {
  id: LaunchpadSourceId;
  launchpad: "ARGUS" | "TOLLY";
  factory: Address;
  /** Block the factory contract first has code (binary-searched via eth_getCode). */
  deployBlock: bigint;
  event: AbiEvent;
  /** What the event's 5th field points at. */
  venue: "UNISWAP_V4" | "BONDING_CURVE";
}

// Both signatures come from the Sourcify 4byte DB (hasVerifiedContract) and were
// decoded against real launch txs on 2026-10-06. The trailing string fields are
// unnamed in the DB: the first holds the image/metadata URI, the rest are links.
export const LAUNCHPAD_SOURCES: LaunchpadSource[] = [
  {
    id: "argus",
    launchpad: "ARGUS",
    factory: "0xb021be536808f551b31789422fd28a6c9c6e97da",
    deployBlock: 20_395_275n,
    event: parseAbiItem(
      "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, bytes32 poolId, string uri, string link1, string link2, string link3)",
    ),
    venue: "UNISWAP_V4",
  },
  {
    id: "tolly",
    launchpad: "TOLLY",
    factory: "0xcad7ee36ac193bf2eddb7b3e2736c5bdb8269c8b",
    deployBlock: 13_570_649n,
    event: parseAbiItem(
      "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, address curve, string uri, string link1, string link2, string link3)",
    ),
    venue: "BONDING_CURVE",
  },
];

/**
 * Creator-supplied strings (name, symbol, URI, links) are untrusted: Postgres
 * rejects NUL bytes, so one `\0` in a token name would stall the indexer for
 * every later launch. Strip control characters and cap the length.
 */
export function cleanText(s: string | null | undefined, max = 200): string {
  // eslint-disable-next-line no-control-regex
  return (s ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

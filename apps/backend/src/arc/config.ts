import { defineChain, parseAbiItem, type AbiEvent, type Address } from "viem";

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

export const USDC: Address = "0x3600000000000000000000000000000000000000";

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

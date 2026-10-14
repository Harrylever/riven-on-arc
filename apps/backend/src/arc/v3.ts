// Uniswap v3 pools on Arc. Unlike v4 (one shared PoolManager, pools are ids), every v3 pool is its own contract,
// and the liquidity is held as NFT positions minted by the position manager. So what the scorer needs comes from
// the pool and the position directly:
//
//   price               pool.slot0().sqrtPriceX96
//   real USDC           USDC.balanceOf(pool)            (the pool holds its reserves)
//   trade fee           pool.fee()
//   who holds the LP    positionManager.ownerOf(launch position NFT)
//   was it pulled       the NFT no longer exists, or positions(id).liquidity == 0
//
// The "launch position" is the first liquidity ever minted into the pool, found from logs only: the public RPC does
// not serve receipts for older transactions, but it serves logs for any block.

import { isAddress, parseAbi, parseAbiItem, type Address, type PublicClient } from "viem";
import type { ArcLpState } from "@riven/shared";
import { USDC, UNISWAP_V3_POSITION_MANAGER } from "./config";
import { scanBlockRange } from "./factory-log-indexer.service";

const ZERO = "0x0000000000000000000000000000000000000000";
/** The public node serves at most this many blocks per getLogs. */
const CHUNK = 9_999n;
/** How far past the token's launch block to look for the first liquidity (about 8 hours of Arc blocks). */
const SEARCH_BLOCKS = 60_000n;

export const V3_POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function fee() view returns (uint24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);
export const ERC20_BALANCE_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
export const POSITION_MANAGER_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);
export const V3_MINT = parseAbiItem(
  "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
);
export const POSITION_TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

export interface MintLog {
  sender: string;
  owner: string;
  tickLower: number;
  tickUpper: number;
  amount: bigint;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: string;
}
export interface PositionTransferLog {
  from: string;
  to: string;
  tokenId: bigint;
  transactionHash: string;
}

/** What is stored in Pool.launchInfo (next to the `dex` marker the pool indexer already wrote) once the search ran. */
export interface V3LaunchInfo {
  dex?: string;
  v3: true;
  /** The launch position NFT, or null when the first liquidity was not minted through the position manager. */
  tokenId: string | null;
  owner: string;
  tickLower: number;
  tickUpper: number;
  mintBlock: string;
  txHash: string;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The first liquidity minted into the pool, and (when it came through the position manager) the NFT it created.
 * Pure: takes the pool's Mint logs and the position manager's Transfer logs from the mint's block.
 */
export function pickLaunchPosition(mints: MintLog[], transfers: PositionTransferLog[]): V3LaunchInfo | null {
  const first = [...mints]
    .filter((m) => m.amount > 0n)
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))[0];
  if (!first) return null;
  // Minted through the position manager: it sends the Mint, and a Transfer from 0x0 in the same transaction is the NFT.
  const nft = eq(first.sender, UNISWAP_V3_POSITION_MANAGER)
    ? transfers.find((t) => eq(t.transactionHash, first.transactionHash) && eq(t.from, ZERO))
    : undefined;
  return {
    v3: true,
    tokenId: nft ? nft.tokenId.toString() : null,
    owner: first.owner.toLowerCase(),
    tickLower: first.tickLower,
    tickUpper: first.tickUpper,
    mintBlock: first.blockNumber.toString(),
    txHash: first.transactionHash,
  };
}

/**
 * Looks for the pool's first liquidity from (a little before) the token's launch block. Null when not found.
 * The first liquidity is almost always minted when the pool is created, so this stops at the first chunk of blocks that
 * contains a Mint: a typical search is two log queries, not a scan of the whole window (which the public node rate-limits).
 */
export async function findLaunchPosition(
  client: PublicClient,
  pool: Address,
  launchBlock: bigint,
  head: bigint,
): Promise<V3LaunchInfo | null> {
  const from = launchBlock > 200n ? launchBlock - 200n : 0n;
  const to = from + SEARCH_BLOCKS > head ? head : from + SEARCH_BLOCKS;
  let mints: MintLog[] = [];
  for (let start = from; start <= to && mints.length === 0; start += CHUNK) {
    const end = start + CHUNK - 1n > to ? to : start + CHUNK - 1n;
    const logs = await scanBlockRange(start, end, CHUNK, (f, t) => client.getLogs({ address: pool, event: V3_MINT, fromBlock: f, toBlock: t }));
    mints = logs.map((l) => ({
      sender: l.args.sender!,
      owner: l.args.owner!,
      tickLower: l.args.tickLower!,
      tickUpper: l.args.tickUpper!,
      amount: l.args.amount!,
      blockNumber: l.blockNumber,
      logIndex: l.logIndex,
      transactionHash: l.transactionHash,
    }));
  }
  if (mints.length === 0) return null;
  const firstBlock = mints.reduce((m, x) => (x.blockNumber < m ? x.blockNumber : m), mints[0]!.blockNumber);
  const nftLogs = await client.getLogs({
    address: UNISWAP_V3_POSITION_MANAGER,
    event: POSITION_TRANSFER,
    args: { from: ZERO },
    fromBlock: firstBlock,
    toBlock: firstBlock,
  });
  const transfers: PositionTransferLog[] = nftLogs.map((l) => ({
    from: l.args.from!,
    to: l.args.to!,
    tokenId: l.args.tokenId!,
    transactionHash: l.transactionHash,
  }));
  return pickLaunchPosition(mints, transfers);
}

export interface V3PoolReading {
  sqrtPriceX96: bigint;
  /** Hundredths of a bip, like v4's lpFee: 3000 = 0.3%. */
  fee: number;
  token0: string;
  token1: string;
  /** USDC (6 decimals, raw) the pool contract holds. */
  usdcRaw: bigint;
}
/** `owner` null: the NFT no longer exists (the position was closed). `liquidity` null: unknown. */
export interface V3PositionReading {
  owner: string | null;
  liquidity: bigint | null;
}
export interface V3Reading {
  pool: V3PoolReading | null;
  /** Null when there is no launch position to look at. */
  position: V3PositionReading | null;
}

/** Does the pool pair this token with the ERC-20 USDC? Only then can price and real USDC be read. */
export const pairsWithUsdc = (r: V3PoolReading, token: string) =>
  (eq(r.token0, USDC) && eq(r.token1, token)) || (eq(r.token1, USDC) && eq(r.token0, token));

/** Everything the scorer reads from v3 pools and their launch positions, batched into four multicalls. */
export async function readV3(
  client: PublicClient,
  items: Array<{ pool: Address; positionId: string | null }>,
): Promise<Map<string, V3Reading>> {
  const out = new Map<string, V3Reading>();
  // The pool indexer stores a pool of two non-USDC tokens as "<pool>:<token>", which is not an address. One such entry
  // makes viem reject the whole batch, so those are set aside here (they have no USDC side and cannot be scored).
  const valid = items.filter((i) => isAddress(i.pool, { strict: false }));
  for (const i of items) if (!valid.includes(i)) out.set(i.pool.toLowerCase(), { pool: null, position: null });
  items = valid;
  if (items.length === 0) return out;
  const withNft = items.filter((i) => i.positionId !== null);
  const onPools = <N extends "slot0" | "fee" | "token0" | "token1">(name: N) =>
    items.map((i) => ({ address: i.pool, abi: V3_POOL_ABI, functionName: name }) as const);
  const [slot0, fee, token0, token1, usdc, owners, positions] = await Promise.all([
    client.multicall({ allowFailure: true, contracts: onPools("slot0") }),
    client.multicall({ allowFailure: true, contracts: onPools("fee") }),
    client.multicall({ allowFailure: true, contracts: onPools("token0") }),
    client.multicall({ allowFailure: true, contracts: onPools("token1") }),
    client.multicall({
      allowFailure: true,
      contracts: items.map((i) => ({ address: USDC, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [i.pool] }) as const),
    }),
    client.multicall({
      allowFailure: true,
      contracts: withNft.map(
        (i) => ({ address: UNISWAP_V3_POSITION_MANAGER, abi: POSITION_MANAGER_ABI, functionName: "ownerOf", args: [BigInt(i.positionId!)] }) as const,
      ),
    }),
    client.multicall({
      allowFailure: true,
      contracts: withNft.map(
        (i) => ({ address: UNISWAP_V3_POSITION_MANAGER, abi: POSITION_MANAGER_ABI, functionName: "positions", args: [BigInt(i.positionId!)] }) as const,
      ),
    }),
  ]);
  const nftIndex = new Map(withNft.map((i, n) => [i.pool, n]));
  items.forEach((i, n) => {
    const s = slot0[n]!, f = fee[n]!, a = token0[n]!, b = token1[n]!, u = usdc[n]!;
    const pool: V3PoolReading | null =
      s.status === "success" && f.status === "success" && a.status === "success" && b.status === "success" && u.status === "success"
        ? { sqrtPriceX96: s.result[0], fee: Number(f.result), token0: a.result, token1: b.result, usdcRaw: u.result }
        : null;
    const k = nftIndex.get(i.pool);
    // A call that reverts means the NFT does not exist: its position was closed.
    const position: V3PositionReading | null =
      k === undefined
        ? null
        : { owner: owners[k]!.status === "success" ? owners[k]!.result : null, liquidity: positions[k]!.status === "success" ? positions[k]!.result[7] : null };
    out.set(i.pool.toLowerCase(), { pool, position });
  });
  return out;
}

/**
 * Who controls the launch liquidity, in the scorer's terms. `classify` turns a holder address into burned / locked
 * / unlocked / unknown contract (shared with the v4 path). A closed position, or one with no liquidity left, is a pull.
 */
export async function v3LpState(
  position: V3PositionReading | null,
  classify: (owner: string) => Promise<ArcLpState>,
): Promise<ArcLpState | null> {
  if (!position) return null; // no launch position found: nothing to say about who controls the liquidity
  if (position.owner === null) return "removed";
  if (position.liquidity === 0n) return "removed";
  return classify(position.owner.toLowerCase());
}

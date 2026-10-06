import {
  ARC_METHODOLOGY,
  computeArcScore,
  getDb,
  type ArcAuthorityInput,
  type ArcLpState,
  type ArcScoreInput,
} from "@clawdex/shared";
import {
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  toFunctionSelector,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  arc,
  ARGUS_LOCKER_IMPL,
  BURN_ADDRESSES,
  LAUNCHPAD_SOURCES,
  POOL_MANAGER,
  POSITION_MANAGER,
  STATE_VIEW,
  USDC,
} from "./config";
import { scanBlockRange } from "./factory-log-indexer.service";

const ACTIVITY_CURSOR = "arc:activity";
const MAX_TOKENS_PER_RUN = 60;
const FRESH_MS = 24 * 60 * 60 * 1000;
const RESCORE_FRESH_MS = 5 * 60 * 1000;
const RESCORE_OLD_MS = 60 * 60 * 1000;
/** Bought within ~5s of launch (10 blocks × ~510ms) = sniper. */
const SNIPER_BLOCKS = 10n;
/** Window around launch in which creator USDC transfers mark a wallet as creator-funded. */
const FUNDING_BEFORE = 20_000n; // ~2.8h
const FUNDING_AFTER = 5_000n; // ~40min
/** Arc's native USDC emits ERC-20 style Transfer logs from this system address. */
const NATIVE_USDC_EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe";
const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const INITIALIZED_TOPIC = keccak256(
  new TextEncoder().encode("Initialized(address,address,address)"),
);
const MODIFY_LIQUIDITY_TOPIC = keccak256(
  new TextEncoder().encode("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)"),
);
const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const MINT = ["mint(address,uint256)", "mint(uint256)", "mint(address)"];
const UPGRADE = ["upgradeTo(address)", "upgradeToAndCall(address,bytes)"];
const RESTRICT = [
  "pause()",
  "unpause()",
  "blacklist(address)",
  "addToBlacklist(address)",
  "setBlacklist(address,bool)",
  "freeze(address)",
  "setTransfersEnabled(bool)",
  "enableTrading()",
  "setTradingEnabled(bool)",
];
const OWNER_FEE = ["setTaxFee(uint256)", "setFee(uint256)", "setFees(uint256,uint256)", "setTax(uint256)"];
const LAUNCHPAD_LIMITS = ["maxWallet()", "antiSnipeDeadline()", "setMaxTxAmount(uint256)"];

const has = (code: string, sigs: string[]) =>
  sigs.some((s) => code.includes(toFunctionSelector(s).slice(2)));

/** EIP-1167 minimal proxy → its implementation address, else null. */
export function cloneTarget(code: string): string | null {
  const c = code.toLowerCase();
  return c.startsWith("0x363d3d373d3d3d363d73") ? `0x${c.slice(22, 62)}` : null;
}

/**
 * Bytecode selector scan. A heuristic: a present selector means the function
 * exists; an absent one is strong but not absolute evidence it doesn't.
 */
export function authorityFromBytecode(code: string, upgradeableProxy: boolean): ArcAuthorityInput {
  const c = code.toLowerCase();
  return {
    canMint: has(c, MINT),
    upgradeable: upgradeableProxy || has(c, UPGRADE),
    canRestrict: has(c, RESTRICT),
    ownerSetsFee: has(c, OWNER_FEE),
    launchpadLimits: has(c, LAUNCHPAD_LIMITS),
  };
}

/** sqrt(1.0001^tick), the v4 price-at-tick in sqrt form. */
const sqrtAtTick = (tick: number) => Math.pow(1.0001, tick / 2);
const MIN_TICK = -887272;
const MAX_TICK = 887272;

/**
 * USDC actually sitting in a v4 pool's launch range, from on-chain liquidity
 * and price — not from summing swaps, which ignores liquidity adds/removes.
 * Uses the pool's active liquidity over the launch range: exact for a single
 * launch position, a close estimate once others add in-range liquidity.
 */
export function usdcInRange(
  sqrtPriceX96: bigint,
  liquidity: bigint,
  tickLower: number | null,
  tickUpper: number | null,
  token: string,
): number {
  if (sqrtPriceX96 <= 0n || liquidity <= 0n) return 0;
  const L = Number(liquidity);
  const sa = sqrtAtTick(tickLower ?? MIN_TICK);
  const sb = sqrtAtTick(tickUpper ?? MAX_TICK);
  const s = Math.min(Math.max(Number(sqrtPriceX96) / 2 ** 96, sa), sb);
  const amount0 = (L * (sb - s)) / (s * sb);
  const amount1 = L * (s - sa);
  const usdcIsCurrency0 = USDC.toLowerCase() < token.toLowerCase();
  return (usdcIsCurrency0 ? amount0 : amount1) / 1e6;
}

/**
 * A rug is the launch liquidity being pulled. Liquidity units from different
 * positions and tick ranges aren't comparable, so judge the launch position
 * alone (its NFT id, else whoever added the most) — third-party LPs coming and
 * going is normal and must not read as a rug.
 */
export function launchLiquidityPulled(
  events: Array<{ positionId: string | null; sender: string; liquidityDelta: unknown }>,
  launchPositionId: string | null,
): boolean {
  const per = new Map<string, { added: number; removed: number }>();
  for (const e of events) {
    const key = e.positionId ? `nft:${e.positionId}` : `addr:${e.sender}`;
    const d = Number(e.liquidityDelta);
    const v = per.get(key) ?? { added: 0, removed: 0 };
    if (d > 0) v.added += d;
    else v.removed += -d;
    per.set(key, v);
  }
  let launch = launchPositionId ? per.get(`nft:${launchPositionId}`) : undefined;
  if (!launch) launch = [...per.values()].sort((a, b) => b.added - a.added)[0];
  return !!launch && launch.added > 0 && launch.removed / launch.added >= 0.5;
}

/** USD per whole token from a v4 sqrtPriceX96 on a USDC/token pool. */
export function priceFromSqrt(sqrtPriceX96: bigint, token: string, decimals: number): number {
  const ratio = (Number(sqrtPriceX96) / 2 ** 96) ** 2; // currency1 per currency0, raw units
  const usdcIsCurrency0 = USDC.toLowerCase() < token.toLowerCase();
  const tokenPerUsdc = usdcIsCurrency0 ? ratio : 1 / ratio;
  const scale = 10 ** (decimals - 6);
  return tokenPerUsdc > 0 ? scale / tokenPerUsdc : 0;
}

type PrevSignals = { flags?: Array<{ code?: string }> } | null;

/**
 * Anti-rug alerts: fire once, when a token gets worse between two scores —
 * liquidity pulled, creator dumping, or a score falling into the risky band.
 */
export function riskAlerts(
  prev: PrevSignals,
  next: { flags: Array<{ code: string; text: string }>; band: string; score: number | null },
  prevBand: string | null,
): Array<{ type: "RUG_PULL" | "CREATOR_DUMP" | "SCORE_DROP"; message: string; details: object }> {
  // No baseline, or a pre-v3 baseline without flag codes (methodology change):
  // comparing would make every existing problem look new, so stay quiet.
  if (!prev || !prev.flags || prev.flags.some((f) => !f.code)) return [];
  const had = new Set(prev.flags.map((f) => f.code));
  const out: Array<{ type: "RUG_PULL" | "CREATOR_DUMP" | "SCORE_DROP"; message: string; details: object }> = [];
  const added = (code: string) => next.flags.find((f) => f.code === code && !had.has(code));
  const rug = added("LP_REMOVED");
  if (rug) out.push({ type: "RUG_PULL", message: "Liquidity was just pulled from the pool", details: { flag: rug.text } });
  const dump = added("CREATOR_DUMP");
  if (dump) out.push({ type: "CREATOR_DUMP", message: dump.text, details: { flag: dump.text } });
  if ((prevBand === "healthy" || prevBand === "caution") && next.band === "risk") {
    out.push({
      type: "SCORE_DROP",
      message: `Score fell to ${next.score}/10 — now risky`,
      details: { from: prevBand, to: next.band, score: next.score },
    });
  }
  return out;
}

const STATE_VIEW_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);
const OWNER_OF_ABI = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);

const int24 = (word: string) => {
  const v = BigInt(`0x${word}`);
  return Number(BigInt.asIntN(24, v & 0xffffffn));
};

interface LaunchInfo {
  tickLower: number | null;
  tickUpper: number | null;
}

export class ArcScoringService {
  private readonly client: PublicClient;
  private readonly authorityCache = new Map<string, ArcAuthorityInput>();

  constructor(client?: PublicClient) {
    this.client =
      client ??
      createPublicClient({
        chain: arc,
        transport: http(
          process.env.ARC_RPC_URL ?? "https://rpc.mainnet.arc.io",
          { timeout: 20_000, retryCount: 3, retryDelay: 1_500 },
        ),
      });
  }

  async scoreOnce() {
    const db = getDb();
    const now = Date.now();
    const include = {
      pools: { orderBy: { createdAt: "asc" as const } }, // first pool = the launch pool
      arcMarket: true,
      scoreRuns: { orderBy: { calculatedAt: "desc" as const }, take: 1 },
    };
    const [freshRows, liquidRows] = await Promise.all([
      db.token.findMany({
        where: { pools: { some: {} } },
        orderBy: { launchTime: "desc" },
        take: 400,
        include,
      }),
      db.token.findMany({
        where: { pools: { some: {} }, arcMarket: { liquidityUsd: { gte: 500 } } },
        orderBy: { arcMarket: { liquidityUsd: "desc" } },
        take: 200,
        include,
      }),
    ]);
    const candidates = [...new Map([...freshRows, ...liquidRows].map((t) => [t.id, t])).values()];
    const due = candidates
      .filter((t) => {
        const last = t.scoreRuns[0]?.calculatedAt.getTime();
        if (last === undefined) return true;
        const fresh = now - t.launchTime.getTime() < FRESH_MS;
        return now - last > (fresh ? RESCORE_FRESH_MS : RESCORE_OLD_MS);
      })
      .slice(0, MAX_TOKENS_PER_RUN);
    if (due.length === 0) return { scored: 0, unscored: 0 };

    const [activity, head] = await Promise.all([
      db.arcIndexerCursor.findUnique({ where: { source: ACTIVITY_CURSOR } }),
      this.client.getBlockNumber(),
    ]);

    for (const t of due) {
      const pool = t.pools[0];
      if (!pool || pool.launchInfo || !t.launchTxHash) continue;
      try {
        const info = await this.readLaunchReceipt(t.launchTxHash as Hex, t.launchpad);
        Object.assign(pool, info);
        await db.pool.update({ where: { id: pool.id }, data: info });
      } catch (err) {
        console.warn(`[arc-score] receipt for ${t.mint} failed: ${(err as Error).message}`);
      }
    }

    const v4 = due.filter((t) => t.pools[0]?.venue === "UNISWAP_V4");
    const [slot0s, owners, liquidities] = await Promise.all([
      this.client.multicall({
        allowFailure: true,
        contracts: v4.map((t) => ({
          address: STATE_VIEW,
          abi: STATE_VIEW_ABI,
          functionName: "getSlot0",
          args: [t.pools[0]!.address as Hex],
        }) as const),
      }),
      this.client.multicall({
        allowFailure: true,
        contracts: v4.map((t) => ({
          address: POSITION_MANAGER,
          abi: OWNER_OF_ABI,
          functionName: "ownerOf",
          args: [BigInt(t.pools[0]!.positionId ?? "0")],
        }) as const),
      }),
      this.client.multicall({
        allowFailure: true,
        contracts: v4.map((t) => ({
          address: STATE_VIEW,
          abi: STATE_VIEW_ABI,
          functionName: "getLiquidity",
          args: [t.pools[0]!.address as Hex],
        }) as const),
      }),
    ]);
    const market = new Map<
      string,
      { priceUsd: number | null; feePct: number | null; lpOwner: string | null; poolUsdc: number | null }
    >();
    v4.forEach((t, i) => {
      const pool = t.pools[0]!;
      const s = slot0s[i];
      const o = owners[i];
      const sqrt = s?.status === "success" ? s.result[0] : 0n;
      const liq = liquidities[i];
      const range = (pool.launchInfo ?? null) as LaunchInfo | null;
      market.set(t.id, {
        poolUsdc:
          sqrt > 0n && liq?.status === "success"
            ? usdcInRange(sqrt, liq.result, range?.tickLower ?? null, range?.tickUpper ?? null, t.mint)
            : null,
        priceUsd: sqrt > 0n ? priceFromSqrt(sqrt, t.mint, t.decimals ?? 18) : null,
        // lpFee is in hundredths of a bip: 10000 = 1%.
        feePct: s?.status === "success" ? s.result[3] / 10_000 : null,
        lpOwner: pool.positionId && o?.status === "success" ? o.result.toLowerCase() : null,
      });
    });

    let scored = 0;
    let unscored = 0;
    for (const t of due) {
      try {
        const published = await this.scoreToken(t, {
          activityBlock: activity?.lastBlock ?? null,
          head,
          market: market.get(t.id) ?? { priceUsd: null, feePct: null, lpOwner: null, poolUsdc: null },
        });
        published ? scored++ : unscored++;
      } catch (err) {
        console.warn(`[arc-score] ${t.mint} failed: ${(err as Error).message}`);
      }
    }
    return { scored, unscored, due: due.length };
  }

  /** LP position id, launchpad helper contracts and the launch range, from the launch tx. */
  private async readLaunchReceipt(hash: Hex, launchpad: string) {
    const receipt = await this.client.getTransactionReceipt({ hash });
    const nft = receipt.logs.find(
      (l) =>
        l.address.toLowerCase() === POSITION_MANAGER.toLowerCase() &&
        l.topics[0] === TRANSFER_TOPIC &&
        l.topics.length === 4,
    );
    const modify = receipt.logs.find(
      (l) =>
        l.address.toLowerCase() === POOL_MANAGER.toLowerCase() &&
        l.topics[0] === MODIFY_LIQUIDITY_TOPIC,
    );
    const helpers = receipt.logs
      .filter((l) => l.topics[0] === INITIALIZED_TOPIC)
      .map((l) => l.address.toLowerCase());
    const factory = LAUNCHPAD_SOURCES.find((s) => s.launchpad === launchpad)?.factory.toLowerCase();
    const data = modify?.data.slice(2) ?? "";
    const launchInfo: LaunchInfo = {
      tickLower: data.length >= 128 ? int24(data.slice(0, 64)) : null,
      tickUpper: data.length >= 128 ? int24(data.slice(64, 128)) : null,
    };
    return {
      positionId: nft ? BigInt(nft.topics[3]!).toString() : null,
      excludedHolders: [...new Set([...helpers, ...(factory ? [factory] : [])])],
      launchInfo: launchInfo as unknown as object,
    };
  }

  private async authorityFor(token: Address): Promise<ArcAuthorityInput | null> {
    const code = await this.client.getCode({ address: token });
    if (!code || code === "0x") return null;
    const impl = cloneTarget(code);
    const slot = await this.client.getStorageAt({ address: token, slot: EIP1967_IMPLEMENTATION_SLOT });
    const proxyImpl = slot && BigInt(slot) !== 0n ? `0x${slot.slice(-40)}` : null;
    const key = impl ?? proxyImpl ?? keccak256(code);
    const cached = this.authorityCache.get(key);
    if (cached) return cached;
    const target = impl ?? proxyImpl;
    const effective = target ? await this.client.getCode({ address: target as Address }) : code;
    const result = authorityFromBytecode(effective ?? code, proxyImpl !== null);
    this.authorityCache.set(key, result);
    return result;
  }

  /**
   * Who controls the liquidity. Positions come from ModifyLiquidity events (for
   * PositionManager adds the salt is the position NFT id) plus the launch receipt.
   * "removed" when at least half of all liquidity ever added has been taken out.
   */
  private async lpState(
    pool:
      | { id: string; venue: string; positionId: string | null; lpRemovedAt: Date | null; excludedHolders: unknown }
      | undefined,
    receiptOwner: string | null,
  ): Promise<ArcLpState | null> {
    if (!pool) return null;
    if (pool.venue === "BONDING_CURVE") return "launchpad_curve";
    const events = await getDb().arcLpEvent.findMany({ where: { poolId: pool.id } });
    if (launchLiquidityPulled(events, pool.positionId)) return "removed";
    if (events.length === 0 && pool.lpRemovedAt) return "removed";

    // Net liquidity per controller: a position NFT id, or the contract that added directly.
    const net = new Map<string, number>();
    for (const e of events) {
      const key = e.positionId ? `nft:${e.positionId}` : `addr:${e.sender}`;
      net.set(key, (net.get(key) ?? 0) + Number(e.liquidityDelta));
    }
    if (pool.positionId && !net.has(`nft:${pool.positionId}`)) net.set(`nft:${pool.positionId}`, 1);
    const live = [...net.entries()].filter(([, v]) => v > 0);
    if (live.length === 0) return receiptOwner ? this.classifyOwner(receiptOwner, pool) : null;

    const nftIds = live.filter(([k]) => k.startsWith("nft:")).map(([k]) => BigInt(k.slice(4)));
    const owners = nftIds.length
      ? await this.client.multicall({
          allowFailure: true,
          contracts: nftIds.map((id) => ({
            address: POSITION_MANAGER,
            abi: OWNER_OF_ABI,
            functionName: "ownerOf",
            args: [id],
          }) as const),
        })
      : [];
    const ownerOf = new Map(
      nftIds.map((id, i) => [`nft:${id}`, owners[i]?.status === "success" ? String(owners[i]!.result).toLowerCase() : null]),
    );
    const total = live.reduce((sum, [, v]) => sum + v, 0);
    const states: Array<{ state: ArcLpState; share: number }> = [];
    for (const [key, v] of live) {
      const owner = key.startsWith("nft:") ? (ownerOf.get(key) ?? (key === `nft:${pool.positionId}` ? receiptOwner : null)) : key.slice(5);
      // ownerOf reverts for burned NFTs.
      const state: ArcLpState = owner ? await this.classifyOwner(owner, pool) : "burned";
      states.push({ state, share: v / total });
    }
    if (states.some((x) => x.state === "unlocked" && x.share >= 0.1)) return "unlocked";
    if (states.every((x) => x.state === "burned")) return "burned";
    if (states.every((x) => x.state === "burned" || x.state === "locked_launchpad")) return "locked_launchpad";
    return "unknown_contract";
  }

  private async classifyOwner(
    owner: string,
    pool: { excludedHolders: unknown },
  ): Promise<ArcLpState> {
    if (BURN_ADDRESSES.has(owner)) return "burned";
    const helpers = Array.isArray(pool.excludedHolders) ? (pool.excludedHolders as string[]) : [];
    if (helpers.includes(owner)) return "locked_launchpad";
    const code = await this.client.getCode({ address: owner as Address });
    if (!code || code === "0x") return "unlocked";
    return cloneTarget(code) === ARGUS_LOCKER_IMPL.toLowerCase() ? "locked_launchpad" : "unknown_contract";
  }

  /**
   * How this creator's earlier tokens ended up — the strongest early warning,
   * because it's known at launch, before this token can dump. Only tokens old
   * enough to judge (6h+) count; failure = died, dumped, wash-traded or pulled.
   */
  private async creatorTrackRecord(creator: string, tokenId: string, launchTime: Date) {
    const cutoff = new Date(Math.min(launchTime.getTime(), Date.now() - 6 * 3_600_000));
    const prior = await getDb().token.findMany({
      where: { deployerWallet: creator, id: { not: tokenId }, launchTime: { lt: cutoff } },
      orderBy: { launchTime: "desc" },
      take: 20,
      select: {
        scoreRuns: {
          where: { methodology: ARC_METHODOLOGY },
          orderBy: { calculatedAt: "desc" },
          take: 1,
          select: { signals: true },
        },
      },
    });
    const FAILED = /^(Dead:|Creator dumped|Liquidity has already been removed)/;
    // Only count verdicts from the current methodology's codes: older runs'
    // DEAD/WASH flags had known false positives (fixed in arc-v5).
    const FAILED_CODES = new Set(["DEAD", "CREATOR_DUMP", "WASH", "LP_REMOVED"]);
    let judged = 0;
    let failed = 0;
    for (const p of prior) {
      const flags = (p.scoreRuns[0]?.signals as { flags?: Array<{ code?: string; text?: string }> } | null)?.flags;
      if (!flags) continue;
      judged++;
      if (flags.some((f) => (f.code && FAILED_CODES.has(f.code)) || (!f.code && f.text && FAILED.test(f.text)))) failed++;
    }
    return { judged, failed };
  }

  /** Wallets the creator sent USDC (native or ERC-20) to around launch. */
  private async creatorFunded(
    creator: string,
    launchBlock: bigint,
    head: bigint,
    ignore: Set<string>,
  ): Promise<{ wallets: string[]; complete: boolean }> {
    const to = launchBlock + FUNDING_AFTER < head ? launchBlock + FUNDING_AFTER : head;
    const logs = await scanBlockRange(launchBlock - FUNDING_BEFORE, to, 9_999n, (f, t) =>
      this.client.getLogs({
        address: [USDC, NATIVE_USDC_EMITTER as Address],
        event: TRANSFER,
        args: { from: creator as Address },
        fromBlock: f,
        toBlock: t,
      }),
    );
    const wallets = [
      ...new Set(logs.map((l) => l.args.to?.toLowerCase()).filter((a): a is string => !!a)),
    ].filter((a) => !ignore.has(a) && a !== creator);
    return { wallets, complete: to === launchBlock + FUNDING_AFTER };
  }

  /** Returns true when a score was published. */
  private async scoreToken(
    t: {
      id: string;
      mint: string;
      name: string;
      symbol: string;
      deployerWallet: string;
      decimals: number | null;
      initialSupply: unknown;
      launchBlock: bigint | null;
      launchTime: Date;
      links: unknown;
      holderHistory: string | null;
      arcMarket: {
        priceUsd: unknown;
        volume24h: unknown;
        buys24h: number | null;
        sells24h: number | null;
        socials: unknown;
      } | null;
      scoreRuns: Array<{ signals: unknown; band: string | null; methodology: string | null }>;
      pools: Array<{
        id: string;
        address: string;
        venue: string;
        positionId: string | null;
        excludedHolders: unknown;
        creatorFunded: unknown;
        lpRemovedAt: Date | null;
      }>;
    },
    ctx: {
      activityBlock: bigint | null;
      head: bigint;
      market: { priceUsd: number | null; feePct: number | null; lpOwner: string | null; poolUsdc: number | null };
    },
  ): Promise<boolean> {
    const db = getDb();
    const pool = t.pools[0];
    const decimals = t.decimals ?? 18;
    const supply = Number(t.initialSupply);
    const creator = t.deployerWallet.toLowerCase();
    const unit = 10 ** decimals;

    const [authority, lp] = await Promise.all([
      this.authorityFor(t.mint as Address),
      this.lpState(pool, ctx.market.lpOwner),
    ]);

    const excluded = new Set<string>([
      POOL_MANAGER.toLowerCase(),
      ...BURN_ADDRESSES,
      ...(Array.isArray(pool?.excludedHolders) ? (pool!.excludedHolders as string[]) : []),
      ...(pool?.venue === "BONDING_CURVE" ? [pool.address] : []),
    ]);

    // Holder signals need the activity indexer to have passed the launch block.
    const historyComplete = t.holderHistory === null || t.holderHistory === "complete";
    const balancesReady =
      historyComplete && ctx.activityBlock !== null && t.launchBlock !== null && ctx.activityBlock >= t.launchBlock;
    let holders: ArcScoreInput["holders"] = null;
    let topHolders: Array<{ address: string; pct: number; tag: string | null }> = [];
    let soldPct: number | null = null;
    // Pool-indexed tokens may not have a known creator yet ("unknown" until the
    // backfill job resolves it); never treat that placeholder as a wallet.
    const creatorKnown = /^0x[0-9a-f]{40}$/.test(creator);
    if (balancesReady && supply > 0 && t.launchBlock !== null) {
      let funded = (pool?.creatorFunded as { wallets?: string[] } | null)?.wallets ?? (creatorKnown ? null : []);
      if (!funded) {
        const r = await this.creatorFunded(creator, t.launchBlock, ctx.head, excluded);
        funded = r.wallets;
        if (r.complete && pool) {
          await db.pool.update({ where: { id: pool.id }, data: { creatorFunded: { wallets: funded } } });
        }
      }
      const insiders = new Set(funded);
      const where = { tokenId: t.id, balance: { gt: 0 }, holder: { notIn: [...excluded] } };
      // Wallets under 0.0001% of supply are dust, not holders.
      const dust = Math.floor(supply * unit * 1e-6).toLocaleString("fullwide", { useGrouping: false });
      const [top, count, creatorRow, snipers, insiderRows, circulating] = await Promise.all([
        db.arcTokenBalance.findMany({ where, orderBy: { balance: "desc" }, take: 10 }),
        db.arcTokenBalance.count({ where: { ...where, balance: { gt: dust } } }),
        db.arcTokenBalance.findUnique({ where: { tokenId_holder: { tokenId: t.id, holder: creator } } }),
        db.arcTokenBalance.aggregate({
          where: {
            ...where,
            holder: { notIn: [...excluded, creator, ...insiders] },
            firstBlock: { lte: t.launchBlock + SNIPER_BLOCKS },
          },
          _sum: { balance: true },
        }),
        insiders.size
          ? db.arcTokenBalance.aggregate({
              where: { ...where, holder: { in: [...insiders] } },
              _sum: { balance: true },
              _count: true,
            })
          : Promise.resolve(null),
        db.arcTokenBalance.aggregate({ where, _sum: { balance: true } }),
      ]);
      const pctOf = (raw: unknown) => (Number(raw ?? 0) / unit / supply) * 100;
      topHolders = top.map((h) => ({
        address: h.holder,
        pct: pctOf(h.balance),
        tag: h.holder === creator ? "creator" : insiders.has(h.holder) ? "funded by creator" : null,
      }));
      holders = {
        count,
        top10Pct: topHolders.reduce((s, h) => s + h.pct, 0),
        creatorPct: creatorRow ? pctOf(creatorRow.balance) : 0,
        sniperPct: pctOf(snipers._sum.balance),
        insiderPct: insiderRows ? pctOf(insiderRows._sum.balance) : 0,
        insiderWallets: insiderRows?._count ?? 0,
        circulatingPct: pctOf(circulating._sum.balance),
      };
      if (creatorRow && Number(creatorRow.received) > 0) {
        // Burning is the opposite of dumping: don't count the creator's own burns as sold.
        const burns = await db.burn.aggregate({ where: { tokenId: t.id, wallet: creator }, _sum: { amount: true } });
        const burnedRaw = Number(burns._sum.amount ?? 0) * unit;
        const out = Number(creatorRow.received) - Number(creatorRow.balance) - burnedRaw;
        soldPct = Math.max(0, Math.min(100, (out / Number(creatorRow.received)) * 100));
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [track, burned, launches, copycats, swaps24h, swapsAll] = await Promise.all([
      creatorKnown ? this.creatorTrackRecord(t.deployerWallet, t.id, t.launchTime) : Promise.resolve(null),
      db.burn.aggregate({ where: { tokenId: t.id, attributed: true }, _sum: { amount: true } }),
      creatorKnown ? db.token.count({ where: { deployerWallet: t.deployerWallet } }) : Promise.resolve(0),
      db.token.count({
        where: {
          id: { not: t.id },
          OR: [
            { symbol: { equals: t.symbol, mode: "insensitive" } },
            { name: { equals: t.name, mode: "insensitive" } },
          ],
        },
      }),
      pool
        ? db.arcSwap.groupBy({
            by: ["side"],
            where: { poolId: pool.id, ts: { gte: since } },
            _sum: { usdcAmount: true },
            _count: true,
          })
        : Promise.resolve([]),
      pool
        ? db.arcSwap.groupBy({ by: ["side"], where: { poolId: pool.id }, _sum: { usdcAmount: true } })
        : Promise.resolve([]),
    ]);
    // USDC in the pool: read from on-chain liquidity and price; DexScreener's
    // figure only as a fallback. Never buys-minus-sells (misses LP adds/removes).
    const m = t.arcMarket;
    const marketUsdc = (m?.socials as { usdcInPool?: number | null } | null)?.usdcInPool ?? null;
    const poolUsdc = ctx.market.poolUsdc ?? marketUsdc;
    const useIndexed = balancesReady && swapsAll.length > 0;
    const volume24h = useIndexed
      ? swaps24h.reduce((s, g) => s + Number(g._sum.usdcAmount ?? 0), 0)
      : Number(m?.volume24h ?? 0);
    const buys24h = useIndexed ? (swaps24h.find((g) => g.side === "buy")?._count ?? 0) : (m?.buys24h ?? 0);
    const sells24h = useIndexed ? (swaps24h.find((g) => g.side === "sell")?._count ?? 0) : (m?.sells24h ?? 0);
    const marketLinks = m?.socials as { websites?: string[]; socials?: unknown[] } | null;
    const links = Array.isArray(t.links) ? (t.links as string[]) : [];

    const result = computeArcScore({
      authority,
      tradeFeePct: ctx.market.feePct,
      lp: lp ? { state: lp } : null,
      poolUsdc,
      holders,
      creator: creatorKnown
        ? { launches, soldPct, copycats, priorJudged: track?.judged ?? 0, priorFailed: track?.failed ?? 0 }
        : null,
      ageHours: (Date.now() - t.launchTime.getTime()) / 3_600_000,
      identity: { name: t.name, symbol: t.symbol },
      activity:
        pool && pool.venue === "UNISWAP_V4"
          ? {
              buys24h,
              sells24h,
              volume24h,
              hasSocials:
                links.length > 0 || (marketLinks?.websites?.length ?? 0) + (marketLinks?.socials?.length ?? 0) > 0,
            }
          : null,
      attributedBurnPct: supply > 0 ? (Number(burned._sum.amount ?? 0) / supply) * 100 : null,
    });

    const priceUsd = ctx.market.priceUsd ?? (m?.priceUsd != null ? Number(m.priceUsd) : null);
    // Only compare like with like: a methodology change re-bands many tokens at
    // once, and that is not news about any of them.
    const prevRun = t.scoreRuns[0]
    const alerts =
      prevRun && prevRun.methodology === ARC_METHODOLOGY
        ? riskAlerts(prevRun.signals as PrevSignals | null, result, prevRun.band ?? null)
        : [];
    await db.$transaction(async (tx) => {
      if (priceUsd !== null) {
        await tx.token.update({
          where: { id: t.id },
          data: { currentPrice: priceUsd, marketCap: priceUsd * supply },
        });
      }
      if (alerts.length > 0) {
        await tx.alert.createMany({ data: alerts.map((a) => ({ ...a, tokenId: t.id })) });
      }
      if (result.score !== null) {
        await tx.scoreRun.create({
          data: {
            tokenId: t.id,
            score: result.score,
            gate: result.subScores.contract.points,
            liquidityScore: result.subScores.liquidity.points,
            concentration: result.subScores.holders.points,
            burnScore: result.subScores.creator.points,
            partial: result.partial,
            confidence: result.confidence,
            band: result.band,
            methodology: ARC_METHODOLOGY,
            // Round-trip through JSON so nested inputs satisfy Prisma's Json type.
            signals: JSON.parse(
              JSON.stringify({
                ...result,
                inputs: {
                  authority,
                  lp: { state: lp, owner: ctx.market.lpOwner, positionId: pool?.positionId ?? null },
                  holders,
                  creator: { launches, soldPct, copycats },
                },
                market: {
                  priceUsd: ctx.market.priceUsd,
                  feePct: ctx.market.feePct,
                  poolUsdc,
                  volume24h,
                  buys24h,
                  sells24h,
                },
                topHolders,
                computedAtBlock: ctx.activityBlock?.toString() ?? null,
              }),
            ),
          },
        });
      }
      if (holders) {
        await tx.holderSnapshot.create({
          data: {
            tokenId: t.id,
            holderCount: holders.count,
            top10Pct: holders.top10Pct,
            topHolders,
          },
        });
      }
    });
    return result.score !== null;
  }
}

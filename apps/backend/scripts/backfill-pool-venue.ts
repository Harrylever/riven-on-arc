/**
 * Moves existing pools from venue OTHER to UNISWAP_V3 when the pool really was created by the Uniswap v3 factory
 * (asked of the pool itself: factory()). New pools get the right venue from the pool indexer; this fixes the ones
 * already stored. Safe to re-run. `--dry-run` reports and writes nothing.
 *
 *   DATABASE_URL=... bun run scripts/backfill-pool-venue.ts [--dry-run]
 */
import { getDb } from "@riven/shared";
import { createPublicClient, isAddress, parseAbi, type Address } from "viem";
import { arc, arcTransport, UNISWAP_V3_FACTORY } from "../src/arc/config";

const dry = process.argv.includes("--dry-run");
const db = getDb();
const client = createPublicClient({ chain: arc, transport: arcTransport() });
const FACTORY = parseAbi(["function factory() view returns (address)"]);
const BATCH = 300;

const all = await db.pool.findMany({ where: { venue: "OTHER" }, select: { id: true, address: true } });
// "<pool>:<token>" ids (a pool of two non-USDC tokens) are not addresses: leave them on OTHER.
const pools = all.filter((p) => isAddress(p.address, { strict: false }));
console.log(`${all.length} pools on venue OTHER (${all.length - pools.length} are not addresses and stay)`);
let v3 = 0;
let other = 0;
const unreadable = [] as string[];
for (let i = 0; i < pools.length; i += BATCH) {
  const batch = pools.slice(i, i + BATCH);
  const res = await client.multicall({
    allowFailure: true,
    contracts: batch.map((p) => ({ address: p.address as Address, abi: FACTORY, functionName: "factory" }) as const),
  });
  const ids: string[] = [];
  res.forEach((r, n) => {
    if (r.status !== "success") return void unreadable.push(batch[n]!.address);
    if (r.result.toLowerCase() === UNISWAP_V3_FACTORY.toLowerCase()) ids.push(batch[n]!.id);
    else other++;
  });
  if (ids.length && !dry) await db.pool.updateMany({ where: { id: { in: ids }, venue: "OTHER" }, data: { venue: "UNISWAP_V3" } });
  v3 += ids.length;
  console.log(`  ${Math.min(i + BATCH, pools.length)}/${pools.length}  v3 so far: ${v3}`);
}
console.log(`${dry ? "would move" : "moved"} ${v3} pools to UNISWAP_V3; ${other} are another DEX's; ${unreadable.length} did not answer factory() and stay OTHER`);
process.exit(0);

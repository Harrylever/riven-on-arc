/**
 * Fills a LOCAL database with a few hundred made-up Arc tokens so the site can be developed without touching
 * (and being billed for reads of) the Railway database. Refuses to run against any non-local host. Re-runnable:
 * it wipes the rows it created (mints start with 0x5eed) first.
 *
 *   createdb -E UTF8 riven
 *   DATABASE_URL=postgresql://$USER@localhost:5432/riven bun run --filter @riven/shared db:migrate:deploy
 *   DATABASE_URL=postgresql://$USER@localhost:5432/riven bun run scripts/seed-local.ts
 */
import { ARC_METHODOLOGY, deriveVerdict, getDb, type ArcFlag } from "@riven/shared";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing to seed: DATABASE_URL host is "${host || "unset"}", not a local database.`);
  process.exit(1);
}

const db = getDb();
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join("");
const WORDS = ["Arc", "Nova", "Pixel", "Moon", "Delta", "Orbit", "Zen", "Echo", "Flux", "Atlas", "Ember", "Kite", "Lumen", "Rift"];
const KINDS = ["Cat", "Coin", "Fi", "Dao", "Swap", "Bot", "Inu", "Labs"];
const FLAGS: ArcFlag[] = [
  { level: "bad", category: "creator", text: "Serial launcher: 9 earlier tokens from this wallet.", code: "SERIAL" } as ArcFlag,
  { level: "bad", category: "liquidity", text: "Liquidity has already been removed.", code: "LP_REMOVED" } as ArcFlag,
  { level: "bad", category: "creator", text: "Creator dumped most of their tokens.", code: "CREATOR_DUMP" } as ArcFlag,
];

const old = await db.token.findMany({ where: { mint: { startsWith: "0x5eed" } }, select: { id: true } });
if (old.length) {
  const ids = old.map((t) => t.id);
  await db.tokenScoreLatest.deleteMany({ where: { tokenId: { in: ids } } });
  await db.scoreRun.deleteMany({ where: { tokenId: { in: ids } } });
  await db.arcMarket.deleteMany({ where: { tokenId: { in: ids } } });
  await db.pool.deleteMany({ where: { tokenId: { in: ids } } });
  await db.token.deleteMany({ where: { id: { in: ids } } });
}

const now = Date.now();
let scored = 0;
let flagged = 0;
for (let i = 0; i < 400; i++) {
  const symbol = `${pick(WORDS).slice(0, 4)}${i}`.toUpperCase();
  const name = `${pick(WORDS)} ${pick(KINDS)}`;
  const recent = i < 80; // ~80 launched in the last 24h
  const launchTime = new Date(now - (recent ? rnd() * 24 : 24 + rnd() * 72) * 3_600_000);
  const wash = i % 17 === 0; // big volume through a pool holding almost nothing
  const volume24h = wash ? 15_000 + rnd() * 40_000 : rnd() < 0.4 ? rnd() * 60_000 : 0;
  const liquidityUsd = wash ? 0.5 : rnd() * 30_000;
  const usdcInPool = wash ? 0.8 : liquidityUsd;
  const mint = `0x5eed${hex(36)}`;
  const token = await db.token.create({
    data: {
      mint,
      deployerWallet: `0x${hex(40)}`,
      name,
      symbol,
      decimals: 18,
      launchpad: i % 2 ? "ARGUS" : "TOLLY",
      discoveredVia: "ARC_FACTORY_INDEXER",
      launchTime,
      initialSupply: "1000000000",
      marketCap: Math.round(liquidityUsd * 4),
    },
  });
  await db.pool.create({ data: { address: `0x${hex(40)}`, tokenId: token.id, venue: "PUMPSWAP", quoteChecked: true } });
  await db.arcMarket.create({
    data: {
      tokenId: token.id,
      priceUsd: 0.0001 + rnd() * 0.01,
      marketCap: Math.round(liquidityUsd * 4),
      liquidityUsd,
      volume24h,
      change24h: (rnd() - 0.5) * 120,
      buys24h: Math.floor(rnd() * 300),
      sells24h: Math.floor(rnd() * 200),
      socials: { usdcInPool },
    },
  });

  const isScored = i % 4 === 0; // a quarter have been scored; the rest show "Unscored"
  const run = isScored
    ? { score: wash ? 2.4 : Math.round((2 + rnd() * 5) * 10) / 10, flags: rnd() < 0.5 ? [pick(FLAGS)] : [] }
    : null;
  if (run) {
    await db.scoreRun.create({
      data: {
        tokenId: token.id,
        score: run.score,
        gate: 1,
        concentration: 5,
        burnScore: 0,
        liquidityScore: 5,
        methodology: ARC_METHODOLOGY,
        signals: { flags: run.flags },
        calculatedAt: new Date(now - rnd() * 3_600_000),
      },
    });
  }
  const v = deriveVerdict({
    name,
    symbol,
    run: run ? { score: run.score, methodology: ARC_METHODOLOGY, flags: run.flags } : null,
    volume24h,
    usdcInPool,
  });
  await db.tokenScoreLatest.create({
    data: {
      tokenId: token.id,
      score: v.score,
      band: v.band,
      scoreCodes: v.scoreCodes,
      marketCodes: v.marketCodes,
      methodology: run ? ARC_METHODOLOGY : null,
      scoredAt: run ? new Date() : null,
    },
  });
  if (run) scored++;
  if (v.fake) flagged++;
}
// The activity cursor marks how far swaps and transfers have been read. It must sit near the chain head (a real
// empty database starts it at the oldest token's launch block): block 1 would make a local backend replay the whole
// chain from the beginning. Keep any cursor an earlier run or a local backend has already written.
await db.arcIndexerCursor.upsert({
  where: { source: "arc:activity" },
  create: { source: "arc:activity", lastBlock: 25_760_000n },
  update: {},
});
console.log(`Seeded 400 tokens (${scored} scored, ${flagged} flagged).`);
process.exit(0);

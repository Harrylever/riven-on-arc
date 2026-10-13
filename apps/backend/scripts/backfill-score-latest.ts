/**
 * Fills token_score_latest for tokens that already exist (the scorer and the market sync keep it current from
 * now on). Safe to re-run: it upserts. `--dry-run` reports what it would write and writes nothing.
 *
 *   DATABASE_URL=... bun run scripts/backfill-score-latest.ts [--dry-run]
 */
import { deriveVerdict, getDb, marketFlagReasons, type ArcFlag } from "@riven/shared";

const dry = process.argv.includes("--dry-run");
const db = getDb();

// 1. Every token that has been scored: its latest score run decides score, band and the score-based flags.
const runs = await db.$queryRaw<
  Array<{
    token_id: string;
    score: unknown;
    methodology: string | null;
    signals: { flags?: ArcFlag[]; market?: { poolUsdc?: number | null } } | null;
    calculated_at: Date;
    name: string;
    symbol: string;
    volume24h: unknown;
    socials: { usdcInPool?: number | null } | null;
  }>
>`
  SELECT DISTINCT ON (s.token_id) s.token_id, s.score, s.methodology, s.signals, s.calculated_at,
         t.name, t.symbol, m.volume_24h AS volume24h, m.socials
  FROM score_runs s
  JOIN tokens t ON t.id = s.token_id
  LEFT JOIN arc_markets m ON m.token_id = s.token_id
  ORDER BY s.token_id, s.calculated_at DESC`;

let scored = 0;
let scoredFlagged = 0;
for (let i = 0; i < runs.length; i += 200) {
  const rows = runs.slice(i, i + 200).map((r) => {
    const v = deriveVerdict({
      name: r.name,
      symbol: r.symbol,
      run: { score: r.score, methodology: r.methodology, flags: r.signals?.flags },
      volume24h: r.volume24h == null ? null : Number(r.volume24h),
      usdcInPool: r.signals?.market?.poolUsdc ?? r.socials?.usdcInPool ?? null,
    });
    const data = {
      score: v.score,
      band: v.band,
      scoreCodes: v.scoreCodes,
      marketCodes: v.marketCodes,
      methodology: r.methodology,
      scoredAt: r.calculated_at,
    };
    return { tokenId: r.token_id, data, fake: v.fake };
  });
  scored += rows.length;
  scoredFlagged += rows.filter((r) => r.fake).length;
  // No transaction: every write is an idempotent upsert, and a slow remote database would blow Prisma's 5s limit.
  if (!dry)
    for (let j = 0; j < rows.length; j += 20)
      await Promise.all(
        rows
          .slice(j, j + 20)
          .map((r) =>
            db.tokenScoreLatest.upsert({ where: { tokenId: r.tokenId }, create: { tokenId: r.tokenId, ...r.data }, update: r.data }),
          ),
      );
}
console.log(`scored tokens: ${scored} (${scoredFlagged} flagged)`);

// 2. Tokens that were never scored can still be flagged from market data and their name.
let last = "";
let scanned = 0;
let marketFlagged = 0;
for (;;) {
  const page = await db.$queryRaw<
    Array<{ id: string; name: string; symbol: string; volume24h: unknown; usdc: unknown }>
  >`
    SELECT t.id, t.name, t.symbol, m.volume_24h AS volume24h, (m.socials->>'usdcInPool')::float8 AS usdc
    FROM tokens t
    LEFT JOIN arc_markets m ON m.token_id = t.id
    WHERE t.id > ${last} AND NOT EXISTS (SELECT 1 FROM score_runs s WHERE s.token_id = t.id)
    ORDER BY t.id LIMIT 5000`;
  if (page.length === 0) break;
  last = page[page.length - 1]!.id;
  scanned += page.length;
  const flagged = page
    .map((t) => ({
      tokenId: t.id,
      codes: marketFlagReasons(t, t.volume24h == null ? null : Number(t.volume24h), t.usdc == null ? null : Number(t.usdc)).map((r) => r.code),
    }))
    .filter((t) => t.codes.length > 0);
  marketFlagged += flagged.length;
  if (!dry && flagged.length > 0)
    await db.tokenScoreLatest.createMany({
      data: flagged.map((t) => ({ tokenId: t.tokenId, marketCodes: t.codes })),
      skipDuplicates: true,
    });
}
console.log(`unscored tokens checked: ${scanned} (${marketFlagged} flagged from market data / name)`);
console.log(dry ? "dry run: nothing written" : "done");
process.exit(0);

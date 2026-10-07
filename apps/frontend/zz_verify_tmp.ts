import { getDb } from "@clawdex/shared";
const db: any = getDb();
const qs: Record<string,string> = {
 alerts24h: `select type::text, count(*)::int n, min(created_at)::text mn, max(created_at)::text mx from alerts group by 1`,
 alertCols: `select column_name from information_schema.columns where table_name='alerts'`,
 socialsKeys: `select k, count(*)::int n from arc_markets, jsonb_object_keys(case when jsonb_typeof(socials::jsonb)='object' then socials::jsonb else '{}'::jsonb end) k group by k`,
 socialsNonNull: `select count(*)::int n from arc_markets where socials is not null`,
 tradedPerLaunchpad: `select t.launchpad::text, count(*)::int n from arc_markets m join tokens t on t.id=m.token_id where m.volume_24h>0 group by 1`,
 perpWinProb: `select count(*)::int n, count(win_prob)::int wp from perp_signals`,
 perpResolved: `select count(*)::int n from perp_signals where outcome<>'pending'`,
 holderHist: `select holder_history, count(*)::int n from tokens group by 1`,
 tradedHolderHist: `select t.holder_history, count(*)::int n from arc_markets m join tokens t on t.id=m.token_id where m.volume_24h>0 group by 1`,
 rescoreQueue: `select count(*)::int n from tokens where rescore_requested_at is not null`,
 migrations: `select migration_name, finished_at::text from _prisma_migrations order by finished_at desc nulls first limit 6`,
 userProfiles: `select count(*)::int n from user_profiles`,
};
for (const [k,q] of Object.entries(qs)) {
  try { console.log(k, JSON.stringify(await db.$queryRawUnsafe(q))); } catch(e:any){ console.log(k,"ERR",e.message.slice(0,200)); }
}
process.exit(0);

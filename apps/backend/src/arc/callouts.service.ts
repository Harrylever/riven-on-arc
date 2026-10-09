import { getDb } from "@riven/shared";
import { cleanText } from "./config";

/**
 * KOL callouts: recent X posts by a configured list of KOLs that name an Arc
 * token, by contract address or by a DexScreener Arc link. Needs
 * X_BEARER_TOKEN (X API v2 recent search) and X_KOL_HANDLES; without them the
 * step is skipped, and callouts can still be added by hand (addManual).
 */

const CURSOR = "x:callouts";
const MIN_INTERVAL_MS = Number(process.env.X_CALLOUTS_INTERVAL_MS ?? 5 * 60_000);
const ADDRESS = /0x[0-9a-fA-F]{40}/g;
const DEX_ARC = /dexscreener\.com\/arc\/(0x[0-9a-fA-F]{40,64})/gi;

interface XTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: { like_count?: number; retweet_count?: number };
  entities?: { urls?: Array<{ expanded_url?: string }> };
}
interface XUser {
  id: string;
  username: string;
  name: string;
}

/** Contract addresses and DexScreener Arc pair ids mentioned in a post. */
export function extractRefs(text: string, urls: string[] = []) {
  const all = [text, ...urls].join(" ");
  const addresses = [...new Set([...all.matchAll(ADDRESS)].map((m) => m[0].toLowerCase()))];
  const pairs = [...new Set([...all.matchAll(DEX_ARC)].map((m) => m[1]!.toLowerCase()))];
  return { addresses, pairs };
}

/** Split handles into `from:` queries that stay under X's 512-character limit. */
export function buildQueries(handles: string[], max = 480) {
  const out: string[] = [];
  let cur: string[] = [];
  const q = (hs: string[]) => `(${hs.map((h) => `from:${h}`).join(" OR ")}) -is:retweet`;
  for (const h of handles) {
    if (cur.length && q([...cur, h]).length > max) {
      out.push(q(cur));
      cur = [];
    }
    cur.push(h);
  }
  if (cur.length) out.push(q(cur));
  return out;
}

export class CalloutsService {
  private lastRun = 0;

  private handles() {
    return (process.env.X_KOL_HANDLES ?? "")
      .split(",")
      .map((h) => h.trim().replace(/^@/, ""))
      .filter((h) => /^\w{1,15}$/.test(h));
  }

  async indexOnce() {
    const token = process.env.X_BEARER_TOKEN;
    const handles = this.handles();
    if (!token || handles.length === 0) return { skipped: "set X_BEARER_TOKEN and X_KOL_HANDLES to index X callouts" };
    if (Date.now() - this.lastRun < MIN_INTERVAL_MS) return { skipped: "waiting for next interval" };
    this.lastRun = Date.now();

    const db = getDb();
    const cursor = await db.arcIndexerCursor.findUnique({ where: { source: CURSOR } });
    let newest = cursor?.lastBlock ?? 0n;
    let saved = 0;
    for (const query of buildQueries(handles)) {
      const params = new URLSearchParams({
        query,
        max_results: "100",
        "tweet.fields": "created_at,public_metrics,entities,author_id",
        expansions: "author_id",
        "user.fields": "username,name",
      });
      if (cursor) params.set("since_id", cursor.lastBlock.toString());
      const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429) break; // rate limited: try next interval
      if (!res.ok) throw new Error(`X API ${res.status}`);
      const body = (await res.json()) as { data?: XTweet[]; includes?: { users?: XUser[] } };
      const users = new Map((body.includes?.users ?? []).map((u) => [u.id, u]));
      for (const t of body.data ?? []) {
        if (BigInt(t.id) > newest) newest = BigInt(t.id);
        const { addresses, pairs } = extractRefs(t.text, (t.entities?.urls ?? []).map((u) => u.expanded_url ?? ""));
        if (addresses.length === 0 && pairs.length === 0) continue;
        const tokens = await db.token.findMany({
          where: {
            OR: [
              ...(addresses.length ? [{ mint: { in: addresses } }] : []),
              ...(pairs.length ? [{ arcMarket: { pairAddress: { in: pairs } } }] : []),
            ],
          },
          select: { id: true },
        });
        const u = users.get(t.author_id);
        for (const tok of tokens) {
          await db.arcCallout.upsert({
            where: { id: `x:${t.id}:${tok.id}` },
            create: {
              id: `x:${t.id}:${tok.id}`,
              platform: "x",
              author: cleanText(u?.username ?? t.author_id, 32),
              authorName: cleanText(u?.name, 80) || null,
              text: cleanText(t.text, 600),
              url: `https://x.com/${u?.username ?? "i"}/status/${t.id}`,
              tokenId: tok.id,
              postedAt: new Date(t.created_at),
              likes: t.public_metrics?.like_count ?? null,
              reposts: t.public_metrics?.retweet_count ?? null,
            },
            update: { likes: t.public_metrics?.like_count ?? null, reposts: t.public_metrics?.retweet_count ?? null },
          });
          saved++;
        }
      }
    }
    if (newest > (cursor?.lastBlock ?? 0n)) {
      await db.arcIndexerCursor.upsert({
        where: { source: CURSOR },
        create: { source: CURSOR, lastBlock: newest },
        update: { lastBlock: newest },
      });
    }
    return { saved };
  }

  /** A callout added by the team (e.g. a post the API missed). */
  async addManual(input: { url: string; author: string; text: string; token: string; postedAt?: string }) {
    const url = new URL(input.url);
    if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(url.hostname)) throw new TypeError("url must be an x.com post");
    const postId = url.pathname.match(/status\/(\d+)/)?.[1];
    if (!postId) throw new TypeError("url must link to a post (…/status/<id>)");
    const db = getDb();
    const tok = await db.token.findUnique({ where: { mint: input.token.toLowerCase() }, select: { id: true } });
    if (!tok) throw new TypeError("Riven doesn't track that token address");
    const author = cleanText(input.author, 32).replace(/^@/, "");
    if (!/^\w{1,15}$/.test(author)) throw new TypeError("author must be an X handle");
    return db.arcCallout.upsert({
      where: { id: `x:${postId}:${tok.id}` },
      create: {
        id: `x:${postId}:${tok.id}`,
        platform: "x",
        author,
        text: cleanText(input.text, 600),
        url: `https://x.com/${author}/status/${postId}`,
        tokenId: tok.id,
        postedAt: input.postedAt ? new Date(input.postedAt) : new Date(),
        source: "manual",
      },
      update: { text: cleanText(input.text, 600) },
    });
  }
}

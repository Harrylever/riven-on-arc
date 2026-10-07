import { getDb } from "@clawdex/shared";

/**
 * Riven's Telegram alerts. There are no accounts: a browser asks the frontend
 * for a one-time link code, the user opens t.me/<bot>?start=<code> and presses
 * Start, and this service binds that chat to the browser's watch list. Then it
 * forwards, once each:
 *  - rug-radar alerts (liquidity pulled, creator sold, whale sold, score drop)
 *    for Arc tokens the user starred;
 *  - new sakz-bot perp calls, and how they resolved, for pairs they track
 *    ("*" = every call).
 * Signals only — nothing here trades. No-op until TELEGRAM_BOT_TOKEN is set.
 */

const API = "https://api.telegram.org/bot";
const SITE = (process.env.RIVEN_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://riven.app").replace(/\/$/, "");
const CURSOR = { updates: "tg:updates", alerts: "tg:alerts", signals: "tg:signals", outcomes: "tg:outcomes" } as const;
const ALERT_LABEL: Record<string, string> = {
  RUG_PULL: "🚨 Liquidity pulled",
  CREATOR_DUMP: "🚨 Creator sold",
  WHALE_DUMP: "⚠️ Whale sold",
  SCORE_DROP: "⚠️ Score dropped",
};
const OUTCOME_LABEL: Record<string, string> = {
  t1_hit: "🎯 Hit target 1",
  t2_hit: "🎯 Hit target 2",
  t3_hit: "🏁 Hit target 3",
  sl_hit: "🛑 Stopped out",
  expired: "⌛ Expired",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** "BTCUSDT" / "BTC-PERP" / "BTC/USDT:USDT" → "BTC": how tracked pairs are keyed. */
export function perpCoin(symbol: string) {
  return symbol.toUpperCase().split(/[/:-]/)[0]!.replace(/(USDT|USDC|USD|PERP)$/, "");
}

type Fetch = typeof fetch;

export class TelegramService {
  constructor(
    private readonly token = process.env.TELEGRAM_BOT_TOKEN ?? "",
    private readonly http: Fetch = fetch,
  ) {}

  get enabled() {
    return this.token.length > 0;
  }

  async tick() {
    if (!this.enabled) return { skipped: "TELEGRAM_BOT_TOKEN not set" };
    const updates = await this.pollUpdates();
    const alerts = await this.deliverAlerts();
    const signals = await this.deliverSignals();
    return { updates, alerts, signals };
  }

  private async call<T>(method: string, body: object): Promise<T | null> {
    try {
      const res = await this.http(`${API}${this.token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
      if (!json.ok) {
        console.warn(`[telegram] ${method}: ${json.description ?? res.status}`);
        return null;
      }
      return json.result ?? null;
    } catch (err) {
      console.warn(`[telegram] ${method} failed: ${(err as Error).message}`);
      return null;
    }
  }

  private send(chatId: string, html: string, button?: { text: string; url: string }) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
    });
  }

  private async cursor(source: string, init: () => bigint) {
    const db = getDb();
    const row = await db.arcIndexerCursor.findUnique({ where: { source } });
    if (row) return row.lastBlock;
    const v = init();
    await db.arcIndexerCursor.create({ data: { source, lastBlock: v } });
    return v;
  }

  private setCursor(source: string, v: bigint) {
    return getDb().arcIndexerCursor.update({ where: { source }, data: { lastBlock: v } });
  }

  /** Sends once per (key): survives restarts and overlapping ticks. */
  private async sendOnce(key: string, chatId: string, html: string, button?: { text: string; url: string }) {
    const db = getDb();
    const fresh = await db.telegramSent
      .create({ data: { key } })
      .then(() => true)
      .catch(() => false); // already sent
    if (!fresh) return false;
    const ok = await this.send(chatId, html, button);
    if (!ok) await db.telegramSent.delete({ where: { key } }).catch(() => {}); // retry next tick
    return !!ok;
  }

  // ── linking: /start <code>, /list, /stop ──
  private async pollUpdates() {
    const db = getDb();
    const offset = await this.cursor(CURSOR.updates, () => 0n);
    const updates =
      (await this.call<Array<{ update_id: number; message?: { chat: { id: number }; from?: { username?: string }; text?: string } }>>(
        "getUpdates",
        { offset: Number(offset), timeout: 0, allowed_updates: ["message"] },
      )) ?? [];
    let handled = 0;
    for (const u of updates) {
      const msg = u.message;
      const chatId = msg ? String(msg.chat.id) : null;
      const text = msg?.text?.trim() ?? "";
      if (chatId) {
        const [cmd, arg] = text.split(/\s+/, 2);
        if (cmd === "/start" && arg) {
          const link = await db.telegramLink.findUnique({ where: { linkCode: arg }, include: { watches: true } });
          if (link) {
            await db.telegramLink.update({
              where: { id: link.id },
              data: { chatId, username: msg?.from?.username ?? null, linkedAt: new Date() },
            });
            const tokens = link.watches.filter((w) => w.kind === "token").length;
            const pairs = link.watches.filter((w) => w.kind === "perp").length;
            await this.send(
              chatId,
              `✅ <b>Riven is connected.</b>\n\nI'll message you here when a token you starred gets rugged (liquidity pulled, creator or whale sells, score drops)${pairs ? " and when sakz-bot calls a pair you track" : ""}.\n\nWatching: ${tokens} token${tokens === 1 ? "" : "s"}, ${pairs} perp pair${pairs === 1 ? "" : "s"}. Star more on the site — they sync automatically.\n\n/list — what I'm watching\n/stop — disconnect\n\n<i>Signals only. Not financial advice.</i>`,
            );
          } else {
            await this.send(chatId, "That link has expired. Open Riven and tap <b>Connect Telegram</b> again.");
          }
        } else if (cmd === "/start") {
          await this.send(chatId, `Hi! I'm Riven. Open ${esc(SITE)} and tap <b>Connect Telegram</b> to get alerts here.`);
        } else if (cmd === "/stop") {
          const n = await db.telegramLink.updateMany({ where: { chatId }, data: { chatId: null, linkedAt: null } });
          await this.send(chatId, n.count ? "Disconnected. I won't message you anymore." : "You weren't connected.");
        } else if (cmd === "/list") {
          const watches = await db.telegramWatch.findMany({ where: { link: { chatId } }, take: 60 });
          const tokens = watches.filter((w) => w.kind === "token");
          const ids = await db.token.findMany({ where: { mint: { in: tokens.map((w) => w.target) } }, select: { symbol: true } });
          const pairs = watches.filter((w) => w.kind === "perp").map((w) => (w.target === "*" ? "all calls" : w.target));
          await this.send(
            chatId,
            watches.length
              ? `<b>Watching</b>\nTokens: ${ids.map((t) => esc(t.symbol)).join(", ") || "none"}\nPerps: ${pairs.map(esc).join(", ") || "none"}`
              : "Nothing yet — star tokens or track pairs on Riven.",
          );
        }
      }
      handled++;
      await this.setCursor(CURSOR.updates, BigInt(u.update_id + 1));
    }
    return handled;
  }

  // ── rug-radar alerts for starred tokens ──
  private async deliverAlerts() {
    const db = getDb();
    // First run starts from now: never replay history into a fresh bot.
    const since = await this.cursor(CURSOR.alerts, () => BigInt(Date.now()));
    const alerts = await db.alert.findMany({
      where: { createdAt: { gt: new Date(Number(since)) } },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { token: { select: { mint: true, symbol: true, name: true } } },
    });
    if (alerts.length === 0) return 0;
    const watches = await db.telegramWatch.findMany({
      where: { kind: "token", target: { in: [...new Set(alerts.map((a) => a.token.mint))] }, link: { chatId: { not: null } } },
      include: { link: { select: { chatId: true } } },
    });
    let sent = 0;
    for (const a of alerts) {
      for (const w of watches.filter((x) => x.target === a.token.mint)) {
        const ok = await this.sendOnce(
          `alert:${a.id}:${w.link.chatId}`,
          w.link.chatId!,
          `${ALERT_LABEL[a.type] ?? a.type} · <b>${esc(a.token.symbol)}</b>\n${esc(a.message.replace(/\bdumped\b/g, "sold"))}\n\n<i>From Riven's rug radar. Not financial advice.</i>`,
          { text: `Open ${a.token.symbol} on Riven`, url: `${SITE}/token/${a.token.mint}` },
        );
        if (ok) sent++;
      }
    }
    await this.setCursor(CURSOR.alerts, BigInt(alerts[alerts.length - 1]!.createdAt.getTime()));
    return sent;
  }

  // ── sakz-bot perp calls + outcomes for tracked pairs ──
  private async deliverSignals() {
    const db = getDb();
    const watches = await db.telegramWatch.findMany({
      where: { kind: "perp", link: { chatId: { not: null } } },
      include: { link: { select: { chatId: true } } },
    });
    const forCoin = (coin: string) => watches.filter((w) => w.target === "*" || w.target === coin);
    let sent = 0;

    const since = await this.cursor(CURSOR.signals, () => BigInt(Date.now()));
    const calls = await db.perpSignal.findMany({
      where: { createdAt: { gt: new Date(Number(since)) } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    for (const s of calls) {
      const coin = perpCoin(s.symbol);
      for (const w of forCoin(coin)) {
        const ok = await this.sendOnce(
          `signal:${s.id}:${w.link.chatId}`,
          w.link.chatId!,
          `${s.bias === "LONG" ? "🟢" : "🔴"} <b>${esc(coin)} ${s.bias}</b> · conviction ${s.confidence}/10\nEntry ${s.entryLow}–${s.entryHigh}\nStop ${s.stopLoss}\nTargets ${s.t1} / ${s.t2} / ${s.t3}\n\n<i>sakz-bot scanner call via Riven. Paper-trade it first — not financial advice.</i>`,
          { text: `Open ${coin} on Riven Perps`, url: `${SITE}/perps` },
        );
        if (ok) sent++;
      }
    }
    if (calls.length) await this.setCursor(CURSOR.signals, BigInt(calls[calls.length - 1]!.createdAt.getTime()));

    const resolvedSince = await this.cursor(CURSOR.outcomes, () => BigInt(Date.now()));
    const resolved = await db.perpSignal.findMany({
      where: { resolvedAt: { gt: new Date(Number(resolvedSince)) }, outcome: { not: "pending" } },
      orderBy: { resolvedAt: "asc" },
      take: 200,
    });
    for (const s of resolved) {
      const coin = perpCoin(s.symbol);
      for (const w of forCoin(coin)) {
        const ok = await this.sendOnce(
          `outcome:${s.id}:${s.outcome}:${w.link.chatId}`,
          w.link.chatId!,
          `${OUTCOME_LABEL[s.outcome] ?? s.outcome} · <b>${esc(coin)} ${s.bias}</b>\nCalled at ${s.entryPrice} (conviction ${s.confidence}/10).`,
        );
        if (ok) sent++;
      }
    }
    if (resolved.length) await this.setCursor(CURSOR.outcomes, BigInt(resolved[resolved.length - 1]!.resolvedAt!.getTime()));
    return sent;
  }
}

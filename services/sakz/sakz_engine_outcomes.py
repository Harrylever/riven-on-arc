"""sakz_engine_outcomes.py - Signal outcome tracking, win-rate analytics, and backtesting.

Decomposed from sakz_bot.py as part of Phase 7.
Handles:
- Chronological OHLC candle outcome resolution (_resolve_outcome_from_candles)
- Unleveraged favorable/adverse excursions & peak % tracking (_compute_peak_pct, _compute_peak_excursions)
- Periodic background outcome checks (check_signal_outcomes, _check_signal_outcomes_blocking)
- Dynamic win rate & return leaderboards (_stats_live, _stats_best_card, stats_command)
- Historical backtest reports (backtest_command, bt_time_callback, stats_time_callback)
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import json
import logging
import math
import os
import time
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from sakz_db import db_connect, db_track_user
from sakz_engine_scan import SCAN_EXECUTOR
from sakz_exchanges import (
    binance_fetch_ohlcv,
    bybit_fetch_ohlcv,
    mexc_fetch_ohlcv,
)
from sakz_price import _get_live_price

logger = logging.getLogger("sakz_engine_outcomes")


def _track(update: Update) -> None:
    """One-liner tracking call for command handlers."""
    try:
        u = update.effective_user
        if u:
            db_track_user(u.id, u.username, u.first_name)
    except Exception as e:
        logger.error("_track failed: %s", e)


def _fetch_ohlc_since(exchange: str, symbol: str, scan_time: str, limit: int = 60) -> List[Dict[str, Any]]:
    """Fetch 1H OHLC candles covering the period from scan_time to now.
    Returns a list of dicts {ts, open, high, low, close} sorted oldest-first.
    """
    try:
        if exchange == 'BYBIT':
            df = bybit_fetch_ohlcv(symbol, '60', limit)
        elif exchange == 'BINANCE':
            df = binance_fetch_ohlcv(symbol, '1h', limit)
        else:
            df = mexc_fetch_ohlcv(symbol, '1h', limit)

        if df is None or len(df) == 0:
            return []

        scan_dt = datetime.fromisoformat(scan_time)
        rows = []
        for _, row in df.iterrows():
            ts = row['timestamp']
            if hasattr(ts, 'to_pydatetime'):
                ts = ts.to_pydatetime()
            if ts.replace(tzinfo=None) >= scan_dt.replace(tzinfo=None):
                rows.append({
                    'ts':    ts,
                    'open':  float(row['open']),
                    'high':  float(row['high']),
                    'low':   float(row['low']),
                    'close': float(row['close']),
                })
        return rows
    except Exception as e:
        logger.warning("_fetch_ohlc_since error %s %s: %s", exchange, symbol, e)
        return []


def _compute_peak_pct(signal: Dict[str, Any], current_price: Optional[float] = None) -> Tuple[Optional[float], Optional[datetime]]:
    """Highest favorable % a signal reached since it was scanned, plus when it occurred."""
    try:
        entry = float(signal.get('price') or 0)
        bias  = str(signal.get('bias', 'LONG')).upper()
        if entry <= 0:
            return None, None

        scan_time = signal.get('scan_time')
        if hasattr(scan_time, 'isoformat'):
            scan_iso = scan_time.isoformat()
        else:
            scan_iso = str(scan_time) if scan_time else None
        if not scan_iso:
            return None, None

        candles = _fetch_ohlc_since(
            signal.get('exchange', ''), signal.get('symbol', ''), scan_iso, limit=500
        )

        best    = None
        best_at = None
        for cdl in candles:
            if bias == 'LONG':
                fav = (cdl['high'] - entry) / entry * 100
            else:
                fav = (entry - cdl['low']) / entry * 100
            if best is None or fav > best:
                best, best_at = fav, cdl['ts']

        if current_price and current_price > 0:
            if bias == 'LONG':
                cur_fav = (current_price - entry) / entry * 100
            else:
                cur_fav = (entry - current_price) / entry * 100
            if best is None or cur_fav > best:
                best, best_at = cur_fav, datetime.now()

        if best is None:
            return None, None
        if hasattr(best_at, 'replace'):
            try:
                best_at = best_at.replace(tzinfo=None)
            except Exception:
                logger.debug("suppressed exception in _compute_peak_pct", exc_info=True)
        return best, best_at
    except Exception as e:
        logger.warning("_compute_peak_pct error: %s", e)
        return None, None


def _compute_peak_excursions(signal: Dict[str, Any], current_price: Optional[float] = None) -> Tuple[Optional[float], Optional[datetime], Optional[float], Optional[datetime]]:
    """Best favorable AND worst adverse % moves since scan (UNLEVERAGED, raw)."""
    try:
        entry = float(signal.get('price') or 0)
        bias  = str(signal.get('bias', 'LONG')).upper()
        if entry <= 0:
            return None, None, None, None

        scan_time = signal.get('scan_time')
        if hasattr(scan_time, 'isoformat'):
            scan_iso = scan_time.isoformat()
        else:
            scan_iso = str(scan_time) if scan_time else None
        if not scan_iso:
            return None, None, None, None

        candles = _fetch_ohlc_since(
            signal.get('exchange', ''), signal.get('symbol', ''), scan_iso, limit=500
        )

        fav = fav_at = None
        adv = adv_at = None
        for cdl in candles:
            if bias == 'LONG':
                f = (cdl['high'] - entry) / entry * 100
                a = (cdl['low']  - entry) / entry * 100
            else:
                f = (entry - cdl['low'])  / entry * 100
                a = (entry - cdl['high']) / entry * 100
            if fav is None or f > fav:
                fav, fav_at = f, cdl['ts']
            if adv is None or a < adv:
                adv, adv_at = a, cdl['ts']

        if current_price and current_price > 0:
            if bias == 'LONG':
                cf = (current_price - entry) / entry * 100
            else:
                cf = (entry - current_price) / entry * 100
            if fav is None or cf > fav:
                fav, fav_at = cf, datetime.now()
            if adv is None or cf < adv:
                adv, adv_at = cf, datetime.now()

        def _strip(dt):
            if hasattr(dt, 'replace'):
                try:
                    return dt.replace(tzinfo=None)
                except Exception:
                    return dt
            return dt
        return fav, _strip(fav_at), adv, _strip(adv_at)
    except Exception as e:
        logger.warning("_compute_peak_excursions error: %s", e)
        return None, None, None, None


def _resolve_outcome_from_candles(candles: Sequence[Dict[str, Any]], bias: str, sl: float, t1: float, t2: float, t3: float) -> Tuple[str, Optional[str], int]:
    """Walk candles chronologically and determine the TRUE outcome.

    Returns: (outcome, best_target_hit, sl_after_target)
    """
    best_target = None
    sl_fired    = False

    target_map = [('t3', t3), ('t2', t2), ('t1', t1)]

    for candle in candles:
        hi    = candle['high']
        lo    = candle['low']
        close = candle['close']
        open_ = candle['open']

        if bias == 'LONG':
            candle_sl_hit = close < sl
            target_hit_this_candle = None
            for tname, tlevel in target_map:
                if hi >= tlevel:
                    target_hit_this_candle = tname
                    break

            if target_hit_this_candle and candle_sl_hit:
                if best_target is not None:
                    sl_fired = True
                elif open_ >= sl:
                    best_target = target_hit_this_candle
                    sl_fired    = True
                else:
                    sl_fired = True
                break
            elif target_hit_this_candle:
                best_target = target_hit_this_candle
            elif candle_sl_hit:
                sl_fired = True
                break

        else:  # SHORT
            candle_sl_hit = close > sl
            target_hit_this_candle = None
            for tname, tlevel in target_map:
                if lo <= tlevel:
                    target_hit_this_candle = tname
                    break

            if target_hit_this_candle and candle_sl_hit:
                if best_target is not None:
                    sl_fired = True
                elif open_ <= sl:
                    best_target = target_hit_this_candle
                    sl_fired    = True
                else:
                    sl_fired = True
                break
            elif target_hit_this_candle:
                best_target = target_hit_this_candle
            elif candle_sl_hit:
                sl_fired = True
                break

    sl_after_target = 1 if (sl_fired and best_target is not None) else 0

    if sl_fired and best_target is None:
        outcome = 'sl_hit'
    elif best_target == 't3':
        outcome = 't3_hit'
    elif best_target == 't2':
        outcome = 't2_hit'
    elif best_target == 't1':
        outcome = 't1_hit'
    else:
        outcome = 'pending'

    return outcome, best_target, sl_after_target


async def check_signal_outcomes(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Async wrapper that offloads blocking outcome sweep to SCAN_EXECUTOR."""
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(SCAN_EXECUTOR, _check_signal_outcomes_blocking, context)
    except Exception as e:
        logger.warning("check_signal_outcomes failed: %s", e)


def _check_signal_outcomes_blocking(context: Optional[ContextTypes.DEFAULT_TYPE] = None) -> None:
    """Sequential win/loss outcome checker running against signal_outcomes SQLite table."""
    conn = db_connect()
    c    = conn.cursor()
    c.execute("""SELECT id, exchange, symbol, bias, entry_price, entry_low, entry_high,
                        stop_loss, t1, t2, t3, scan_time, check_4h, check_8h, check_24h, check_48h,
                        best_target_hit, sl_after_target, entry_confirmed
                 FROM signal_outcomes WHERE outcome='pending'""")
    rows = c.fetchall()
    conn.close()

    now = datetime.now()
    for row in rows:
        try:
            scan_dt  = datetime.fromisoformat(row['scan_time'])
            hours    = (now - scan_dt).total_seconds() / 3600
            exchange = row['exchange']
            symbol   = row['symbol']
            bias     = row['bias']
            sl       = row['stop_loss']
            t1, t2, t3 = row['t1'], row['t2'], row['t3']
            e_low  = row['entry_low']  if row['entry_low']  else row['entry_price']
            e_high = row['entry_high'] if row['entry_high'] else row['entry_price']

            candles = _fetch_ohlc_since(exchange, symbol, row['scan_time'])

            if candles:
                outcome, best_tgt, sl_after = _resolve_outcome_from_candles(
                    candles, bias, sl, t1, t2, t3
                )
            else:
                current = _get_live_price(symbol, exchange)
                if current == 0:
                    continue
                if bias == 'LONG':
                    sl_hit = current <= sl
                    outcome = 'sl_hit' if sl_hit else (
                        't3_hit' if current >= t3 else
                        't2_hit' if current >= t2 else
                        't1_hit' if current >= t1 else 'pending')
                else:
                    sl_hit = current >= sl
                    outcome = 'sl_hit' if sl_hit else (
                        't3_hit' if current <= t3 else
                        't2_hit' if current <= t2 else
                        't1_hit' if current <= t1 else 'pending')
                best_tgt  = None
                sl_after  = 0

            updates = {}

            if candles and (e_low is not None and e_high is not None):
                zone_bot = min(float(e_low), float(e_high))
                zone_top = max(float(e_low), float(e_high))
                traded_in_zone = any(
                    c['low'] <= zone_top and c['high'] >= zone_bot
                    for c in candles
                )
                entry_confirmed = 1 if traded_in_zone else 0
            else:
                entry_confirmed = row['entry_confirmed']

            updates['entry_confirmed'] = entry_confirmed

            if outcome != 'pending':
                updates['outcome']          = outcome
                updates['best_target_hit']  = best_tgt
                updates['sl_after_target']  = sl_after
                updates['resolved_at']      = now.isoformat()
            elif hours >= 48:
                updates['outcome']          = 'expired'
                updates['resolved_at']      = now.isoformat()

            # Record milestone snapshots
            for threshold, col in [(48, 'check_48h'), (24, 'check_24h'),
                                   (8,  'check_8h'),  (4,  'check_4h')]:
                if hours >= threshold and row[col] is None:
                    updates[col] = outcome

            if updates:
                set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
                vals       = list(updates.values()) + [row['id']]
                conn2 = db_connect()
                conn2.execute(f"UPDATE signal_outcomes SET {set_clause} WHERE id = ?", vals)
                conn2.commit()
                conn2.close()

            # Mirror the resolution to ClawDex's read-only signals feed. Gated
            # on updates['outcome'] (not the local `outcome` var above) so the
            # 48h expiry branch — which sets updates['outcome']='expired' while
            # `outcome` itself stays 'pending' — is mirrored too.
            if updates.get('outcome') and updates['outcome'] != 'pending':
                try:
                    from riven_sync import mirror_outcome_update
                    mirror_outcome_update(
                        exchange, symbol, bias, updates['outcome'],
                        entry_confirmed=updates.get('entry_confirmed'),
                        best_target_hit=updates.get('best_target_hit'),
                        sl_after_target=updates.get('sl_after_target'),
                    )
                except Exception as _ce:
                    logger.warning("riven_sync outcome mirror skipped: %s", _ce)

            if outcome != 'pending':
                conf_tag = {1: 'confirmed', 0: 'missed-entry', -1: 'legacy'}
                logger.info("Outcome resolved: %s %s %s -> %s (best=%s, sl_after=%s, entry=%s)",
                            exchange, symbol, bias, outcome, best_tgt, sl_after,
                            conf_tag.get(entry_confirmed, '?'))

        except Exception as e:
            logger.warning("Outcome check error for %s: %s", row['symbol'], e)


def _parse_stats_arg(arg: str) -> Tuple[int, str, str]:
    """Parse a /stats argument into (minutes, label, mode)."""
    arg = arg.strip().lower()

    if arg.endswith('m') and arg[:-1].isdigit():
        mins = int(arg[:-1])
        if mins <= 0:
            raise ValueError
        label = f"LAST {mins}MIN"
        return mins, label, 'live'

    if arg.endswith('h') and arg[:-1].isdigit():
        hrs = int(arg[:-1])
        if hrs <= 0:
            raise ValueError
        mins = hrs * 60
        if mins <= 120:
            label = f"LAST {hrs}H"
            return mins, label, 'live'
        else:
            label = f"LAST {hrs}H" if hrs % 24 != 0 else f"LAST {hrs // 24}D"
            return mins, label, 'db'

    if arg.isdigit():
        hrs = int(arg)
        if hrs <= 0:
            raise ValueError
        mins = hrs * 60
        if mins <= 120:
            label = f"LAST {hrs}H"
            return mins, label, 'live'
        else:
            label = f"LAST {hrs}H" if hrs % 24 != 0 else f"LAST {hrs // 24}D"
            return mins, label, 'db'

    raise ValueError(f"Unrecognised format: {arg}")


async def _stats_live(update_or_query: Any, label: str, minutes: int, *, is_callback: bool = False) -> None:
    """Short-window stats — live price comparison against scan_results rows."""
    cutoff = (datetime.now() - timedelta(minutes=minutes)).isoformat()

    conn = db_connect()
    rows = conn.execute(
        "SELECT exchange, symbol, bias, confidence, data_json, scan_time "
        "FROM scan_results WHERE scan_time >= ? ORDER BY confidence DESC",
        (cutoff,)
    ).fetchall()
    conn.close()

    kb = InlineKeyboardMarkup([[
        InlineKeyboardButton("30M",  callback_data="stats_time|m30"),
        InlineKeyboardButton("1H",   callback_data="stats_time|m60"),
        InlineKeyboardButton("24H",  callback_data="stats_time|24"),
        InlineKeyboardButton("All",  callback_data="stats_time|0"),
    ]])

    if not rows:
        msg = (
            f"📊 LIVE STATS ({label})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"No signals found in the last {minutes} minute(s).\n\n"
            f"Run /scan to generate signals, then check back."
        )
        if is_callback:
            await update_or_query.edit_message_text(msg, reply_markup=kb)
        else:
            await update_or_query.message.reply_text(msg, reply_markup=kb)
        return

    wins = 0
    losses = 0
    skipped = 0
    t1_near = 0
    sl_near = 0
    raw_pcts = []
    seen = set()

    for r in rows:
        key = f"{r['exchange']}_{r['symbol']}"
        if key in seen:
            continue
        seen.add(key)

        try:
            d = json.loads(r['data_json'])
        except Exception:
            d = {}

        signal_price = d.get('price', 0)
        stop_loss    = d.get('stop_loss', 0)
        t1           = d.get('t1', 0)
        bias         = r['bias']
        exchange     = r['exchange']
        symbol       = r['symbol']

        try:
            live = _get_live_price(symbol, exchange)
        except Exception:
            live = 0

        if not live or not signal_price:
            skipped += 1
            continue

        raw_pct = ((live - signal_price) / signal_price) * 100
        if bias == 'SHORT':
            raw_pct = -raw_pct

        raw_pcts.append(raw_pct)

        if raw_pct >= 0:
            wins += 1
        else:
            losses += 1

        if t1 and signal_price:
            t1_dist  = abs(t1 - signal_price)
            cur_dist = abs(live - signal_price)
            if t1_dist > 0 and (cur_dist / t1_dist) >= 0.7:
                t1_near += 1

        if stop_loss and signal_price:
            sl_dist  = abs(stop_loss - signal_price)
            cur_dist = abs(live - signal_price)
            if sl_dist > 0 and bias == 'LONG'  and live < signal_price and (cur_dist / sl_dist) >= 0.8:
                sl_near += 1
            if sl_dist > 0 and bias == 'SHORT' and live > signal_price and (cur_dist / sl_dist) >= 0.8:
                sl_near += 1

    total    = wins + losses
    win_rate = (wins / total * 100) if total > 0 else 0
    avg_pct  = (sum(raw_pcts) / len(raw_pcts)) if raw_pcts else 0
    bar      = "█" * int(win_rate / 10) + "░" * (10 - int(win_rate / 10))
    avg_emoji = "🟢" if avg_pct >= 0 else "🔴"

    now_str = datetime.now().strftime("%H:%M:%S")

    warning = ""
    if minutes <= 15:
        warning = (
            "⚠️ Very short window — most moves are noise.\n"
            "Green/red reflects price tick direction only,\n"
            "not whether T1/SL was reached.\n\n"
        )

    msg = (
        f"📊 LIVE STATS ({label})  |  🔄 {now_str}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"{warning}"
        f"🎯 WIN RATE (price moving in signal direction)\n"
        f"{bar} {win_rate:.1f}%\n"
        f"({wins} green / {total} signals checked)\n\n"
        f"{avg_emoji} Avg raw move: {avg_pct:+.3f}%\n\n"
        f"📍 PROXIMITY\n"
        f"   Near T1 (≥70% of way): {t1_near}\n"
        f"   Near SL (≥80% of way): {sl_near}\n\n"
        f"ℹ️ Signals checked: {total}  |  Skipped (no price): {skipped}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"Live price vs scan price  |  unlevered raw %\n"
        f"Quick filter 👇"
    )

    if is_callback:
        await update_or_query.edit_message_text(msg, reply_markup=kb)
    else:
        await update_or_query.message.reply_text(msg, reply_markup=kb)


_STATS_UNIT_MIN = {"m": 1, "h": 60, "d": 1440, "w": 10080}
_STATS_MAX_SYMBOLS = 60


def _fmt_window_label(minutes: int) -> str:
    """Human label for a window length in minutes (e.g. 15M, 4H, 1D, 2W)."""
    if minutes % 10080 == 0:
        return f"{minutes // 10080}W"
    if minutes % 1440 == 0:
        return f"{minutes // 1440}D"
    if minutes % 60 == 0:
        return f"{minutes // 60}H"
    return f"{minutes}M"


def _parse_stats_window(arg: str) -> Tuple[int, str]:
    """Parse dynamic /stats argument into (minutes, label)."""
    arg = (arg or "").strip().lower()
    if not arg:
        return 15, _fmt_window_label(15)

    unit = arg[-1]
    if unit in _STATS_UNIT_MIN:
        num = arg[:-1]
        if not num.isdigit() or int(num) <= 0:
            raise ValueError(f"bad stats window: {arg}")
        minutes = int(num) * _STATS_UNIT_MIN[unit]
        return minutes, _fmt_window_label(minutes)

    if arg.isdigit() and int(arg) > 0:
        minutes = int(arg) * 60
        return minutes, _fmt_window_label(minutes)

    raise ValueError(f"Unrecognised window: {arg}")


def _stats_best_keyboard(minutes: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("4H",  callback_data="statsbest|240"),
            InlineKeyboardButton("12H", callback_data="statsbest|720"),
            InlineKeyboardButton("1W",  callback_data="statsbest|10080"),
            InlineKeyboardButton("2W",  callback_data="statsbest|20160"),
        ],
        [
            InlineKeyboardButton("🔄 Refresh",  callback_data=f"statsbest|{minutes}"),
            InlineKeyboardButton("🎯 Win rate", callback_data="stats_time|0"),
        ],
    ])


def _collect_best_signals(minutes: int) -> List[Dict[str, Any]]:
    """Pull unique signals scanned within the window from scan_results."""
    cutoff = (datetime.now() - timedelta(minutes=minutes)).isoformat()
    conn = db_connect()
    rows = conn.execute(
        "SELECT exchange, symbol, bias, confidence, data_json, scan_time "
        "FROM scan_results WHERE scan_time >= ? ORDER BY confidence DESC",
        (cutoff,)
    ).fetchall()
    conn.close()

    out = []
    seen = set()
    for r in rows:
        key = f"{r['exchange']}_{r['symbol']}"
        if key in seen:
            continue
        seen.add(key)
        try:
            d = json.loads(r['data_json'])
        except Exception:
            d = {}
        sig_price = d.get('price', 0) or 0
        if not sig_price:
            continue
        lev_raw = d.get('leverage', 1) or 1
        if isinstance(lev_raw, dict):
            lev_raw = lev_raw.get('suggested', 1) or 1
        try:
            lev_num = float(lev_raw)
        except (TypeError, ValueError):
            lev_num = 1.0
        out.append({
            "symbol":       r['symbol'],
            "exchange":     r['exchange'],
            "bias":         r['bias'],
            "confidence":   r['confidence'],
            "signal_price": sig_price,
            "leverage":     lev_num,
        })
        if len(out) >= _STATS_MAX_SYMBOLS:
            break
    return out


async def _stats_best_card(update_or_query: Any, minutes: int, label: str, *, is_callback: bool = False) -> None:
    """Build + send the best-return leaderboard card for a dynamic window."""
    sigs = _collect_best_signals(minutes)
    kb   = _stats_best_keyboard(minutes)

    async def _send(text: str):
        if is_callback:
            await update_or_query.edit_message_text(text, reply_markup=kb)
        else:
            await update_or_query.message.reply_text(text, reply_markup=kb)

    if not sigs:
        await _send(
            f"🏆 BEST SIGNALS — LAST {label}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"No signals were scanned in this window.\n"
            f"Run /scan first, then check back.\n\n"
            f"Pick another window 👇"
        )
        return

    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(SCAN_EXECUTOR, _get_live_price, s["symbol"], s["exchange"])
        for s in sigs
    ]
    prices = await asyncio.gather(*tasks, return_exceptions=True)

    ranked = []
    skipped = 0
    for s, live in zip(sigs, prices):
        if isinstance(live, Exception) or not live:
            skipped += 1
            continue
        sig_price = s["signal_price"]
        raw_pct = ((live - sig_price) / sig_price) * 100
        if s["bias"] == "SHORT":
            raw_pct = -raw_pct
        lev = s["leverage"] or 1
        ranked.append({
            **s,
            "live":     live,
            "raw_pct":  raw_pct,
            "lev_pct":  raw_pct * lev,
        })

    if not ranked:
        await _send(
            f"🏆 BEST SIGNALS — LAST {label}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"Found {len(sigs)} signal(s) but no live prices were available "
            f"right now. Try again shortly."
        )
        return

    ranked.sort(key=lambda x: x["lev_pct"], reverse=True)
    top = ranked[:10]

    medals = {0: "🥇", 1: "🥈", 2: "🥉"}
    lines_out = []
    for i, s in enumerate(top):
        rank  = medals.get(i, f"{i+1}.")
        arrow = "🟢" if s["lev_pct"] >= 0 else "🔴"
        dir_e = "👈 LONG" if s["bias"] == "LONG" else "👉 SHORT"
        lines_out.append(
            f"{rank} {arrow} {s['symbol']}  {dir_e}\n"
            f"     {s['lev_pct']:+.2f}% @ {s['leverage']:.0f}x "
            f"(raw {s['raw_pct']:+.2f}%)  · conf {s['confidence']}/10"
        )

    avg_lev = sum(s["lev_pct"] for s in ranked) / len(ranked)
    winners = sum(1 for s in ranked if s["lev_pct"] > 0)
    best    = ranked[0]
    now_str = datetime.now().strftime("%H:%M:%S")

    note = ""
    if minutes <= 15:
        note = ("⚠️ Short window — moves are mostly noise and reflect live price\n"
                "direction only, not whether T1/SL was hit.\n\n")

    msg = (
        f"🏆 BEST SIGNALS — LAST {label}  |  🔄 {now_str}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"{note}"
        + "\n".join(lines_out) +
        f"\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👈 Top: {best['symbol']} {best['lev_pct']:+.2f}% (lev-adj)\n"
        f"📊 Avg: {avg_lev:+.2f}%  ·  {winners}/{len(ranked)} in profit\n"
        f"🔎 {len(ranked)} priced" + (f"  ·  {skipped} skipped (no price)" if skipped else "") + "\n"
        f"Live price vs scan entry  ·  leverage-adjusted return\n"
        f"Pick a window 👇"
    )
    await _send(msg)


async def statsbest_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Inline button handler for the best-return leaderboard windows."""
    query = update.callback_query
    await query.answer()
    try:
        minutes = int(query.data.split('|')[1])
    except (IndexError, ValueError):
        minutes = 15
    await _stats_best_card(query, minutes, _fmt_window_label(minutes), is_callback=True)


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Dynamic win rate and best signals leaderboard."""
    _track(update)
    args = context.args

    if not args:
        await _stats_best_card(update, 1440, _fmt_window_label(1440), is_callback=False)
        return

    try:
        minutes, label = _parse_stats_window(args[0])
    except ValueError:
        await update.message.reply_text(
            "⚠️ Invalid time format. The unit decides the window:\n"
            "   m = minutes · h = hours · d = days · w = weeks\n\n"
            "/stats          → best signals, last 15 minutes\n"
            "/stats 5m       → last 5 minutes\n"
            "/stats 4h       → last 4 hours\n"
            "/stats 12h      → last 12 hours\n"
            "/stats 1d       → last 1 day\n"
            "/stats 1w       → last 1 week\n"
            "/stats 2w       → last 2 weeks"
        )
        return

    await _stats_best_card(update, minutes, label, is_callback=False)


async def _stats_winrate_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Detailed win-rate report from signal_outcomes table."""
    args = context.args
    hours_filter = None
    label = "ALL TIME"

    if args:
        try:
            minutes, label, mode = _parse_stats_arg(args[0])
        except ValueError:
            await update.message.reply_text("⚠️ Invalid time format.")
            return

        if mode == 'live':
            await _stats_live(update, label, minutes, is_callback=False)
            return

        hours_filter = minutes // 60

    conn = db_connect()
    c    = conn.cursor()

    if hours_filter:
        cutoff = (datetime.now() - timedelta(hours=hours_filter)).isoformat()
        c.execute(
            "SELECT outcome, bias, confidence, sl_after_target, entry_confirmed "
            "FROM signal_outcomes "
            "WHERE outcome NOT IN ('pending','expired') AND scan_time >= ?", (cutoff,))
    else:
        c.execute(
            "SELECT outcome, bias, confidence, sl_after_target, entry_confirmed "
            "FROM signal_outcomes "
            "WHERE outcome NOT IN ('pending','expired')")

    rows = c.fetchall()

    if hours_filter:
        c.execute("SELECT COUNT(*) as cnt FROM signal_outcomes WHERE outcome='pending' AND scan_time >= ?", (cutoff,))
    else:
        c.execute("SELECT COUNT(*) as cnt FROM signal_outcomes WHERE outcome='pending'")
    pending = c.fetchone()['cnt']

    if hours_filter:
        c.execute("SELECT COUNT(*) as cnt FROM signal_outcomes WHERE outcome='expired' AND scan_time >= ?", (cutoff,))
    else:
        c.execute("SELECT COUNT(*) as cnt FROM signal_outcomes WHERE outcome='expired'")
    expired_cnt = c.fetchone()['cnt']
    conn.close()

    confirmed_rows = [r for r in rows if r['entry_confirmed'] != 0]
    missed_rows    = [r for r in rows if r['entry_confirmed'] == 0]

    if not rows:
        await update.message.reply_text(
            f"📊 No completed signal outcomes for {label}.\n\n"
            f"Outcomes are tracked at 4h, 8h, 24h, and 48h after each scan.\n"
            f"For short windows use minute format: /stats 5m  /stats 30m  /stats 1h"
        )
        return

    total        = len(confirmed_rows)
    wins         = sum(1 for r in confirmed_rows if r['outcome'] in ('t1_hit', 't2_hit', 't3_hit'))
    sl_hits      = sum(1 for r in confirmed_rows if r['outcome'] == 'sl_hit')
    t1_hits      = sum(1 for r in confirmed_rows if r['outcome'] == 't1_hit')
    t2_hits      = sum(1 for r in confirmed_rows if r['outcome'] == 't2_hit')
    t3_hits      = sum(1 for r in confirmed_rows if r['outcome'] == 't3_hit')
    partial_wins = sum(1 for r in confirmed_rows if r['outcome'] == 'sl_hit'
                       and r['sl_after_target'] == 1)

    win_rate = (wins / total * 100) if total > 0 else 0

    high_conf_rows = [r for r in confirmed_rows if r['confidence'] >= 8]
    hc_wins  = sum(1 for r in high_conf_rows if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))
    hc_rate  = (hc_wins / len(high_conf_rows) * 100) if high_conf_rows else 0

    t1_rate = (t1_hits / total * 100) if total > 0 else 0
    t2_rate = (t2_hits / total * 100) if total > 0 else 0
    t3_rate = (t3_hits / total * 100) if total > 0 else 0
    sl_rate = (sl_hits / total * 100) if total > 0 else 0

    bar_filled = int(win_rate / 10)
    bar_empty  = 10 - bar_filled
    bar        = "█" * bar_filled + "░" * bar_empty

    longs      = [r for r in confirmed_rows if r['bias'] == 'LONG']
    shorts     = [r for r in confirmed_rows if r['bias'] == 'SHORT']
    long_wins  = sum(1 for r in longs  if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))
    short_wins = sum(1 for r in shorts if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))

    long_rate  = (long_wins  / len(longs)  * 100) if longs  else 0
    short_rate = (short_wins / len(shorts) * 100) if shorts else 0

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("5M",  callback_data="stats_time|m5"),
        InlineKeyboardButton("30M", callback_data="stats_time|m30"),
        InlineKeyboardButton("1H",  callback_data="stats_time|m60"),
        InlineKeyboardButton("24H", callback_data="stats_time|24"),
        InlineKeyboardButton("All", callback_data="stats_time|0"),
    ]])

    partial_line  = (f"   ↪️ Partial wins (T hit→SL): {partial_wins}\n" if partial_wins else "")
    missed_line   = (f"⚠️ Missed entries (price never hit zone): {len(missed_rows)}\n" if missed_rows else "")
    expired_line  = (f"⏸ Expired (48h, no resolution): {expired_cnt}\n" if expired_cnt else "")

    msg = (
        f"📊 SAKZ BOT — SIGNAL STATS ({label})\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🎯 OVERALL WIN RATE\n"
        f"{bar} {win_rate:.1f}%\n"
        f"({wins} wins / {total} confirmed trades)\n\n"
        f"⭐ HIGH CONFIDENCE (8–10/10)\n"
        f"   Win rate: {hc_rate:.1f}% ({hc_wins}/{len(high_conf_rows)})\n\n"
        f"📈 TARGET BREAKDOWN\n"
        f"   T1 reached:   {t1_hits}  ({t1_rate:.0f}% of trades)\n"
        f"   T2 reached:   {t2_hits}  ({t2_rate:.0f}% of trades)\n"
        f"   T3 reached:   {t3_hits}  ({t3_rate:.0f}% of trades)\n"
        f"   SL triggered: {sl_hits}  ({sl_rate:.0f}% of trades)\n"
        f"{partial_line}"
        f"\n"
        f"🟢 LONG  win rate: {long_rate:.1f}% ({long_wins}/{len(longs)})\n"
        f"🔴 SHORT win rate: {short_rate:.1f}% ({short_wins}/{len(shorts)})\n\n"
        f"⏳ Pending (still tracking): {pending}\n"
        f"{expired_line}"
        f"{missed_line}"
        f"\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"Outcomes: candle OHLC verified, deduplicated\n"
        f"Stats: confirmed entries only (entry zone traded)\n"
        f"Quick filter 👇"
    )

    await update.message.reply_text(msg, reply_markup=keyboard)


async def backtest_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Compute win rates per confidence band and vol regime."""
    _track(update)
    args         = context.args
    hours_filter = None
    label        = "ALL TIME"

    if args:
        try:
            hours_filter = int(args[0])
            if hours_filter <= 0:
                raise ValueError
            label = f"LAST {hours_filter // 24}D" if hours_filter % 24 == 0 else f"LAST {hours_filter}H"
        except ValueError:
            await update.message.reply_text(
                "⚠️ Usage:\n"
                "/backtest          — all time\n"
                "/backtest 168      — last 7 days\n"
                "/backtest 720      — last 30 days"
            )
            return

    conn = db_connect()
    c    = conn.cursor()

    if hours_filter:
        cutoff = (datetime.now() - timedelta(hours=hours_filter)).isoformat()
        c.execute("""SELECT confidence, outcome, sl_after_target, entry_confirmed
                     FROM signal_outcomes
                     WHERE outcome NOT IN ('pending','expired') AND scan_time >= ?""",
                  (cutoff,))
    else:
        c.execute("""SELECT confidence, outcome, sl_after_target, entry_confirmed
                     FROM signal_outcomes
                     WHERE outcome NOT IN ('pending','expired')""")

    all_rows = c.fetchall()
    conn.close()

    rows = [r for r in all_rows if r['entry_confirmed'] != 0]

    if not rows:
        await update.message.reply_text(
            f"🔬 BACKTEST ENGINE ({label})\n\n"
            f"No completed outcomes in this window.\n"
            f"Outcomes resolve at 4h, 8h, 24h, 48h intervals."
        )
        return

    bands = {
        'HIGH (8–10)': [r for r in rows if r['confidence'] >= 8],
        'MED  (6–7)':  [r for r in rows if 6 <= r['confidence'] < 8],
        'LOW  (4–5)':  [r for r in rows if 4 <= r['confidence'] < 6],
    }

    lines = []
    lines.append(f"🔬 BACKTEST ENGINE ({label})")
    lines.append(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.append(f"📊 CONFIDENCE BAND WIN RATES\n")

    recs = []
    for band_name, band_rows in bands.items():
        if not band_rows:
            lines.append(f"*{band_name}*: no data")
            continue
        tot  = len(band_rows)
        wins = sum(1 for r in band_rows if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))
        rate = wins / tot * 100
        bar  = "█" * int(rate / 10) + "░" * (10 - int(rate / 10))
        lines.append(f"*{band_name}*")
        lines.append(f"{bar} *{rate:.1f}%* ({wins}/{tot})")

        if 'LOW' in band_name and rate < 40 and tot >= 10:
            recs.append("⚠️ Low confidence (4–5) win rate is <40%. Consider raising MIN_CONF_SCORE to 6.")
        if 'HIGH' in band_name and rate >= 70 and tot >= 10:
            recs.append("✅ High confidence (8–10) signals performing strongly (≥70% win rate).")
        lines.append("")

    overall_wins = sum(1 for r in rows if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))
    overall_rate = overall_wins / len(rows) * 100
    overall_bar  = "█" * int(overall_rate / 10) + "░" * (10 - int(overall_rate / 10))

    lines.append(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.append(f"🎯 *OVERALL*: {overall_bar} *{overall_rate:.1f}%* ({overall_wins}/{len(rows)})")
    lines.append(f"ℹ️ Total confirmed outcomes: {len(rows)}")

    if recs:
        lines.append(f"\n💡 *CALIBRATION INSIGHTS*")
        for rec in recs:
            lines.append(rec)

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("7D View",       callback_data="bt_time|168"),
        InlineKeyboardButton("30D View",      callback_data="bt_time|720"),
    ]])
    msg = "\n".join(lines)
    await update.message.reply_text(msg, reply_markup=keyboard)


async def bt_time_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Inline button re-runs backtest for selected time window."""
    query = update.callback_query
    await query.answer()
    hours = int(query.data.split('|')[1])
    context.args = [str(hours)]
    update._effective_message = query.message
    await backtest_command(update, context)


async def stats_time_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Inline button handler for stats time filters."""
    query = update.callback_query
    await query.answer()
    token = query.data.split('|')[1]

    if token.startswith('m') and token[1:].isdigit():
        minutes = int(token[1:])
        label   = f"LAST {minutes}MIN" if minutes < 60 else f"LAST {minutes // 60}H"
        await _stats_live(query, label, minutes, is_callback=True)
        return

    hours_filter = int(token)

    if hours_filter == 0:
        label  = "ALL TIME"
        cutoff = None
    elif hours_filter % 24 == 0:
        label  = f"LAST {hours_filter // 24}D"
        cutoff = (datetime.now() - timedelta(hours=hours_filter)).isoformat()
    else:
        label  = f"LAST {hours_filter}H"
        cutoff = (datetime.now() - timedelta(hours=hours_filter)).isoformat()

    conn = db_connect()
    c    = conn.cursor()
    if cutoff:
        c.execute(
            "SELECT outcome, bias, confidence, entry_confirmed FROM signal_outcomes "
            "WHERE outcome NOT IN ('pending','expired') AND scan_time >= ?", (cutoff,))
    else:
        c.execute(
            "SELECT outcome, bias, confidence, entry_confirmed FROM signal_outcomes "
            "WHERE outcome NOT IN ('pending','expired')")
    rows = c.fetchall()
    if cutoff:
        c.execute("SELECT COUNT(*) as cnt FROM signal_outcomes WHERE outcome='pending' AND scan_time >= ?", (cutoff,))
    else:
        c.execute("SELECT COUNT(*) as cnt FROM signal_outcomes WHERE outcome='pending'")
    pending = c.fetchone()['cnt']
    conn.close()

    if not rows:
        await query.edit_message_text(
            f"📊 No completed outcomes for {label}.\n"
            f"Try a shorter live window: tap 5M or 30M."
        )
        return

    confirmed_rows = [r for r in rows if r['entry_confirmed'] != 0]
    missed_cnt     = sum(1 for r in rows if r['entry_confirmed'] == 0)

    total      = len(confirmed_rows)
    wins       = sum(1 for r in confirmed_rows if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))
    sl_hits    = sum(1 for r in confirmed_rows if r['outcome'] == 'sl_hit')
    t1_hits    = sum(1 for r in confirmed_rows if r['outcome'] == 't1_hit')
    t2_hits    = sum(1 for r in confirmed_rows if r['outcome'] == 't2_hit')
    t3_hits    = sum(1 for r in confirmed_rows if r['outcome'] == 't3_hit')
    win_rate   = (wins / total * 100) if total > 0 else 0
    hc_rows    = [r for r in confirmed_rows if r['confidence'] >= 8]
    hc_wins    = sum(1 for r in hc_rows if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))
    hc_rate    = (hc_wins / len(hc_rows) * 100) if hc_rows else 0
    bar        = "█" * int(win_rate / 10) + "░" * (10 - int(win_rate / 10))
    longs      = [r for r in confirmed_rows if r['bias'] == 'LONG']
    shorts     = [r for r in confirmed_rows if r['bias'] == 'SHORT']
    long_wins  = sum(1 for r in longs  if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))
    short_wins = sum(1 for r in shorts if r['outcome'] in ('t1_hit','t2_hit','t3_hit'))
    long_rate  = (long_wins  / len(longs)  * 100) if longs  else 0
    short_rate = (short_wins / len(shorts) * 100) if shorts else 0

    missed_line = (f"⚠️ Missed entries: {missed_cnt}\n" if missed_cnt else "")

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("5M",  callback_data="stats_time|m5"),
        InlineKeyboardButton("30M", callback_data="stats_time|m30"),
        InlineKeyboardButton("1H",  callback_data="stats_time|m60"),
        InlineKeyboardButton("24H", callback_data="stats_time|24"),
        InlineKeyboardButton("All", callback_data="stats_time|0"),
    ]])

    msg = (
        f"📊 SAKZ BOT — SIGNAL STATS ({label})\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🎯 OVERALL WIN RATE\n"
        f"{bar} {win_rate:.1f}%\n"
        f"({wins} wins / {total} confirmed trades)\n\n"
        f"⭐ HIGH CONF (8–10/10): {hc_rate:.1f}% ({hc_wins}/{len(hc_rows)})\n\n"
        f"📈 TARGET BREAKDOWN\n"
        f"   T1: {t1_hits}  T2: {t2_hits}  T3: {t3_hits}  SL: {sl_hits}\n\n"
        f"🟢 LONG  {long_rate:.1f}% ({long_wins}/{len(longs)})\n"
        f"🔴 SHORT {short_rate:.1f}% ({short_wins}/{len(shorts)})\n\n"
        f"⏳ Pending: {pending}\n"
        f"{missed_line}"
        f"\nStats: confirmed entries only\n"
        f"Quick filter 👇"
    )
    await query.edit_message_text(msg, reply_markup=keyboard)

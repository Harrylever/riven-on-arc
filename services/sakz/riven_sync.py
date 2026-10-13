"""
riven_sync.py — best-effort, one-way mirror of finalized sakz-bot signals
into Riven's Postgres (`perp_signals`, owned by Riven's Prisma schema at
packages/shared/prisma/schema.prisma — this module only INSERTs/UPDATEs a table
it does not own or migrate).

Never raises out of a public entry point and never blocks the scan beyond a short
connect timeout. A no-op if the database URL is unset. Riven only displays these
calls; nothing here ever places or manages an order.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("sakz.riven_sync")

_EXCHANGES = {"BYBIT", "MEXC", "BINANCE"}
_BIASES = {"LONG", "SHORT"}


def _parse_datetime(val) -> datetime:
    """A datetime / ISO string as an aware datetime. Naive values are read as UTC
    (headless.py swaps this for a version that reads sakz-bot's naive *local* times)."""
    if isinstance(val, datetime):
        d = val
    elif isinstance(val, str):
        try:
            d = datetime.fromisoformat(val)
        except ValueError:
            d = datetime.now(timezone.utc)
    else:
        d = datetime.now(timezone.utc)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _get_conn():
    """Fresh connection per call: scans are ~10 minutes apart, so connecting is cheap
    and a long-lived connection could be dropped by a proxy while idle."""
    dsn = (os.environ.get("RIVEN_DATABASE_URL") or os.environ.get("CLAWDEX_DATABASE_URL") or "").strip()
    if not dsn:
        return None
    try:
        import psycopg2

        return psycopg2.connect(dsn, connect_timeout=5)
    except Exception as e:
        logger.warning("riven_sync: connection failed: %s", e)
        return None


def mirror_signals(results: list, scan_time=None, limit: int = 20) -> int:
    """Mirror up to `limit` finalized signals into perp_signals. Returns how many
    new rows were written. Never raises."""
    conn = _get_conn()
    if conn is None:
        return 0
    written = 0
    try:
        conn.autocommit = True  # per-row commit, not one all-or-nothing transaction
        when = _parse_datetime(scan_time)
        with conn.cursor() as cur:
            for r in (results or [])[:limit]:
                try:
                    written += 1 if _insert_one(cur, r, when) else 0
                except Exception as e:
                    logger.warning("riven_sync: skipping signal %s %s: %s", r.get("exchange"), r.get("symbol"), e)
    except Exception as e:
        logger.warning("riven_sync: mirror-write batch failed: %s", e)
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return written


def _insert_one(cur, signal: dict, scan_time: datetime) -> bool:
    exchange = str(signal.get("exchange", "")).upper()
    bias = str(signal.get("bias", "")).upper()
    symbol = signal.get("symbol")
    if exchange not in _EXCHANGES or bias not in _BIASES or not symbol:
        return False  # outside the known domain: skip rather than guess

    # Same tracked-entry fallback as sakz_db.db_register_outcome.
    if bias == "LONG":
        tracked_entry = signal.get("entry_high", signal.get("price", 0))
    else:
        tracked_entry = signal.get("entry_low", signal.get("price", 0))
    entry_low = signal.get("entry_low", tracked_entry)
    entry_high = signal.get("entry_high", tracked_entry)
    stop, t1, t2, t3 = (signal.get(k) for k in ("stop_loss", "t1", "t2", "t3"))
    if None in (tracked_entry, entry_low, entry_high, stop, t1, t2, t3):
        return False  # a call without a full trade plan is not worth showing

    # Independent dedup against Postgres: a pair that stays in the top 20 across scans
    # while still pending must not get a new row every ~10 minutes.
    cur.execute(
        """SELECT 1 FROM perp_signals
           WHERE exchange=%s::perp_exchange AND symbol=%s AND bias=%s::perp_bias AND outcome='pending'
           LIMIT 1""",
        (exchange, symbol, bias),
    )
    if cur.fetchone():
        return False

    cur.execute(
        """INSERT INTO perp_signals
            (id, exchange, symbol, bias, confidence, entry_price, entry_low,
             entry_high, stop_loss, t1, t2, t3, scan_time, outcome, created_at)
           VALUES (%s,%s::perp_exchange,%s,%s::perp_bias,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())""",
        (
            str(uuid.uuid4()), exchange, symbol, bias,
            int(signal.get("confidence", 0) or 0), tracked_entry, entry_low, entry_high,
            stop, t1, t2, t3, scan_time, "pending",
        ),
    )
    return True


def mirror_outcome_update(
    exchange: str,
    symbol: str,
    bias: str,
    outcome: str,
    entry_confirmed=None,
    best_target_hit=None,
    sl_after_target=None,
) -> None:
    """Record how a call ended (t1_hit/t2_hit/t3_hit/sl_hit/expired) on the most recent
    pending row for this (exchange, symbol, bias). Never raises."""
    conn = _get_conn()
    if conn is None:
        return
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE perp_signals SET
                     outcome=%s,
                     resolved_at=now(),
                     entry_confirmed=COALESCE(%s, entry_confirmed),
                     best_target_hit=COALESCE(%s, best_target_hit),
                     sl_after_target=COALESCE(%s, sl_after_target)
                   WHERE id = (
                     SELECT id FROM perp_signals
                     WHERE exchange=%s::perp_exchange AND symbol=%s AND bias=%s::perp_bias AND outcome='pending'
                     ORDER BY scan_time DESC LIMIT 1
                   )""",
                (
                    outcome, entry_confirmed, best_target_hit, sl_after_target,
                    str(exchange).upper(), symbol, str(bias).upper(),
                ),
            )
    except Exception as e:
        logger.warning("riven_sync: outcome update failed for %s %s: %s", exchange, symbol, e)
    finally:
        try:
            conn.close()
        except Exception:
            pass

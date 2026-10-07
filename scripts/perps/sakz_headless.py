"""Run sakz-bot's signal engine headless and mirror its calls into Riven.

sakz-bot is normally a Telegram bot; its scanner (`run_full_scan`) and outcome
checker (`_check_signal_outcomes_blocking`) are plain functions that already
mirror into Riven's `perp_signals` table through `clawdex_sync` whenever
CLAWDEX_DATABASE_URL is set. This runner calls them on a timer — no Telegram
token, no exchange keys, and it never places an order (signals only).

Usage (from anywhere):
    set CLAWDEX_DATABASE_URL=postgresql://...      (Riven's Postgres)
    set SAKZ_DIR=C:\\path\\to\\sakz-bot-main          (defaults to the sibling folder)
    python scripts/perps/sakz_headless.py --backfill      # import saved history once
    python scripts/perps/sakz_headless.py                 # scan every 10 min, forever
    python scripts/perps/sakz_headless.py --once          # one scan + outcome pass
"""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone

log = logging.getLogger("riven.sakz")


def _sakz_dir() -> str:
    env = os.environ.get("SAKZ_DIR", "").strip()
    if env:
        return env
    here = os.path.dirname(os.path.abspath(__file__))
    for guess in (
        os.path.join(here, "..", "..", "..", "sakz-bot-main"),
        os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "sakz-bot-main"),
    ):
        if os.path.isdir(guess):
            return os.path.abspath(guess)
    sys.exit("Set SAKZ_DIR to the sakz-bot-main folder.")


def _iso(v: str | None) -> datetime | None:
    """sakz-bot stores naive *local* times (datetime.now()); make them real UTC instants."""
    if not v:
        return None
    try:
        d = datetime.fromisoformat(v)
    except ValueError:
        return None
    return d.astimezone(timezone.utc)  # naive → interpreted as this machine's local time


def backfill(sakz: str, db_url: str) -> int:
    """Copy sakz-bot's saved signal_outcomes into perp_signals (skips ones already there)."""
    import psycopg

    src = sqlite3.connect(os.path.join(sakz, "sakz_data.db"))
    src.row_factory = sqlite3.Row
    rows = src.execute("SELECT * FROM signal_outcomes ORDER BY scan_time").fetchall()
    added = 0
    with psycopg.connect(db_url, connect_timeout=10) as conn, conn.cursor() as cur:
        for r in rows:
            ex, bias = str(r["exchange"]).upper(), str(r["bias"]).upper()
            if ex not in {"BYBIT", "MEXC", "BINANCE"} or bias not in {"LONG", "SHORT"}:
                continue
            scan = _iso(r["scan_time"])
            if scan is None:
                continue
            cur.execute(
                "SELECT 1 FROM perp_signals WHERE exchange = %s::perp_exchange AND symbol = %s"
                " AND bias = %s::perp_bias AND scan_time = %s LIMIT 1",
                (ex, r["symbol"], bias, scan),
            )
            if cur.fetchone():
                continue
            cur.execute(
                """
                INSERT INTO perp_signals (
                    id, exchange, symbol, bias, confidence, entry_price, entry_low, entry_high,
                    stop_loss, t1, t2, t3, scan_time, outcome, entry_confirmed, best_target_hit,
                    sl_after_target, resolved_at, created_at
                ) VALUES (%s, %s::perp_exchange, %s, %s::perp_bias, %s, %s, %s, %s,
                          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()), ex, r["symbol"], bias, int(r["confidence"] or 5),
                    float(r["entry_price"]), float(r["entry_low"]), float(r["entry_high"]),
                    float(r["stop_loss"]), float(r["t1"]), float(r["t2"]), float(r["t3"]),
                    scan, r["outcome"] or "pending", int(r["entry_confirmed"] or 0),
                    r["best_target_hit"], int(r["sl_after_target"] or 0), _iso(r["resolved_at"]),
                    datetime.now(timezone.utc),
                ),
            )
            added += 1
        conn.commit()
    return added


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backfill", action="store_true", help="import sakz-bot's saved signals, then exit")
    ap.add_argument("--once", action="store_true", help="one scan + outcome pass, then exit")
    ap.add_argument("--interval", type=int, default=600, help="seconds between scans (default 600)")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    db_url = os.environ.get("CLAWDEX_DATABASE_URL", "").strip()
    if not db_url:
        sys.exit("Set CLAWDEX_DATABASE_URL to Riven's Postgres (the mirror is a no-op without it).")
    sakz = _sakz_dir()
    sys.path.insert(0, sakz)
    os.chdir(sakz)  # sakz-bot resolves its own files (DB, model) relative to its folder

    if args.backfill:
        log.info("Imported %d saved signal(s) from sakz-bot.", backfill(sakz, db_url))
        return

    import clawdex_sync
    import sakz_engine_outcomes
    import sakz_engine_scan

    # clawdex_sync reads naive timestamps as UTC, but sakz-bot writes local
    # time — off by the machine's UTC offset anywhere but a UTC server.
    _parse = clawdex_sync._parse_datetime

    def _parse_local(val):
        if isinstance(val, datetime) and val.tzinfo is None:
            return val.astimezone(timezone.utc)
        if isinstance(val, str):
            d = _iso(val)
            if d is not None:
                return d
        return _parse(val)

    clawdex_sync._parse_datetime = _parse_local

    while True:
        started = time.time()
        try:
            results = sakz_engine_scan.run_full_scan()  # mirrors the top calls itself
            log.info("Scan done: %d candidate(s).", len(results or []))
        except Exception as err:  # keep the loop alive; the next scan retries
            log.warning("Scan failed: %s", err)
        try:
            sakz_engine_outcomes._check_signal_outcomes_blocking(None)  # resolves + mirrors outcomes
        except Exception as err:
            log.warning("Outcome check failed: %s", err)
        if args.once:
            return
        time.sleep(max(30, args.interval - (time.time() - started)))


if __name__ == "__main__":
    main()

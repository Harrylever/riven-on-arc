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

# Riven's timestamp columns have no timezone and are read back as UTC: make
# every Postgres session from this process UTC (libpq honours PGTZ), or rows
# land in the machine's local time — hours in the future on a non-UTC box.
os.environ["PGTZ"] = "UTC"

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


# ── self-training: the scanner learns from how its own calls turned out ──
RETRAIN_EVERY_S = 6 * 3600
RETRAIN_NEW_RESULTS = 10


def resolved_count(sakz: str) -> int:
    try:
        c = sqlite3.connect(os.path.join(sakz, "sakz_data.db"))
        n = c.execute(
            "SELECT COUNT(*) FROM signal_outcomes WHERE outcome IN ('t1_hit','t2_hit','t3_hit','sl_hit')"
        ).fetchone()[0]
        c.close()
        return int(n)
    except Exception:
        return 0


class SelfTrainer:
    """Retrains sakz-bot's win-probability model (random forest + probability
    calibration, rf_train.py) on every resolved call, and uses it to calibrate
    the conviction of new calls before they reach Riven."""

    def __init__(self, sakz: str):
        self.sakz = sakz
        self.last_train = 0.0
        self.last_count = -1
        self.meta: dict | None = None

    def maybe_train(self) -> None:
        import rf_train

        n = resolved_count(self.sakz)
        due = time.time() - self.last_train > RETRAIN_EVERY_S or n - self.last_count >= RETRAIN_NEW_RESULTS
        if not due:
            return
        try:
            self.meta = rf_train.train(os.path.join(self.sakz, "sakz_data.db"))
            log.info(
                "Retrained on %d resolved calls: win rate %.0f%%, CV AUC %.2f, calibration %s",
                self.meta["n_samples"],
                self.meta["win_rate"] * 100,
                self.meta["cv_roc_auc_mean"],
                self.meta.get("calibration"),
            )
        except Exception as err:  # too few results yet, or a bad batch
            log.info("Self-training skipped: %s", err)
        self.last_train = time.time()
        self.last_count = n

    def trust(self) -> float:
        """How much to lean on the model: 0 until it beats chance, more with data."""
        m = self.meta
        if not m:
            return 0.0
        skill = max(0.0, min(1.0, (float(m["cv_roc_auc_mean"]) - 0.52) / 0.18))
        data = max(0.0, min(1.0, m["n_samples"] / 200))
        return round(skill * data, 3)

    def calibrate(self, signal: dict) -> tuple[int, float | None]:
        """(calibrated 1–10 conviction, model win probability or None)."""
        import rf_train

        raw = int(signal.get("confidence", 5) or 5)
        w = self.trust()
        if w <= 0:
            return raw, None
        p = float(rf_train.predict_signal(signal))
        # Map win odds onto the 0–10 scale around the base rate, then blend.
        base = float(self.meta["win_rate"]) if self.meta else 0.5
        model_score = 5 + (p - base) * 10
        cal = round((1 - w) * raw + w * model_score)
        return max(1, min(10, cal)), p


def install_calibration(trainer: SelfTrainer, db_url: str) -> None:
    """Wrap the mirror: calibrate each call first, then record raw score + win odds."""
    import clawdex_sync
    import psycopg

    original = clawdex_sync.mirror_signals

    def mirror_calibrated(results):
        notes = []
        for r in results or []:
            raw = int(r.get("confidence", 5) or 5)
            cal, p = trainer.calibrate(r)
            r["confidence"] = cal
            notes.append((raw, p, str(r.get("exchange", "")).upper(), str(r.get("symbol", "")).upper(), str(r.get("bias", "")).upper()))
        n = original(results)
        try:
            with psycopg.connect(db_url, connect_timeout=5) as conn, conn.cursor() as cur:
                for raw, p, ex, sym, bias in notes:
                    cur.execute(
                        "UPDATE perp_signals SET raw_confidence = %s, win_prob = %s"
                        " WHERE exchange = %s::perp_exchange AND symbol = %s AND bias = %s::perp_bias"
                        " AND outcome = 'pending' AND raw_confidence IS NULL",
                        (raw, p, ex, sym, bias),
                    )
                conn.commit()
        except Exception as err:
            log.warning("Couldn't record calibration: %s", err)
        return n

    clawdex_sync.mirror_signals = mirror_calibrated
    # sakz_engine_scan imports the function by name inside the scan, so patching the module is enough.


def purge_expired(db_url: str) -> None:
    """Expired calls (no target or stop within 48h) are removed from Riven."""
    try:
        import psycopg

        with psycopg.connect(db_url, connect_timeout=5) as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM perp_signals WHERE outcome = 'expired'")
            if cur.rowcount:
                log.info("Removed %d expired call(s).", cur.rowcount)
            conn.commit()
    except Exception as err:
        log.warning("Couldn't remove expired calls: %s", err)


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

    trainer = SelfTrainer(sakz)
    install_calibration(trainer, db_url)

    while True:
        started = time.time()
        trainer.maybe_train()  # learn from every call that has resolved so far
        try:
            results = sakz_engine_scan.run_full_scan()  # mirrors the top calls itself
            log.info("Scan done: %d candidate(s).", len(results or []))
        except Exception as err:  # keep the loop alive; the next scan retries
            log.warning("Scan failed: %s", err)
        try:
            sakz_engine_outcomes._check_signal_outcomes_blocking(None)  # resolves + mirrors outcomes
        except Exception as err:
            log.warning("Outcome check failed: %s", err)
        purge_expired(db_url)
        if args.once:
            return
        time.sleep(max(30, args.interval - (time.time() - started)))


if __name__ == "__main__":
    main()

"""The mirror into Riven's Postgres: what it writes, and what it refuses to."""
from datetime import datetime, timezone

import riven_sync as c


class FakeCursor:
    def __init__(self, pending_exists=False):
        self.pending_exists = pending_exists
        self.inserts = []

    def execute(self, sql, params=()):
        self._last = sql
        if sql.lstrip().startswith("INSERT"):
            self.inserts.append(params)

    def fetchone(self):
        return (1,) if self.pending_exists else None


def sig(**over):
    base = {
        "exchange": "bybit", "symbol": "BTCUSDT", "bias": "long", "confidence": 8,
        "entry_low": 99.0, "entry_high": 100.0, "stop_loss": 95.0, "t1": 105.0, "t2": 110.0, "t3": 120.0,
    }
    return {**base, **over}


NOW = datetime(2026, 10, 13, 3, 0, tzinfo=timezone.utc)


def test_writes_a_complete_call():
    cur = FakeCursor()
    assert c._insert_one(cur, sig(), NOW) is True
    row = cur.inserts[0]
    assert row[1:4] == ("BYBIT", "BTCUSDT", "LONG")  # upper-cased to match the enums
    assert row[5] == 100.0  # a LONG is tracked from the top of its entry zone


def test_short_is_tracked_from_the_bottom_of_the_zone():
    cur = FakeCursor()
    c._insert_one(cur, sig(bias="SHORT"), NOW)
    assert cur.inserts[0][5] == 99.0


def test_skips_a_pair_that_is_already_pending():
    cur = FakeCursor(pending_exists=True)
    assert c._insert_one(cur, sig(), NOW) is False
    assert cur.inserts == []


def test_skips_incomplete_or_unknown_calls_instead_of_guessing():
    for bad in (sig(t3=None), sig(stop_loss=None), sig(exchange="KRAKEN"), sig(bias="FLAT"), sig(symbol="")):
        cur = FakeCursor()
        assert c._insert_one(cur, bad, NOW) is False
        assert cur.inserts == []


def test_parse_datetime_always_returns_an_aware_time():
    assert c._parse_datetime("2026-10-13T03:00:00").tzinfo is not None
    assert c._parse_datetime(datetime(2026, 10, 13)).tzinfo is not None
    assert c._parse_datetime(None).tzinfo is not None
    assert c._parse_datetime("not a date").tzinfo is not None


def test_is_a_noop_without_a_database(monkeypatch):
    monkeypatch.delenv("RIVEN_DATABASE_URL", raising=False)
    monkeypatch.delenv("CLAWDEX_DATABASE_URL", raising=False)
    assert c.mirror_signals([sig()], NOW) == 0
    c.mirror_outcome_update("BYBIT", "BTCUSDT", "LONG", "t1_hit")  # must not raise


def test_fresh_database_gets_the_tables_the_scan_needs(tmp_path):
    """Regression: on a new volume the scan scored nothing because no tables existed."""
    import os
    import subprocess
    import sys

    db = tmp_path / "fresh.db"
    code = (
        "import headless, sqlite3, os; headless.init_database();"
        "c = sqlite3.connect(os.environ['SAKZ_DB_PATH']);"
        "t = {r[0] for r in c.execute(\"select name from sqlite_master where type='table'\")};"
        "assert {'signal_outcomes', 'signal_bias', 'scan_results', 'price_history'} <= t, t;"
        "print('ok')"
    )
    out = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True,
        env={**os.environ, "SAKZ_DB_PATH": str(db)}, cwd=os.path.dirname(__file__),
    )
    assert out.returncode == 0 and "ok" in out.stdout, out.stderr[-500:]

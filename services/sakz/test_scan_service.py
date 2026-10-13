import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from sakz_scan_service import ScanService
from signal_types import ScanRequest


def test_scan_service_reuses_fresh_cache():
    calls = []
    now = datetime(2026, 9, 18, 12, 0)
    cache = {}

    def runner():
        calls.append("run")
        return [{"symbol": "BTCUSDT", "confidence": 8}]

    service = ScanService(
        runner=runner,
        executor=ThreadPoolExecutor(max_workers=1),
        cache_get=lambda: cache.get("value"),
        cache_set=lambda value: cache.update(value=value),
        cache_lock=asyncio.Lock(),
        ttl_seconds=600,
        clock=lambda: now,
    )

    async def scenario():
        first = await service.scan()
        second = await service.scan()
        return first, second

    first, second = asyncio.run(scenario())
    assert calls == ["run"]
    assert first.from_cache is False
    assert second.from_cache is True
    assert second.as_dicts() == [{"symbol": "BTCUSDT", "confidence": 8}]


def test_scan_service_prevents_cache_stampede():
    calls = []
    cache = {}

    def runner():
        calls.append("run")
        return [{"symbol": "ETHUSDT"}]

    service = ScanService(
        runner=runner,
        executor=ThreadPoolExecutor(max_workers=2),
        cache_get=lambda: cache.get("value"),
        cache_set=lambda value: cache.update(value=value),
        cache_lock=asyncio.Lock(),
        ttl_seconds=600,
        clock=lambda: datetime(2026, 9, 18, 12, 0),
    )

    async def scenario():
        return await asyncio.gather(service.scan(), service.scan())

    results = asyncio.run(scenario())
    assert calls == ["run"]
    assert [result.from_cache for result in results].count(False) == 1
    assert [result.from_cache for result in results].count(True) == 1


if __name__ == "__main__":
    test_scan_service_reuses_fresh_cache()
    print("PASS - test_scan_service_reuses_fresh_cache")
    test_scan_service_prevents_cache_stampede()
    print("PASS - test_scan_service_prevents_cache_stampede")
    print("ALL CHECKS PASSED IN " + os.path.basename(__file__))
    import sys; sys.exit(0)

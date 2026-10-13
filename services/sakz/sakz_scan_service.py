"""Application service for cached market scans.

The legacy scanner remains the signal-producing implementation for now. This
service owns the asynchronous cache and executor boundary so callers no longer
need to know how scans are scheduled or cached.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import Executor
from datetime import datetime
from typing import Callable, Mapping, Optional, Sequence

from signal_types import ScanRequest, ScanResult


class ScanService:
    def __init__(
        self,
        runner: Callable[[], Sequence[Mapping]],
        executor: Executor,
        cache_get: Callable[[], Optional[Mapping]],
        cache_set: Callable[[Mapping], None],
        cache_lock: asyncio.Lock,
        ttl_seconds: float,
        clock: Callable[[], datetime] = datetime.now,
    ):
        self._runner = runner
        self._executor = executor
        self._cache_get = cache_get
        self._cache_set = cache_set
        self._cache_lock = cache_lock
        self._ttl_seconds = ttl_seconds
        self._clock = clock

    def _fresh_cache(self) -> Optional[ScanResult]:
        cached = self._cache_get()
        if not cached:
            return None
        scanned_at = cached.get("time")
        if not isinstance(scanned_at, datetime):
            return None
        age = (self._clock() - scanned_at).total_seconds()
        if age >= self._ttl_seconds:
            return None
        return ScanResult(
            signals=cached.get("results") or [],
            from_cache=True,
            scanned_at=scanned_at,
        )

    async def scan(self, request: ScanRequest = ScanRequest()) -> ScanResult:
        if not request.force:
            cached = self._fresh_cache()
            if cached is not None:
                return cached

        async with self._cache_lock:
            if not request.force:
                cached = self._fresh_cache()
                if cached is not None:
                    return cached

            loop = asyncio.get_running_loop()
            results = await loop.run_in_executor(self._executor, self._runner)
            scanned_at = self._clock()
            self._cache_set({"results": results, "time": scanned_at})
            return ScanResult(
                signals=results,
                from_cache=False,
                scanned_at=scanned_at,
            )

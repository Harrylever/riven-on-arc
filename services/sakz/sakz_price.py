"""sakz_price.py - Shared live price resolution with WebSocket-first cache and REST fallback."""
from __future__ import annotations

import logging
import time
from typing import Dict, Tuple

import sakz_exchanges
from sakz_exchanges import (
    binance_get_current_price,
    bybit_get_current_price,
    mexc_get_current_price,
    mexc_get_futures_price,
)

logger = logging.getLogger("sakz_price")

# Try importing ws_price from sakz_websocket
try:
    from sakz_websocket import ws_funding, ws_price
except ImportError:
    def ws_price(symbol: str) -> float:
        return 0.0
    def ws_funding(symbol: str) -> float:
        return 0.0

from sakz_exchanges import (
    binance_fetch_funding,
    binance_get_current_price,
    bybit_fetch_funding,
    bybit_get_current_price,
    mexc_get_current_price,
    mexc_get_futures_price,
)

_PRICE_CACHE: Dict[str, Tuple[float, float]] = {}  # symbol -> (price, ts)
_PRICE_CACHE_TTL = 3.0  # seconds; WS cache still short-circuits first


def _get_live_price(symbol: str, exchange: str = '') -> float:
    """WS-first price lookup with a short REST cache. Returns float (0 on failure).
    exchange hint: 'BYBIT' | 'BINANCE' | 'MEXC' — used only for REST fallback.
    """
    # 1. WebSocket cache (sub-millisecond, no network)
    cached = ws_price(symbol)
    if cached and cached > 0:
        return cached

    # 2. Short-TTL REST cache — avoids hammering REST on repeated calls
    now = time.time()
    entry = _PRICE_CACHE.get(symbol)
    if entry is not None and (now - entry[1]) < _PRICE_CACHE_TTL:
        return entry[0]

    # 3. REST fallback — ordered by preference / availability
    exch = (exchange or '').upper()
    price = 0.0

    if exch == 'BYBIT' or (not exch and sakz_exchanges.BYBIT_AVAILABLE is not False):
        p = bybit_get_current_price(symbol)
        if p and p > 0:
            price = p

    if not price and (exch == 'BINANCE' or (not exch and sakz_exchanges.BINANCE_AVAILABLE)):
        p = binance_get_current_price(symbol)
        if p and p > 0:
            price = p

    if not price:
        p = mexc_get_futures_price(symbol)
        if p and p > 0:
            price = p

    if not price:
        p = mexc_get_current_price(symbol)
        if p and p > 0:
            price = p

    if price > 0:
        _PRICE_CACHE[symbol] = (price, now)

    return price


def _get_live_funding(symbol: str, exchange: str = '') -> float:
    """WS-first funding rate lookup. Returns float (0 on failure)."""
    cached = ws_funding(symbol)
    if cached is not None:
        return cached

    exch = (exchange or '').upper()
    if exch == 'BYBIT' or not exch:
        return bybit_fetch_funding(symbol)
    if exch == 'BINANCE':
        return binance_fetch_funding(symbol)
    return 0.0


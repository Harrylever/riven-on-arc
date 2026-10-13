"""sakz_exchanges.py - Raw-requests exchange layer extracted from sakz_bot.py.

Bybit / MEXC / Binance OHLCV, price, funding and symbol-universe fetchers, plus
the BYBIT_AVAILABLE / BINANCE_AVAILABLE runtime flags they mutate via `global`.
Other modules MUST read those flags as attributes (sakz_exchanges.BYBIT_AVAILABLE)
to see live updates. Behaviour identical to the original in-line code.
"""
import os
import time
import threading
import logging
import requests
from requests.adapters import HTTPAdapter
try:
    from urllib3.util.retry import Retry
except Exception:  # pragma: no cover - very old urllib3
    from requests.packages.urllib3.util.retry import Retry
import pandas as pd

logger = logging.getLogger(__name__)

from config import (
    HEADERS,
    HTTP_TIMEOUT,
    MEXC_CONTRACT_HOSTS,
    HTTP_MAX_RETRIES,
    HTTP_BACKOFF,
)  # centralised configuration

# Single source of truth for the default request timeout. Lightweight ticker/
# price endpoints below intentionally keep their own shorter timeouts (8/10s).
_TIMEOUT = HTTP_TIMEOUT


# ── CRYPTO-ONLY UNIVERSE FILTER ──────────────────────────────────────────────
# The bot trades crypto perpetuals only. Some venues (notably MEXC) also list
# tokenised equities, metals, oil and FX/index synthetics (e.g. *STOCK*, gold/
# silver, oil, indices). These do NOT behave like crypto, so crypto indicators
# and the BTC-regime gate are meaningless for them. They must never enter the
# scanner. /analyse stays unrestricted and can still inspect them on request.
NON_CRYPTO_SYMBOLS = {
    "XAUTUSDT", "XAUUSDT", "XAGUSDT", "XPTUSDT", "XPDUSDT",
    "GOLDUSDT", "SILVERUSDT",
    "UKOILUSDT", "USOILUSDT", "WTIUSDT", "BRENTUSDT", "XBRUSDT", "XTIUSDT", "NGASUSDT",
    "SPXUSDT", "SPX500USDT", "US500USDT", "US30USDT", "US100USDT", "NAS100USDT", "NDXUSDT",
    "GER40USDT", "UK100USDT", "JP225USDT", "HK50USDT", "EU50USDT",
    "EURUSDT", "GBPUSDT", "JPYUSDT", "AUDUSDT", "CHFUSDT", "CADUSDT", "NZDUSDT",
    # Leveraged equity ETFs listed as perps. These track US equity indices, not
    # crypto, so the BTC-regime gate and crypto indicators are meaningless on
    # them — and without this they scored and surfaced as normal signals.
    "SOXLUSDT", "SOXSUSDT", "TQQQUSDT", "SQQQUSDT", "SPXLUSDT", "SPXSUSDT",
    "UPROUSDT", "SPXUUSDT", "TNAUSDT", "TZAUSDT", "LABUUSDT", "LABDUSDT",
    "YINNUSDT", "YANGUSDT", "FASUSDT", "FAZUSDT", "NUGTUSDT", "DUSTUSDT",
}
# Substring match is deliberately narrow: broad keywords like "NAS" would
# wrongly reject genuine memecoins (e.g. BANANAS31USDT).
NON_CRYPTO_SUBSTRINGS = ("STOCK", "EQUITY")

def is_crypto_symbol(symbol) -> bool:
    """True only for genuine crypto perp symbols.

    Filters tokenised stocks (e.g. MRVLSTOCKUSDT), metals (XAUT/XAG), oil
    (UK/USOIL) and FX/index synthetics so they never reach the crypto scorer."""
    if not symbol:
        return False
    s = str(symbol).upper().replace('_USDT', 'USDT').replace('/', '').strip()
    if s in NON_CRYPTO_SYMBOLS:
        return False
    for pat in NON_CRYPTO_SUBSTRINGS:
        if pat in s:
            return False
    return True


# ── Shared HTTP session with automatic retry/backoff ─────────────────────────
# A single pooled Session is reused for every exchange request. Connection reuse
# (keep-alive) makes repeated scans noticeably faster, and the mounted Retry
# transparently re-attempts transient blocks (403/429) and 5xx errors with
# exponential backoff instead of failing the whole scan on the first hiccup.
def _build_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    retry = Retry(
        total=HTTP_MAX_RETRIES,
        connect=HTTP_MAX_RETRIES,
        read=HTTP_MAX_RETRIES,
        backoff_factor=HTTP_BACKOFF,
        status_forcelist=(403, 408, 429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=32, pool_maxsize=64)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


SESSION = _build_session()


# ── MEXC RATE LIMITER ────────────────────────────────────────────────────────
# FIX #MEXC-510 — MEXC's contract API answers HTTP 200 with a JSON body of
# {"success": false, "code": 510} ("request frequency too fast") once you push
# past roughly 10 requests/second. mexc_fetch_ohlcv treated that as "no data"
# and returned None, so analyze_mexc silently dropped the symbol: measured at
# 16% of fetches lost at 8 concurrent workers and 51% at 32. Symbols vanished
# from /scan with no error shown to anyone.
#
# Measured ceiling (50 pairs x 2 timeframes, this machine):
#     5 req/s -> 100% success      15 req/s -> 78%
#    10 req/s -> 100% success      20 req/s -> 63%     30 req/s -> 49%
# Rotating across MEXC_CONTRACT_HOSTS does NOT raise it (the limit is per IP,
# and futures.mexc.com measured worse), so the hosts list stays a failover
# path only — never a way to spread load.
MEXC_MAX_RPS = float(os.environ.get("MEXC_MAX_RPS", "10"))


class _RateLimiter:
    """Token bucket shared by every thread that talks to a venue."""

    def __init__(self, rate_per_sec: float):
        self._min_interval = 1.0 / rate_per_sec if rate_per_sec > 0 else 0.0
        self._lock = threading.Lock()
        self._next_at = 0.0

    def acquire(self) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            wait = self._next_at - now
            if wait <= 0:
                self._next_at = now + self._min_interval
                wait = 0.0
            else:
                self._next_at += self._min_interval
        if wait > 0:
            time.sleep(wait)


_MEXC_LIMITER = _RateLimiter(MEXC_MAX_RPS)
MEXC_RATE_LIMIT_CODE = 510

# Daily-candle cache: { (symbol, interval, limit): (fetched_at, DataFrame) }
_daily_cache: dict = {}
_DAILY_CACHE_TTL = float(os.environ.get("MEXC_DAILY_CACHE_TTL", "3600"))


def _mexc_get(url, **kwargs):
    """Rate-limited MEXC GET that retries the venue's own throttle response.

    Returns the parsed JSON payload on success, or None. Retries only the
    throttle case; every other failure is left to the caller as before.
    """
    attempts = kwargs.pop('_attempts', 3)
    for attempt in range(attempts):
        _MEXC_LIMITER.acquire()
        try:
            r = SESSION.get(url, **kwargs)
        except Exception as e:
            logger.debug("MEXC GET %s error: %s", url, e)
            return None
        if r.status_code != 200:
            logger.debug("MEXC GET %s HTTP %d", url, r.status_code)
            return None
        try:
            payload = r.json()
        except Exception:
            logger.debug("MEXC GET %s: non-JSON body", url, exc_info=True)
            return None
        if payload.get('success'):
            return payload
        if payload.get('code') == MEXC_RATE_LIMIT_CODE and attempt < attempts - 1:
            backoff = 0.35 * (2 ** attempt)
            logger.debug("MEXC throttled (code 510) on %s — retry in %.2fs", url, backoff)
            time.sleep(backoff)
            continue
        return payload
    return None



# === MEXC-ONLY MODE ==========================================================
# Bybit and Binance public APIs are geo-blocked on the deployment region
# (e.g. Railway), so this bot runs EXCLUSIVELY on MEXC's public market-data API.
#
# IMPORTANT: this bot uses NO exchange API keys/secrets anywhere. Every endpoint
# it calls (MEXC, and the now-disabled Bybit/Binance) is a PUBLIC market-data
# endpoint that needs no authentication. You therefore never have to set any
# exchange API variable on Railway (or anywhere). The only env vars the bot
# reads are TELEGRAM_TOKEN and the optional TURSO_URL / TURSO_TOKEN.
#
# The switch below is controlled by the MEXC_ONLY env var (default OFF). While on:
#   * Bybit/Binance availability is forced False (no startup network probe), and
#   * every Bybit/Binance fetcher short-circuits to an empty result, so NO
#     request is ever sent to those venues regardless of which call site runs.
# The existing "if BYBIT_AVAILABLE ... else MEXC" fallbacks throughout the bot
# then route 100% of market-data traffic to MEXC automatically.
# Trial mode: probe Bybit FIRST, fall back to MEXC. Controlled by the MEXC_ONLY
# env var (default OFF, now that the host can sit in a Bybit-reachable region).
# Set MEXC_ONLY=true on the host to force the old MEXC-only behaviour.
MEXC_ONLY = os.environ.get("MEXC_ONLY", "false").strip().lower() in ("1", "true", "yes", "on")

BYBIT_AVAILABLE = False if MEXC_ONLY else None    # None=unchecked, True=ok, False=blocked
BINANCE_AVAILABLE = False if MEXC_ONLY else None  # None=unchecked, True=ok, False=blocked

def bybit_get_top_symbols(limit=50):
    if MEXC_ONLY or not BYBIT_AVAILABLE:
        return []
    try:
        r    = SESSION.get("https://api.bybit.com/v5/market/tickers?category=linear",
                            headers=HEADERS, timeout=_TIMEOUT)
        data = r.json()
        if data.get('retCode') != 0:
            return []
        vol_list = []
        for t in data['result']['list']:
            sym = t.get('symbol', '')
            if not sym.endswith('USDT'):
                continue
            try:
                vol   = float(t.get('turnover24h', 0) or 0)
                price = float(t.get('lastPrice', 0) or 0)
                if vol > 1_000_000 and price > 0:
                    vol_list.append({'symbol': sym, 'volume': vol, 'price': price})
            except Exception:
                logger.debug("suppressed exception in bybit_get_top_symbols", exc_info=True)
                continue
        vol_list.sort(key=lambda x: x['volume'], reverse=True)
        return [i['symbol'] for i in vol_list[:limit]]
    except Exception:
        return []

def bybit_get_mid_symbols(rank_from=51, rank_to=200, min_vol=500_000):
    """
    CEILING #6 — Mid-tier universe: ranks 51–200 by 24h volume.
    These coins are liquid enough to trade on perps but get less algorithmic
    attention than the top 50, so pricing inefficiency is higher.
    min_vol filters out dead pairs with insufficient liquidity.
    Returns symbol list sorted by volume descending (rank_from first).
    """
    if MEXC_ONLY or not BYBIT_AVAILABLE:
        return []
    try:
        r    = SESSION.get("https://api.bybit.com/v5/market/tickers?category=linear",
                            headers=HEADERS, timeout=_TIMEOUT)
        data = r.json()
        if data.get('retCode') != 0:
            return []
        vol_list = []
        for t in data['result']['list']:
            sym = t.get('symbol', '')
            if not sym.endswith('USDT'):
                continue
            try:
                vol   = float(t.get('turnover24h', 0) or 0)
                price = float(t.get('lastPrice', 0) or 0)
                if vol >= min_vol and price > 0:
                    vol_list.append({'symbol': sym, 'volume': vol})
            except Exception:
                logger.debug("suppressed exception in bybit_get_mid_symbols", exc_info=True)
                continue
        vol_list.sort(key=lambda x: x['volume'], reverse=True)
        # Slice to the requested rank window (1-indexed)
        mid_slice = vol_list[rank_from - 1 : rank_to]
        return [i['symbol'] for i in mid_slice]
    except Exception:
        return []

def bybit_check_available():
    global BYBIT_AVAILABLE
    if MEXC_ONLY:
        BYBIT_AVAILABLE = False
        return False
    try:
        r = requests.get("https://api.bybit.com/v5/market/time",
                         headers=HEADERS, timeout=2)
        if r.status_code == 200 and r.json().get('retCode') == 0:
            BYBIT_AVAILABLE = True
            logger.info("Bybit API: reachable ✅")
        else:
            BYBIT_AVAILABLE = False
            logger.warning("Bybit API: blocked/unavailable (status %s) — skipping", r.status_code)
    except Exception as e:
        BYBIT_AVAILABLE = False
        logger.warning("Bybit API: unreachable (%s) — skipping", e)
    return BYBIT_AVAILABLE

def bybit_fetch_ohlcv(symbol, interval='240', limit=100):
    if not BYBIT_AVAILABLE:
        return None
    try:
        r    = SESSION.get("https://api.bybit.com/v5/market/kline",
                            params={'category': 'linear', 'symbol': symbol,
                                    'interval': interval, 'limit': limit},
                            headers=HEADERS, timeout=_TIMEOUT)
        data = r.json()
        if data.get('retCode') != 0:
            logger.debug("BYBIT %s kline retCode %s: %s", symbol, data.get('retCode'), data.get('retMsg',''))
            return None
        raw = data['result']['list']
        if not raw or len(raw) < 20:
            return None
        raw = raw[::-1]
        df  = pd.DataFrame(raw, columns=['timestamp','open','high','low','close','volume','turnover'])
        for col in ['open','high','low','close','volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df['timestamp'] = pd.to_datetime(df['timestamp'].astype(float), unit='ms')
        return df.dropna()
    except Exception as e:
        logger.warning("BYBIT %s ohlcv exception: %s", symbol, e)
        return None

def bybit_fetch_funding(symbol):
    if MEXC_ONLY or not BYBIT_AVAILABLE:
        return 0
    try:
        r    = SESSION.get("https://api.bybit.com/v5/market/funding/history",
                            params={'category': 'linear', 'symbol': symbol, 'limit': 1},
                            headers=HEADERS, timeout=10)
        data = r.json()
        if data.get('retCode') == 0:
            lst = data['result']['list']
            if lst:
                return float(lst[0].get('fundingRate', 0) or 0)
        return 0
    except Exception:
        return 0

def bybit_get_current_price(symbol):
    if MEXC_ONLY or not BYBIT_AVAILABLE:
        return 0
    try:
        r    = SESSION.get("https://api.bybit.com/v5/market/tickers",
                            params={'category': 'linear', 'symbol': symbol},
                            headers=HEADERS, timeout=10)
        data = r.json()
        if data.get('retCode') == 0:
            lst = data['result']['list']
            if lst:
                return float(lst[0].get('lastPrice', 0) or 0)
        return 0
    except Exception:
        return 0

def mexc_get_top_symbols(limit=50):
    try:
        data = _mexc_get("https://contract.mexc.com/api/v1/contract/ticker",
                         headers=HEADERS, timeout=_TIMEOUT) or {}
        vol_list = []
        if data.get('success') and data.get('data'):
            for t in data['data']:
                sym = t.get('symbol', '')
                if not sym.endswith('_USDT'):
                    continue
                try:
                    vol   = float(t.get('amount24', 0) or 0)
                    price = float(t.get('lastPrice', 0) or 0)
                    if vol > 500_000 and price > 0:
                        # Normalise BTC_USDT → BTCUSDT immediately so fetch functions are consistent
                        clean_sym = sym.replace('_USDT', 'USDT')
                        # FIX #NON-CRYPTO-UNIVERSE — filter here, not only at
                        # scoring time. Previously ~11 of the top 50 were gold,
                        # oil, indices and tokenised stocks: each still cost two
                        # OHLCV fetches before score_pair rejected it, and the
                        # user asked for 50 pairs but only ~39 were real crypto.
                        if not is_crypto_symbol(clean_sym):
                            continue
                        vol_list.append({'symbol': clean_sym, 'volume': vol})
                except Exception:
                    logger.debug("suppressed exception in mexc_get_top_symbols", exc_info=True)
                    continue
        else:
            # Spot fallback — already in BTCUSDT format
            r2 = SESSION.get("https://api.mexc.com/api/v3/ticker/24hr",
                              headers=HEADERS, timeout=_TIMEOUT)
            for t in r2.json():
                sym = t.get('symbol', '')
                if not sym.endswith('USDT'):
                    continue
                try:
                    vol   = float(t.get('quoteVolume', 0) or 0)
                    price = float(t.get('lastPrice', 0) or 0)
                    if vol > 500_000 and price > 0:
                        vol_list.append({'symbol': sym, 'volume': vol})
                except Exception:
                    logger.debug("suppressed exception in mexc_get_top_symbols", exc_info=True)
                    continue
        vol_list.sort(key=lambda x: x['volume'], reverse=True)
        return [i['symbol'] for i in vol_list[:limit]]
    except Exception as e:
        logger.error("MEXC top symbols error: %s", e)
        return []

def mexc_get_mid_symbols(rank_from=51, rank_to=200, min_vol=250_000):
    """
    CEILING #6 — Mid-tier universe for MEXC: ranks 51–200 by 24h volume.
    Uses the same futures ticker endpoint as mexc_get_top_symbols.
    """
    try:
        data = _mexc_get("https://contract.mexc.com/api/v1/contract/ticker",
                         headers=HEADERS, timeout=_TIMEOUT) or {}
        vol_list = []
        if data.get('success') and data.get('data'):
            for t in data['data']:
                sym = t.get('symbol', '')
                if not sym.endswith('_USDT'):
                    continue
                try:
                    vol   = float(t.get('amount24', 0) or 0)
                    price = float(t.get('lastPrice', 0) or 0)
                    if vol >= min_vol and price > 0:
                        clean_sym = sym.replace('_USDT', 'USDT')
                        if not is_crypto_symbol(clean_sym):
                            continue   # FIX #NON-CRYPTO-UNIVERSE
                        vol_list.append({'symbol': clean_sym, 'volume': vol})
                except Exception:
                    logger.debug("suppressed exception in mexc_get_mid_symbols", exc_info=True)
                    continue
        else:
            r2 = SESSION.get("https://api.mexc.com/api/v3/ticker/24hr",
                              headers=HEADERS, timeout=_TIMEOUT)
            for t in r2.json():
                sym = t.get('symbol', '')
                if not sym.endswith('USDT'):
                    continue
                try:
                    vol   = float(t.get('quoteVolume', 0) or 0)
                    price = float(t.get('lastPrice', 0) or 0)
                    if vol >= min_vol and price > 0:
                        vol_list.append({'symbol': sym, 'volume': vol})
                except Exception:
                    logger.debug("suppressed exception in mexc_get_mid_symbols", exc_info=True)
                    continue
        vol_list.sort(key=lambda x: x['volume'], reverse=True)
        mid_slice = vol_list[rank_from - 1 : rank_to]
        return [i['symbol'] for i in mid_slice]
    except Exception as e:
        logger.error("MEXC mid symbols error: %s", e)
        return []

def mexc_fetch_ohlcv(symbol, interval='4h', limit=100):
    """Fetch from MEXC FUTURES kline endpoint (correct for perps scanning)."""
    try:
        # Convert BTCUSDT → BTC_USDT for futures endpoint (suffix-only replace)
        sym_clean = symbol.upper().replace('_USDT', 'USDT').replace('/', '')
        if sym_clean.endswith('USDT'):
            futures_sym = sym_clean[:-4] + '_USDT'
        else:
            futures_sym = sym_clean + '_USDT'

        # MEXC futures interval mapping
        interval_map = {'4h': 'Hour4', '1d': 'Day1', '1h': 'Min60', '15m': 'Min15'}
        mexc_interval = interval_map.get(interval, 'Hour4')

        # FIX #MEXC-URL -- the kline URL was previously wrapped in literal
        # braces (an f-string brace-escape bug), producing the malformed URL
        # "{https://contract.mexc.com/...}". Every MEXC candle fetch raised
        # MissingSchema and was swallowed, which looked exactly like MEXC
        # being "blocked from scanning". The path is now built correctly and
        # we try each configured contract host so one blocked endpoint can't
        # stop scanning.
        # Daily candles only change once a day, so a short cache removes half
        # of the scan's HTTP traffic (and therefore half the rate-limit
        # pressure) without ever serving a stale signal candle.
        cache_key = (futures_sym, mexc_interval, limit)
        if mexc_interval == 'Day1':
            hit = _daily_cache.get(cache_key)
            if hit and (time.time() - hit[0]) < _DAILY_CACHE_TTL:
                return hit[1].copy()

        data = None
        for base in MEXC_CONTRACT_HOSTS:
            # The hosts are a FAILOVER chain, not load spreading: MEXC rate
            # limits per IP, so both share one budget (see _MEXC_LIMITER).
            payload = _mexc_get(
                f"{base}/api/v1/contract/kline/{futures_sym}",
                params={'interval': mexc_interval, 'limit': limit},
                timeout=_TIMEOUT,
            )
            if payload and payload.get('success') and payload.get('data'):
                data = payload
                break
            if payload and payload.get('code') == MEXC_RATE_LIMIT_CODE:
                logger.warning("MEXC %s kline still throttled after retries", futures_sym)
        if data is None:
            logger.warning("MEXC %s futures kline unavailable", futures_sym)
            return None

        d = data['data']
        # MEXC futures returns parallel arrays
        df = pd.DataFrame({
            'timestamp': d.get('time', []),
            'open':      d.get('open', []),
            'high':      d.get('high', []),
            'low':       d.get('low', []),
            'close':     d.get('close', []),
            'volume':    d.get('vol', []),
        })
        if len(df) < 20:
            logger.debug("MEXC %s klines too short: %d rows", futures_sym, len(df))
            return None
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df['timestamp'] = pd.to_datetime(df['timestamp'].astype(float), unit='s')
        out = df[['timestamp','open','high','low','close','volume']].dropna()
        if mexc_interval == 'Day1':
            _daily_cache[cache_key] = (time.time(), out.copy())
        return out
    except Exception as e:
        logger.warning("MEXC %s ohlcv exception: %s", symbol, e)
        return None

# Bulk futures ticker cache, so a feed view that prices 20 signals makes one
# request instead of 20. Short TTL because this feeds live PnL.
_fut_price_cache: dict = {}
_fut_price_cache_at: float = 0.0
_FUT_PRICE_TTL = 5.0
_fut_price_lock = threading.Lock()


def mexc_get_futures_price(symbol) -> float:
    """Last traded price from MEXC *futures*, the venue the scanner signals on.

    FIX #PERP-ONLY-PRICE — the only MEXC price lookup used to be the SPOT
    ticker (api.mexc.com/api/v3/ticker/price). Perp-only listings have no spot
    market, so every one of them reported "price unavailable" in /pnl, /feed
    and the signal cards — including pairs the scanner had just ranked #1.
    """
    global _fut_price_cache, _fut_price_cache_at
    clean = str(symbol).upper().replace('_USDT', 'USDT').replace('/', '')
    now = time.time()

    if now - _fut_price_cache_at < _FUT_PRICE_TTL:
        hit = _fut_price_cache.get(clean)
        if hit:
            return hit

    with _fut_price_lock:
        # Another thread may have refreshed while we waited for the lock.
        if now - _fut_price_cache_at >= _FUT_PRICE_TTL:
            payload = _mexc_get("https://contract.mexc.com/api/v1/contract/ticker",
                                headers=HEADERS, timeout=_TIMEOUT)
            rows = (payload or {}).get('data')
            if isinstance(rows, list) and rows:
                _fut_price_cache = {
                    str(t.get('symbol', '')).replace('_USDT', 'USDT'): float(t.get('lastPrice', 0) or 0)
                    for t in rows
                }
                _fut_price_cache_at = time.time()

    price = _fut_price_cache.get(clean, 0.0)
    if price > 0:
        return price

    # Not in the bulk snapshot — ask for just this contract.
    futures_sym = clean[:-4] + '_USDT' if clean.endswith('USDT') else clean + '_USDT'
    payload = _mexc_get("https://contract.mexc.com/api/v1/contract/ticker",
                        params={'symbol': futures_sym}, headers=HEADERS, timeout=_TIMEOUT)
    row = (payload or {}).get('data')
    if isinstance(row, dict):
        try:
            return float(row.get('lastPrice', 0) or 0)
        except (TypeError, ValueError):
            return 0
    return 0


def mexc_get_current_price(symbol):
    """Spot price, with a futures fallback for perp-only listings."""
    try:
        clean = symbol.replace('_USDT', 'USDT').replace('/', '')
        r     = SESSION.get("https://api.mexc.com/api/v3/ticker/price",
                             params={'symbol': clean}, headers=HEADERS, timeout=10)
        data  = r.json()
        price = float(data.get('price', 0) or 0)
        if price > 0:
            return price
    except Exception:
        logger.debug("MEXC spot price failed for %s", symbol, exc_info=True)
    return mexc_get_futures_price(symbol)

def binance_check_available():
    """Quick probe to see if Binance futures API is reachable."""
    global BINANCE_AVAILABLE
    if MEXC_ONLY:
        BINANCE_AVAILABLE = False
        return False
    try:
        r = requests.get("https://fapi.binance.com/fapi/v1/ping",
                         headers=HEADERS, timeout=2)
        if r.status_code == 200:
            BINANCE_AVAILABLE = True
            logger.info("Binance futures API: reachable ✅")
        else:
            BINANCE_AVAILABLE = False
            logger.warning("Binance futures API: blocked/unavailable (status %s) — skipping", r.status_code)
    except Exception as e:
        BINANCE_AVAILABLE = False
        logger.warning("Binance futures API: unreachable (%s) — skipping", e)
    return BINANCE_AVAILABLE

def binance_get_top_symbols(limit=50):
    if not BINANCE_AVAILABLE:
        return []
    try:
        r    = SESSION.get("https://fapi.binance.com/fapi/v1/ticker/24hr",
                            headers=HEADERS, timeout=_TIMEOUT)
        data = r.json()
        if not isinstance(data, list):
            return []
        vol_list = []
        for t in data:
            sym = t.get('symbol', '')
            if not sym.endswith('USDT'):
                continue
            try:
                vol   = float(t.get('quoteVolume', 0) or 0)
                price = float(t.get('lastPrice', 0) or 0)
                if vol > 5_000_000 and price > 0:
                    vol_list.append({'symbol': sym, 'volume': vol})
            except Exception:
                logger.debug("suppressed exception in binance_get_top_symbols", exc_info=True)
                continue
        vol_list.sort(key=lambda x: x['volume'], reverse=True)
        return [i['symbol'] for i in vol_list[:limit]]
    except Exception:
        return []

def binance_get_mid_symbols(rank_from=51, rank_to=200, min_vol=2_000_000):
    """
    CEILING #6 — Mid-tier universe for Binance Futures: ranks 51–200 by quoteVolume.
    Higher min_vol than Bybit/MEXC because Binance volume figures are larger.
    """
    if not BINANCE_AVAILABLE:
        return []
    try:
        r    = SESSION.get("https://fapi.binance.com/fapi/v1/ticker/24hr",
                            headers=HEADERS, timeout=_TIMEOUT)
        data = r.json()
        if not isinstance(data, list):
            return []
        vol_list = []
        for t in data:
            sym = t.get('symbol', '')
            if not sym.endswith('USDT'):
                continue
            try:
                vol   = float(t.get('quoteVolume', 0) or 0)
                price = float(t.get('lastPrice', 0) or 0)
                if vol >= min_vol and price > 0:
                    vol_list.append({'symbol': sym, 'volume': vol})
            except Exception:
                logger.debug("suppressed exception in binance_get_mid_symbols", exc_info=True)
                continue
        vol_list.sort(key=lambda x: x['volume'], reverse=True)
        mid_slice = vol_list[rank_from - 1 : rank_to]
        return [i['symbol'] for i in mid_slice]
    except Exception:
        return []

def binance_fetch_ohlcv(symbol, interval='4h', limit=100):
    if not BINANCE_AVAILABLE:
        return None
    try:
        r    = SESSION.get("https://fapi.binance.com/fapi/v1/klines",
                            params={'symbol': symbol, 'interval': interval, 'limit': limit},
                            headers=HEADERS, timeout=_TIMEOUT)
        data = r.json()
        if not isinstance(data, list) or len(data) < 20:
            return None
        df = pd.DataFrame(data, columns=[
            'timestamp','open','high','low','close','volume',
            'close_time','quote_volume','trades',
            'taker_buy_base','taker_buy_quote','ignore'])
        for col in ['open','high','low','close','volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        return df[['timestamp','open','high','low','close','volume']].dropna()
    except Exception:
        logger.debug("suppressed exception in binance_fetch_ohlcv", exc_info=True)
        return None

def binance_fetch_funding(symbol):
    if not BINANCE_AVAILABLE:
        return 0
    try:
        r    = SESSION.get("https://fapi.binance.com/fapi/v1/fundingRate",
                            params={'symbol': symbol, 'limit': 1},
                            headers=HEADERS, timeout=10)
        data = r.json()
        if isinstance(data, list) and data:
            return float(data[0].get('fundingRate', 0) or 0)
        return 0
    except Exception:
        return 0

def binance_get_current_price(symbol):
    if not BINANCE_AVAILABLE:
        return 0
    try:
        r    = SESSION.get("https://fapi.binance.com/fapi/v1/ticker/price",
                            params={'symbol': symbol}, headers=HEADERS, timeout=10)
        data = r.json()
        return float(data.get('price', 0) or 0)
    except Exception:
        return 0


"""sakz_engine_scan.py - Core scanning engine and MTF orchestration.

Decomposed from sakz_bot.py as part of Phase 6.
Handles:
- Parallel symbol scan fanout via SCAN_FANOUT
- Volume and liquidity filtering with caching
- Multi-timeframe (MTF) symbol analysis and new listing analysis
- Single-pair scans (_cscan_pair, _cscan_pair_mtf, _cscan_pair_tf)
- Market universe sweeps (run_full_scan, run_mid_scan)
- Asynchronous scan caching and stampede prevention via ScanService
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
import logging
import re
import time
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import pandas as pd

import sakz_exchanges
from exchange_adapters import get_adapter
from sakz_exchanges import (
    BINANCE_AVAILABLE,
    binance_check_available,
    binance_fetch_funding,
    binance_fetch_ohlcv,
    bybit_check_available,
    bybit_fetch_funding,
    bybit_fetch_ohlcv,
    bybit_get_mid_symbols,
    bybit_get_top_symbols,
    mexc_fetch_ohlcv,
    mexc_get_mid_symbols,
    mexc_get_top_symbols,
)
from sakz_network import HEADERS, http_get
try:
    from sakz_paper import paper_maybe_open
    _PAPER_AVAILABLE = True
except ImportError:
    paper_maybe_open = None
    _PAPER_AVAILABLE = False
from sakz_scan_service import ScanService
from sakz_scanner import (
    ScanFailure,
    _SCAN_SHOW_ALL_FLAGS,
    add_indicators,
    get_btc_regime,
    score_pair,
)
import sakz_state as state
from sakz_db import (
    db_append_price_history,
    db_connect,
    db_register_first_signal,
    db_register_outcome,
    db_save_scan,
)
from signal_types import (
    ScanRequest,
    ScanResult,
)

# Reason constants — used for diagnostic aggregation in cscan_command
REASON_NO_CONTRACT    = "NO_CONTRACT"     # API returned empty / unknown symbol
REASON_SHORT_HISTORY  = "SHORT_HISTORY"   # < min candles for the requested TF
REASON_LOW_CONF       = "LOW_CONF"        # scored < 4 or abs-score gate
REASON_REGIME_BLOCK   = "REGIME_BLOCK"    # BTC regime gate suppressed it
REASON_GAP_BLOCK      = "GAP_BLOCK"       # winning - losing < 2
REASON_FLIP_BLOCK     = "FLIP_BLOCK"      # direction flip cooldown
REASON_COUNTER_TREND  = "COUNTER_TREND"   # counter-trend min_score_req not met
REASON_NEUTRAL        = "NEUTRAL"         # market too neutral (no directional bias)
REASON_LOW_VOLUME     = "LOW_VOLUME"      # 24h volume below minimum threshold

logger = logging.getLogger("sakz_engine_scan")

# Concurrency pools
SCAN_EXECUTOR = ThreadPoolExecutor(max_workers=12, thread_name_prefix="scan")
SCAN_FANOUT   = ThreadPoolExecutor(max_workers=8,  thread_name_prefix="fanout")

_scan_cache_lock = asyncio.Lock()
CACHE_TTL_SECS = 900


def _parallel_map(fn: Callable, items: Sequence[Any], workers: Optional[int] = None, stagger: float = 0.02) -> List[Any]:
    """Run `fn` over `items` on SCAN_FANOUT, returning results in input order.

    `stagger` spreads the initial burst slightly so we open connections at a
    polite rate rather than all at once. Exceptions are logged and become None
    so one bad symbol can never abort an entire scan.
    """
    items = list(items)
    if not items:
        return []

    def _guard(item):
        try:
            return fn(item)
        except Exception as e:
            logger.warning("parallel scan task failed for %r: %s", item, e)
            return None

    max_workers = workers or SCAN_FANOUT._max_workers
    out = [None] * len(items)
    futures = {}
    for idx, item in enumerate(items):
        futures[SCAN_FANOUT.submit(_guard, item)] = idx
        if stagger and idx < max_workers:
            time.sleep(stagger)
    for fut in as_completed(futures):
        out[futures[fut]] = fut.result()
    return out


# ── Volume / Liquidity Filter ─────────────────────────────────────────────────
VOL_THRESHOLDS = {
    '15m': 5_000_000,
    '1h':  5_000_000,
    '4h':  20_000_000,
    '1d':  50_000_000,
    'default': 10_000_000,
}

_VOL_EXCHANGE_FRACTION = 0.5
_vol_cache: Dict[str, Tuple[float, float]] = {}   # { 'BYBIT_BTCUSDT': (vol_usdt, fetched_at) }
_VOL_CACHE_TTL_SECS = 900   # 15 min


def _get_symbol_volume(exchange: str, symbol: str) -> float:
    """Return the 24h USDT volume for a symbol on a given exchange.
    Cached for 15 minutes to avoid hammering ticker endpoints.
    """
    now = time.time()
    cache_key = f"{exchange}_{symbol}"
    cached = _vol_cache.get(cache_key)
    if cached and (now - cached[1]) < _VOL_CACHE_TTL_SECS:
        return cached[0]

    vol = 0.0
    try:
        if exchange == 'BYBIT':
            r = http_get(
                f"https://api.bybit.com/v5/market/tickers?category=linear&symbol={symbol}",
                headers=HEADERS, timeout=8,
            )
            data = r.json()
            if data.get('retCode') == 0 and data.get('result', {}).get('list'):
                vol = float(data['result']['list'][0].get('turnover24h', 0) or 0)

        elif exchange == 'MEXC':
            _sym_c = symbol.upper().replace('_USDT', 'USDT')
            futures_sym = (_sym_c[:-4] + '_USDT') if _sym_c.endswith('USDT') else (_sym_c + '_USDT')
            r = http_get(
                f"https://contract.mexc.com/api/v1/contract/ticker?symbol={futures_sym}",
                headers=HEADERS, timeout=8,
            )
            data = r.json()
            if data.get('success') and data.get('data'):
                d = data['data']
                vol = float(d.get('amount24', 0) or d.get('volume24', 0) or 0)

        elif exchange == 'BINANCE':
            r = http_get(
                f"https://fapi.binance.com/fapi/v1/ticker/24hr?symbol={symbol}",
                headers=HEADERS, timeout=8,
            )
            data = r.json()
            vol = float(data.get('quoteVolume', 0) or 0)

    except Exception as e:
        logger.debug("_get_symbol_volume %s %s: %s", exchange, symbol, e)

    _vol_cache[cache_key] = (vol, now)
    return vol


def _passes_volume_filter(exchange: str, symbol: str, tf_key: str) -> Tuple[bool, float, float]:
    """Check if a symbol passes the liquidity filter for a given timeframe.

    Returns (passes: bool, vol_usdt: float, threshold: float).
    """
    threshold = VOL_THRESHOLDS.get(tf_key, VOL_THRESHOLDS['default'])
    per_exch_min = threshold * _VOL_EXCHANGE_FRACTION
    vol = _get_symbol_volume(exchange, symbol)
    if vol == 0:
        return True, 0.0, per_exch_min
    return vol >= per_exch_min, vol, per_exch_min


# ── Timeframe Definitions & Parsing ───────────────────────────────────────────
TF_CONFIGS = {
    '15m': {
        'label':       '15M',
        'bybit_pri':   '15',    'bybit_con':   '60',
        'mexc_pri':    '15m',   'mexc_con':    '1h',
        'binance_pri': '15m',   'binance_con': '1h',
        'min_pri':     40,      'min_con':     20,
        'stoch_window': 5,
        'weight':      0.80,
        'hold_map': {
            9:  (2,   '~2 hours'),
            7:  (1,   '~1 hour'),
            5:  (0.5, '~30 min'),
            3:  (0.25,'~15 min'),
            1:  (0.1, '~5-10 min'),
            0:  (0.07,'~5 min scalp'),
        },
    },
    '1h': {
        'label':       '1H',
        'bybit_pri':   '60',    'bybit_con':   '240',
        'mexc_pri':    '1h',    'mexc_con':    '4h',
        'binance_pri': '1h',    'binance_con': '4h',
        'min_pri':     40,      'min_con':     20,
        'stoch_window': 5,
        'weight':      0.90,
        'hold_map': {
            9:  (8,  '~8 hours'),
            7:  (5,  '~5 hours'),
            5:  (3,  '~3 hours'),
            3:  (1.5,'~90 min'),
            1:  (0.5,'~30 min'),
            0:  (0.25,'~15 min scalp'),
        },
    },
    '4h': {
        'label':       '4H',
        'bybit_pri':   '240',   'bybit_con':   'D',
        'mexc_pri':    '4h',    'mexc_con':    '1d',
        'binance_pri': '4h',    'binance_con': '1d',
        'min_pri':     30,      'min_con':     15,
        'stoch_window': 5,
        'weight':      1.00,
        'hold_map': {
            9:  (72, '~3 days'),
            7:  (48, '~2 days'),
            5:  (24, '~1 day'),
            3:  (10, '~10 hours'),
            1:  (4,  '~4 hours'),
            0:  (1,  '~1 hour'),
        },
    },
    '1d': {
        'label':       '1D',
        'bybit_pri':   'D',     'bybit_con':   'W',
        'mexc_pri':    '1d',    'mexc_con':    '1d',
        'binance_pri': '1d',    'binance_con': '1w',
        'min_pri':     30,      'min_con':     10,
        'stoch_window': 14,
        'weight':      0.95,
        'hold_map': {
            9:  (336, '~2 weeks'),
            7:  (168, '~1 week'),
            5:  (96,  '~4 days'),
            3:  (48,  '~2 days'),
            1:  (24,  '~1 day'),
            0:  (12,  '~12 hours'),
        },
    },
}

TF_ALIASES = {
    '15':  '15m', '15m': '15m', '15min': '15m',
    '1h':  '1h',  '60m': '1h', '60': '1h', 'h1': '1h', '1': '1h',
    '4h':  '4h',  '240m': '4h', '240': '4h', 'h4': '4h', '4': '4h',
    '1d':  '1d',  'daily': '1d', 'd': '1d', 'day': '1d',
}

TF_MAP_MEXC   = {'1m':'Min1','3m':'Min3','5m':'Min5','15m':'Min15',
                 '30m':'Min30','1h':'Min60','2h':'Hour2','4h':'Hour4',
                 '6h':'Hour6','12h':'Hour12','1d':'Day1','1w':'Week1'}
TF_MAP_BYBIT  = {'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
                 '1h':'60','2h':'120','4h':'240','6h':'360','12h':'720',
                 '1d':'D','1w':'W'}
TF_MAP_BINANCE= {'1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m',
                 '1h':'1h','2h':'2h','4h':'4h','6h':'6h','12h':'12h',
                 '1d':'1d','1w':'1w'}

INDICATOR_WARMUP_BARS = 50
INDICATOR_FETCH_MIN   = 150

_NL_MIN_CANDLES = {'5m': 3, '15m': 10, '1h': 6, '4h': 4}
_NL_INTERVALS = {
    'MEXC':    {'5m': 'Min5', '15m': 'Min15', '1h': 'Min60', '4h': 'Hour4'},
    'BYBIT':   {'5m': '5',    '15m': '15',    '1h': '60',     '4h': '240'},
    'BINANCE': {'5m': '5m',   '15m': '15m',   '1h': '1h',     '4h': '4h'},
}
_NL_FETCH = {
    'MEXC':    lambda sym, iv, lim: get_adapter('MEXC').fetch_ohlcv(sym, iv, lim),
    'BYBIT':   lambda sym, iv, lim: get_adapter('BYBIT').fetch_ohlcv(sym, iv, lim),
    'BINANCE': lambda sym, iv, lim: get_adapter('BINANCE').fetch_ohlcv(sym, iv, lim),
}
_NL_TF_LABEL = {'5m': '5M', '15m': '15M', '1h': '1H', '4h': '4H'}


def _NL_FETCH_LIMIT(min_candles: int) -> int:
    return max(min_candles + INDICATOR_WARMUP_BARS + 10, 120)


def _mtf_hold(dur_score: int, tf_key: str) -> Tuple[float, str]:
    """Return (hold_hours, hold_label) for a given dur_score and timeframe."""
    hold_map = TF_CONFIGS[tf_key]['hold_map']
    for threshold in sorted(hold_map.keys(), reverse=True):
        if dur_score >= threshold:
            return hold_map[threshold]
    return hold_map[min(hold_map.keys())]


def _parse_tf_arg(raw: str) -> Optional[str]:
    """Parse a user-supplied timeframe arg like t15m, t4h, 15m, 4H -> canonical key like '15m'."""
    s = raw.lower().lstrip('t')
    s = re.sub(r'min(ute)?s?$', 'm', s)
    s = re.sub(r'hour?s?$',     'h', s)
    s = re.sub(r'day?s?$',      'd', s)
    s = re.sub(r'week?s?$',     'w', s)
    return s if s in TF_MAP_MEXC else None


def parse_scan_args(args: Sequence[str]) -> Tuple[Optional[str], Optional[str], bool]:
    """Parse /scan [pair] [tf] [all] arguments.
    Returns (pair, timeframe, show_all).
    """
    pair = timeframe = None
    show_all = False
    for a in (args or []):
        tok = str(a).strip().lower()
        if not tok:
            continue
        if tok in _SCAN_SHOW_ALL_FLAGS:
            show_all = True
            continue
        tf = _parse_tf_arg(tok)
        if tf:
            timeframe = tf
            continue
        if pair is None:
            pair = tok
    return pair, timeframe, show_all


def _tf_display(tf: str) -> str:
    labels = {'1m':'1 Min','3m':'3 Min','5m':'5 Min','15m':'15 Min','30m':'30 Min',
              '1h':'1 Hour','2h':'2 Hour','4h':'4 Hour','6h':'6 Hour','12h':'12 Hour',
              '1d':'Daily','1w':'Weekly'}
    return labels.get(tf, tf.upper())


def _display_exchanges() -> List[str]:
    """Single source-of-truth exchange policy for scan display output."""
    if sakz_exchanges.BYBIT_AVAILABLE is not False:
        return ["BYBIT"]
    return ["MEXC"]


def _fetch_tf_candles(exchange: str, symbol: str, tf_key: str, role: str = 'pri') -> Any:
    """Fetch OHLCV candles for a given exchange, symbol, timeframe, and role (pri/con)."""
    cfg    = TF_CONFIGS[tf_key]
    prefix = 'bybit' if exchange == 'BYBIT' else ('mexc' if exchange == 'MEXC' else 'binance')
    iv_key = f'{prefix}_{role}'
    interval   = cfg[iv_key]
    min_needed = cfg[f'min_{role}']

    try:
        if exchange == 'BYBIT':
            df = bybit_fetch_ohlcv(symbol, interval, max(min_needed + 20, 100))
        elif exchange == 'MEXC':
            df = mexc_fetch_ohlcv(symbol, interval, max(min_needed + 20, 100))
        else:
            df = binance_fetch_ohlcv(symbol, interval, max(min_needed + 20, 100))

        if df is None:
            return ScanFailure(REASON_NO_CONTRACT, exchange=exchange, tf=tf_key,
                               detail=f"{exchange} returned no data for {symbol} [{interval}]")
        if len(df) < min_needed:
            return ScanFailure(REASON_SHORT_HISTORY, exchange=exchange, tf=tf_key,
                               detail=f"{exchange} {symbol}: only {len(df)} candles (need {min_needed}) on {interval}")
        return df
    except Exception as e:
        logger.debug("_fetch_tf_candles %s %s %s %s: %s", exchange, symbol, tf_key, role, e)
        return ScanFailure(REASON_NO_CONTRACT, exchange=exchange, tf=tf_key,
                           detail=f"{exchange} {symbol} fetch exception: {e}")


def analyze_symbol_new_listing(symbol: str, funding: float = 0.0) -> Any:
    """On-demand scan for brand-new or low-history pairs."""
    exchange_order = []
    if sakz_exchanges.BYBIT_AVAILABLE is not False:
        exchange_order.append('BYBIT')
    exchange_order.append('MEXC')
    if sakz_exchanges.BINANCE_AVAILABLE:
        exchange_order.append('BINANCE')

    best_result = None
    all_failures = []

    for exch in exchange_order:
        intervals = _NL_INTERVALS[exch]

        for tf_short in ['5m', '15m', '1h', '4h']:
            min_c = _NL_MIN_CANDLES[tf_short]
            iv    = intervals[tf_short]
            try:
                if exch == 'MEXC':
                    df = mexc_fetch_ohlcv(symbol, tf_short, _NL_FETCH_LIMIT(min_c))
                elif exch == 'BYBIT':
                    df = bybit_fetch_ohlcv(symbol, iv, _NL_FETCH_LIMIT(min_c))
                else:
                    df = binance_fetch_ohlcv(symbol, iv, _NL_FETCH_LIMIT(min_c))
            except Exception as e:
                all_failures.append(ScanFailure(REASON_NO_CONTRACT, exchange=exch, tf=tf_short,
                                                detail=str(e)))
                continue

            if df is None or len(df) < min_c:
                got = len(df) if df is not None else 0
                all_failures.append(ScanFailure(REASON_SHORT_HISTORY, exchange=exch, tf=tf_short,
                                                detail=f"only {got} candles (need {min_c}) on {tf_short}"))
                continue

            df_ind = add_indicators(df, timeframe='4h')
            if df_ind is None or len(df_ind) < 3:
                all_failures.append(ScanFailure(REASON_SHORT_HISTORY, exchange=exch, tf=tf_short,
                                                detail="add_indicators produced < 3 rows"))
                continue

            try:
                result = score_pair(df_ind, df_ind, funding, symbol)
            except Exception as e:
                all_failures.append(ScanFailure(REASON_NO_CONTRACT, exchange=exch, tf=tf_short,
                                                detail=f"score_pair error: {e}"))
                continue

            if isinstance(result, ScanFailure):
                result.exchange = result.exchange or exch
                result.tf       = result.tf or tf_short
                all_failures.append(result)
                continue
            if result is None:
                all_failures.append(ScanFailure(REASON_NEUTRAL, exchange=exch, tf=tf_short))
                continue

            if isinstance(result, dict) and result.get('regime_blocked'):
                all_failures.append(ScanFailure(REASON_REGIME_BLOCK, exchange=exch, tf=tf_short,
                                                detail=result.get('regime_block_detail') or 'below BTC regime floor'))
                continue

            result['exchange']        = exch
            result['new_listing']     = True
            result['signal_tf']       = tf_short
            result['signal_tf_label'] = _NL_TF_LABEL[tf_short]
            result['vol_24h_usdt']    = 0
            dur_score = result.get('dur_score', 0)
            if dur_score >= 5:
                result['hold'] = '~4 hours'; result['hold_hours'] = 4
            elif dur_score >= 2:
                result['hold'] = '~2 hours'; result['hold_hours'] = 2
            else:
                result['hold'] = '~1 hour';  result['hold_hours'] = 1
            result['tf_note'] = (
                f"⚠️ NEW LISTING — analysis based on {_NL_TF_LABEL[tf_short]} data only. "
                f"Confidence values are less reliable. Use reduced position size."
            )

            logger.info("NEW LISTING SCAN: %s %s %s — conf=%d bias=%s tf=%s",
                        exch, symbol, tf_short,
                        result['confidence'], result['bias'], tf_short)

            if best_result is None or result['confidence'] > best_result['confidence']:
                best_result = result
            break

    if best_result:
        return best_result

    priority = [REASON_REGIME_BLOCK, REASON_LOW_CONF, REASON_GAP_BLOCK,
                REASON_COUNTER_TREND, REASON_NEUTRAL, REASON_SHORT_HISTORY,
                REASON_NO_CONTRACT]
    for reason in priority:
        for f in all_failures:
            if f.reason == reason:
                return f
    return ScanFailure(REASON_NO_CONTRACT, detail=f"no data found for {symbol} on any exchange/TF")


def analyze_symbol_mtf(symbol: str, exchange: str, tf_key: Optional[str] = None, funding: float = 0.0, user_requested: bool = False) -> Any:
    """Analyse a symbol on one or all timeframes for a given exchange."""
    tfs_to_try = [tf_key] if tf_key else list(TF_CONFIGS.keys())
    candidates = []
    failures   = []

    for tf in tfs_to_try:
        cfg = TF_CONFIGS[tf]
        try:
            passes_vol, vol_usdt, vol_threshold = _passes_volume_filter(exchange, symbol, tf)
            if not passes_vol and not user_requested:
                vol_m = vol_usdt / 1_000_000
                thr_m = vol_threshold / 1_000_000
                failures.append(ScanFailure(
                    REASON_LOW_VOLUME, exchange=exchange, tf=tf,
                    detail=f"24h vol ${vol_m:.1f}M < ${thr_m:.1f}M floor for {tf}"
                ))
                continue

            df_pri = _fetch_tf_candles(exchange, symbol, tf, 'pri')
            df_con = _fetch_tf_candles(exchange, symbol, tf, 'con')

            if isinstance(df_pri, ScanFailure):
                failures.append(df_pri)
                continue
            if isinstance(df_con, ScanFailure):
                failures.append(df_con)
                continue
            if df_pri is None or df_con is None:
                failures.append(ScanFailure(REASON_NO_CONTRACT, exchange=exchange, tf=tf))
                continue

            _tf_minutes = {'15m': 15, '1h': 60, '4h': 240, '1d': 1440}.get(tf, 240)
            try:
                _last_ts = df_pri.index[-1] if hasattr(df_pri.index[-1], 'timestamp') else None
                if _last_ts is None and 'timestamp' in df_pri.columns:
                    _last_ts = pd.Timestamp(df_pri['timestamp'].iloc[-1])
                elif _last_ts is None:
                    _last_ts = pd.Timestamp(df_pri.index[-1])
                _age_minutes = (pd.Timestamp.utcnow().tz_localize(None) - _last_ts.tz_localize(None)).total_seconds() / 60
                if _age_minutes > _tf_minutes * 1.5:
                    failures.append(ScanFailure(REASON_NO_CONTRACT, exchange=exchange, tf=tf,
                                                detail=f"stale data: last candle {_age_minutes:.0f}m ago (>{_tf_minutes*1.5:.0f}m threshold)"))
                    continue
            except Exception:
                logger.debug("suppressed exception in analyze_symbol_mtf", exc_info=True)

            stoch_tf = '4h' if cfg['stoch_window'] == 5 else '1d'
            df_pri   = add_indicators(df_pri, timeframe=stoch_tf)
            df_con   = add_indicators(df_con, timeframe='1d')
            if df_pri is None or df_con is None:
                failures.append(ScanFailure(REASON_SHORT_HISTORY, exchange=exchange, tf=tf,
                                            detail="add_indicators returned None"))
                continue
            if len(df_pri) < 5 or len(df_con) < 5:
                failures.append(ScanFailure(REASON_SHORT_HISTORY, exchange=exchange, tf=tf,
                                            detail=f"after indicators: pri={len(df_pri)} con={len(df_con)} rows"))
                continue

            result = score_pair(df_pri, df_con, funding, symbol, user_requested=user_requested)

            if isinstance(result, ScanFailure):
                result.exchange = result.exchange or exchange
                result.tf       = result.tf or tf
                failures.append(result)
                continue
            if result is None:
                failures.append(ScanFailure(REASON_NEUTRAL, exchange=exchange, tf=tf))
                continue

            if isinstance(result, dict) and result.get('regime_blocked'):
                failures.append(ScanFailure(REASON_REGIME_BLOCK, exchange=exchange, tf=tf,
                                            detail=result.get('regime_block_detail') or 'below BTC regime floor'))
                continue

            dur_score = result.get('dur_score', 0)
            hold_hours, hold_label = _mtf_hold(dur_score, tf)
            result['hold_hours'] = hold_hours
            result['hold']       = hold_label

            dur_reasons  = result.get('dur_reasons', [])
            first_reason = dur_reasons[0] if dur_reasons else ''
            if hold_hours >= 24:
                result['tf_note'] = f"{cfg['label']} signal — hold {hold_label}. {first_reason}"
            else:
                result['tf_note'] = f"{cfg['label']} signal — target within {hold_label}. {first_reason}"

            result['signal_tf']       = tf
            result['signal_tf_label'] = cfg['label']
            result['exchange']        = exchange
            result['_weighted_conf']  = result['confidence'] * cfg['weight']
            result['vol_24h_usdt']    = vol_usdt

            candidates.append(result)

        except Exception as e:
            logger.warning("analyze_symbol_mtf %s %s %s: %s", exchange, symbol, tf, e)
            failures.append(ScanFailure(REASON_NO_CONTRACT, exchange=exchange, tf=tf, detail=str(e)))
            continue

    if candidates:
        candidates.sort(
            key=lambda r: (r['_weighted_conf'], r.get('dur_score', 0)),
            reverse=True
        )
        best = candidates[0]
        best.pop('_weighted_conf', None)
        return best

    priority = [REASON_REGIME_BLOCK, REASON_LOW_CONF, REASON_GAP_BLOCK,
                REASON_COUNTER_TREND, REASON_FLIP_BLOCK, REASON_SHORT_HISTORY,
                REASON_NEUTRAL, REASON_LOW_VOLUME, REASON_NO_CONTRACT]
    for reason in priority:
        for f in failures:
            if f.reason == reason:
                return f
    return ScanFailure(REASON_NO_CONTRACT, exchange=exchange,
                       detail="no candle data from any exchange")


def _cscan_pair(symbol: str) -> Any:
    """Legacy default scan pinned to 4H timeframe."""
    return _cscan_pair_mtf(symbol, tf_key='4h')


def _cscan_pair_mtf(symbol: str, tf_key: Optional[str] = None) -> Any:
    """MTF-aware version of _cscan_pair."""
    signals  = []
    failures = []
    exchanges = [('MEXC', 0.0)]

    for exch, funding in exchanges:
        try:
            result = analyze_symbol_mtf(symbol, exch, tf_key=tf_key, funding=funding,
                                        user_requested=True)
            if isinstance(result, ScanFailure):
                failures.append(result)
            elif result:
                signals.append(result)
        except Exception as e:
            logger.warning("_cscan_pair_mtf %s %s: %s", exch, symbol, e)
            failures.append(ScanFailure(REASON_NO_CONTRACT, exchange=exch, detail=str(e)))

    if signals:
        signals.sort(key=lambda r: (r['confidence'], r.get('dur_score', 0)), reverse=True)
        return signals

    if (sakz_exchanges.BYBIT_AVAILABLE is not False
            and any(getattr(f, 'reason', None) == REASON_NO_CONTRACT for f in failures)):
        try:
            bybit_result = analyze_symbol_mtf(symbol, 'BYBIT', tf_key=tf_key,
                                              funding=0.0, user_requested=True)
            if isinstance(bybit_result, ScanFailure):
                failures.append(bybit_result)
            elif bybit_result:
                signals.append(bybit_result)
        except Exception as e:
            logger.warning("_cscan_pair_mtf BYBIT fallback %s: %s", symbol, e)
            failures.append(ScanFailure(REASON_NO_CONTRACT, exchange='BYBIT', detail=str(e)))

    if signals:
        signals.sort(key=lambda r: (r['confidence'], r.get('dur_score', 0)), reverse=True)
        return signals

    has_short_history = any(f.reason == REASON_SHORT_HISTORY for f in failures)
    has_no_contract   = any(f.reason == REASON_NO_CONTRACT   for f in failures)
    if has_short_history or (has_no_contract and not failures):
        nl_result = analyze_symbol_new_listing(symbol, funding=0.0)
        if not isinstance(nl_result, ScanFailure) and nl_result:
            return [nl_result]
        if isinstance(nl_result, ScanFailure):
            failures.append(nl_result)

    return failures or [ScanFailure(REASON_NO_CONTRACT, detail="no exchanges tried")]


def analyze_bybit(symbol: str) -> Optional[Dict[str, Any]]:
    try:
        df4h = bybit_fetch_ohlcv(symbol, '240', 100)
        if df4h is None or len(df4h) < 30:
            return None
        df1d = bybit_fetch_ohlcv(symbol, 'D', INDICATOR_FETCH_MIN)
        if df1d is None or len(df1d) < 15:
            return None
        df4h = add_indicators(df4h, timeframe="4h")
        df1d = add_indicators(df1d, timeframe="1d")
        if df4h is None or df1d is None: return None
        if len(df4h) < 5 or len(df1d) < 5: return None
        funding = bybit_fetch_funding(symbol)
        result  = score_pair(df4h, df1d, funding, symbol)
        if isinstance(result, ScanFailure) or result is None:
            return None
        if isinstance(result, dict) and result.get('regime_blocked'):
            return None
        result['exchange'] = 'BYBIT'
        return result
    except Exception as e:
        logger.warning("BYBIT %s analyze error: %s", symbol, e)
        return None


def analyze_mexc(symbol: str) -> Optional[Dict[str, Any]]:
    try:
        df4h = mexc_fetch_ohlcv(symbol, '4h', 100)
        if df4h is None or len(df4h) < 30:
            return None
        df1d = mexc_fetch_ohlcv(symbol, '1d', INDICATOR_FETCH_MIN)
        if df1d is None or len(df1d) < 15:
            return None
        df4h = add_indicators(df4h, timeframe="4h")
        df1d = add_indicators(df1d, timeframe="1d")
        if df4h is None or df1d is None: return None
        if len(df4h) < 5 or len(df1d) < 5: return None
        result = score_pair(df4h, df1d, 0, symbol)
        if isinstance(result, ScanFailure) or result is None:
            return None
        if isinstance(result, dict) and result.get('regime_blocked'):
            return None
        result['exchange'] = 'MEXC'
        return result
    except Exception as e:
        logger.warning("MEXC %s analyze error: %s", symbol, e)
        return None


def analyze_binance(symbol: str) -> Optional[Dict[str, Any]]:
    if not BINANCE_AVAILABLE:
        return None
    try:
        df4h = binance_fetch_ohlcv(symbol, '4h', 100)
        if df4h is None or len(df4h) < 30: return None
        df1d = binance_fetch_ohlcv(symbol, '1d', INDICATOR_FETCH_MIN)
        if df1d is None or len(df1d) < 15: return None
        df4h = add_indicators(df4h, timeframe="4h")
        df1d = add_indicators(df1d, timeframe="1d")
        if df4h is None or df1d is None: return None
        if len(df4h) < 5 or len(df1d) < 5: return None
        funding = binance_fetch_funding(symbol)
        result  = score_pair(df4h, df1d, funding, symbol)
        if isinstance(result, ScanFailure) or result is None:
            return None
        if isinstance(result, dict) and result.get('regime_blocked'):
            return None
        result['exchange'] = 'BINANCE'
        return result
    except Exception as e:
        logger.warning("BINANCE %s analyze error: %s", symbol, e)
        return None



def _cscan_pair_tf(symbol: str, tf: str) -> Tuple[List[Dict[str, Any]], List[ScanFailure]]:
    """Scan one symbol on requested timeframe via MEXC with auto fallback."""
    results  = []
    failures = []

    mexc_intervals = {'1m':'Min1','3m':'Min3','5m':'Min5','15m':'Min15',
                      '30m':'Min30','1h':'Min60','2h':'Hour2','4h':'Hour4',
                      '6h':'Hour6','12h':'Hour12','1d':'Day1','1w':'Week1'}
    mexc_iv = mexc_intervals.get(tf, 'Hour4')

    walk_order = [tf]
    for fallback in ['4h', '1h', '15m', '5m']:
        if fallback not in walk_order:
            walk_order.append(fallback)

    tf_used    = None
    df_p_found = None
    df_s_found = None

    for attempt_tf in walk_order:
        attempt_iv  = mexc_intervals.get(attempt_tf, 'Hour4')
        cfg         = TF_CONFIGS.get(attempt_tf, TF_CONFIGS['4h'])
        MIN_PRI     = cfg['min_pri']
        MIN_CON     = cfg['min_con']

        try:
            df_p = mexc_fetch_ohlcv(symbol, attempt_iv, max(MIN_PRI + 20, 100))
            if df_p is None or len(df_p) < 3:
                failures.append(ScanFailure(
                    REASON_SHORT_HISTORY, exchange='MEXC', tf=attempt_tf,
                    detail=f"MEXC {symbol}: only {len(df_p) if df_p is not None else 0} candles on {attempt_tf}"
                ))
                continue

            df_s = mexc_fetch_ohlcv(symbol, 'Day1', max(MIN_CON + 10, 50))
            if df_s is None or len(df_s) < MIN_CON:
                try:
                    spot_data = http_get(
                        f"https://api.mexc.com/api/v3/klines?symbol={symbol}&interval=1d&limit=50",
                        headers=HEADERS, timeout=8
                    ).json()
                    if isinstance(spot_data, list) and len(spot_data) >= MIN_CON:
                        df_s = pd.DataFrame(spot_data, columns=[
                            'timestamp','open','high','low','close','volume',
                            'close_time','quote_vol','trades','taker_base','taker_quote','ignore'
                        ])
                        for col in ['open','high','low','close','volume']:
                            df_s[col] = pd.to_numeric(df_s[col], errors='coerce')
                        df_s['timestamp'] = pd.to_datetime(df_s['timestamp'], unit='ms')
                        df_s = df_s[['timestamp','open','high','low','close','volume']].dropna()
                    else:
                        df_s = None
                except Exception as _fe:
                    logger.debug("MEXC %s spot fallback: %s", symbol, _fe)
                    df_s = None

            if df_s is None or len(df_s) < MIN_CON:
                df_s = df_p.copy()

            tf_used    = attempt_tf
            df_p_found = df_p
            df_s_found = df_s
            break

        except Exception as e:
            logger.warning("cscan_tf MEXC %s %s: %s", symbol, attempt_tf, e)
            failures.append(ScanFailure(REASON_NO_CONTRACT, exchange='MEXC', tf=attempt_tf, detail=str(e)))

    if tf_used is not None and df_p_found is not None:
        try:
            df_p2 = add_indicators(df_p_found, timeframe=tf_used)
            df_s2 = add_indicators(df_s_found, timeframe='1d')

            if df_p2 is None or len(df_p2) < 3:
                failures.append(ScanFailure(REASON_SHORT_HISTORY, exchange='MEXC', tf=tf_used,
                                            detail=f"MEXC {symbol}: indicators reduced below 3 rows on {tf_used}"))
            else:
                result = score_pair(df_p2, df_s2, 0, symbol, user_requested=True)
                if isinstance(result, ScanFailure):
                    result.exchange = result.exchange or 'MEXC'
                    result.tf       = result.tf or tf_used
                    failures.append(result)
                elif isinstance(result, dict) and result.get('regime_blocked'):
                    failures.append(ScanFailure(REASON_REGIME_BLOCK, exchange='MEXC', tf=tf_used,
                                                detail=result.get('regime_block_detail') or 'below BTC regime floor'))
                elif result:
                    result['exchange']  = 'MEXC'
                    result['timeframe'] = tf_used
                    if tf_used != tf:
                        result['tf_note']     = (
                            f"⚠️ Auto-switched to {_tf_display(tf_used)} "
                            f"(not enough {_tf_display(tf)} history yet).\n"
                            f"Signal based on {_tf_display(tf_used)} data — use smaller size."
                        )
                        result['new_listing'] = True
                    results.append(result)
        except Exception as e:
            logger.warning("cscan_tf score_pair %s %s: %s", symbol, tf_used, e)
            failures.append(ScanFailure(REASON_NO_CONTRACT, exchange='MEXC', tf=tf_used, detail=str(e)))

    if not results:
        try:
            alt = analyze_symbol_new_listing(symbol)
            if alt and not isinstance(alt, ScanFailure):
                alt.setdefault('timeframe', alt.get('signal_tf', tf))
                results.append(alt)
            elif isinstance(alt, ScanFailure):
                failures.append(alt)
        except Exception as e:
            logger.warning("cscan_tf cross-exchange fallback %s: %s", symbol, e)

    return results, failures


def _scan_pairs_tf(symbols: Sequence[str], tf: str) -> List[Dict[str, Any]]:
    """Scan every symbol on one timeframe, in parallel, flattened to signals."""
    out = []
    for res in _parallel_map(lambda sym: _cscan_pair_tf(sym, tf)[0], symbols):
        if res:
            out.extend(res)
    return out


def _register_lifecycle_signal(r: Dict[str, Any], current_price: Optional[float] = None) -> None:
    """Record/refresh the first-signal memory for a scanned signal."""
    try:
        sig = dict(r)
        lev = sig.get('leverage')
        if isinstance(lev, dict):
            sig['leverage'] = lev.get('suggested')
        db_register_first_signal(sig, current_price=current_price)
    except Exception as e:
        logger.debug("_register_lifecycle_signal failed for %s: %s", r.get('symbol', '?'), e)


def run_mid_scan(rank_from: int = 51, rank_to: int = 200) -> List[Dict[str, Any]]:
    """Mid-tier universe scan for coins ranked 51–200 by volume."""
    results = []

    bybit_check_available()
    binance_check_available()

    state._btc_regime_cache = None
    regime = get_btc_regime()
    logger.info("=== MID SCAN START | BTC Regime: %s | ranks %d–%d ===",
                regime, rank_from, rank_to)

    def _process(r):
        if not r:
            return
        r['tier'] = 'MID'
        results.append(r)

    _venue = _display_exchanges()[0]
    if _venue == 'BYBIT':
        analyzed = _parallel_map(analyze_bybit, bybit_get_mid_symbols(rank_from, rank_to))
    else:
        analyzed = _parallel_map(analyze_mexc, mexc_get_mid_symbols(rank_from, rank_to))
    for r in analyzed:
        _process(r)

    _vol_rank = {"MEDIUM": 4, "HIGH": 3, "LOW": 2, "EXTREME": 1, "RANGING": 0}
    results.sort(
        key=lambda x: (x["confidence"], (x.get("consensus_score") or 0.5), x["score"],
                       _vol_rank.get(x.get("vol_regime", "MEDIUM"), 2)),
        reverse=True
    )

    seen_syms = set()
    deduped   = []
    for r in results:
        base = r['symbol'].replace('_USDT', 'USDT')
        if base not in seen_syms:
            seen_syms.add(base)
            deduped.append(r)

    logger.info("Mid scan complete — %d signals found (%d before dedup)",
                len(deduped), len(results))
    return deduped


def run_full_scan() -> List[Dict[str, Any]]:
    """Blocking scan — runs in thread pool executor."""
    _scan_t0 = time.time()

    state.previous_scan_results = state.last_scan_results.copy()
    results = []

    bybit_check_available()
    binance_check_available()

    state._btc_regime_cache = None
    regime = get_btc_regime()
    logger.info("=== SCAN START | BTC Regime: %s ===", regime)

    def _warm_vol_cache(symbols: Sequence[str], exchange: str) -> None:
        try:
            now = time.time()
            if exchange == 'BYBIT':
                r = http_get("https://api.bybit.com/v5/market/tickers?category=linear",
                             headers=HEADERS, timeout=15)
                data = r.json()
                if data.get('retCode') == 0:
                    for t in data['result']['list']:
                        sym = t.get('symbol', '')
                        if sym in symbols:
                            vol = float(t.get('turnover24h', 0) or 0)
                            _vol_cache[f"BYBIT_{sym}"] = (vol, now)
            elif exchange == 'MEXC':
                r = http_get("https://contract.mexc.com/api/v1/contract/ticker",
                             headers=HEADERS, timeout=15)
                data = r.json()
                if data.get('success') and data.get('data'):
                    for t in data['data']:
                        raw_sym   = t.get('symbol', '')
                        clean_sym = raw_sym.replace('_USDT', 'USDT')
                        if clean_sym in symbols:
                            vol = float(t.get('amount24', 0) or 0)
                            _vol_cache[f"MEXC_{clean_sym}"] = (vol, now)
            elif exchange == 'BINANCE':
                r = http_get("https://fapi.binance.com/fapi/v1/ticker/24hr",
                             headers=HEADERS, timeout=15)
                for t in r.json():
                    sym = t.get('symbol', '')
                    if sym in symbols:
                        vol = float(t.get('quoteVolume', 0) or 0)
                        _vol_cache[f"BINANCE_{sym}"] = (vol, now)
        except Exception as e:
            logger.warning("_warm_vol_cache %s: %s", exchange, e)

    def _process(r: Optional[Dict[str, Any]], exchange_key_prefix: str) -> None:
        if not r:
            return
        if 'vol_24h_usdt' not in r:
            cached = _vol_cache.get(f"{r.get('exchange','BYBIT')}_{r.get('symbol','')}")
            r['vol_24h_usdt'] = cached[0] if cached else 0
        results.append(r)
        key = f"{exchange_key_prefix}_{r['symbol']}"
        db_append_price_history(key, r['exchange'], r['symbol'], r['price'])
        if key not in state.price_history:
            state.price_history[key] = []
        state.price_history[key].append({'time': datetime.now(), 'price': r['price'],
                                         'exchange': r['exchange'], 'symbol': r['symbol']})
        cutoff = datetime.now() - timedelta(hours=24)
        state.price_history[key] = [p for p in state.price_history[key] if p['time'] > cutoff]

    _venue = _display_exchanges()[0]
    if _venue == 'BYBIT':
        syms = bybit_get_top_symbols(50)
        _warm_vol_cache(set(syms), 'BYBIT')
        analyzed = _parallel_map(analyze_bybit, syms)
    else:
        syms = mexc_get_top_symbols(50)
        _warm_vol_cache(set(syms), 'MEXC')
        analyzed = _parallel_map(analyze_mexc, syms)
    for r in analyzed:
        _process(r, _venue)

    _vol_rank = {"MEDIUM": 4, "HIGH": 3, "LOW": 2, "EXTREME": 1, "RANGING": 0}
    results.sort(
        key=lambda x: (x["confidence"], (x.get("consensus_score") or 0.5), x["score"], _vol_rank.get(x.get("vol_regime", "MEDIUM"), 2)),
        reverse=True
    )

    CORRELATED_SLOT_CAP = 3
    SAME_DIR_HARD_CAP   = 5

    btc_r = get_btc_regime()
    bull_regime = btc_r in ('BULL', 'STRONG_BULL')
    bear_regime = btc_r in ('BEAR', 'STRONG_BEAR')

    corr_long_count  = 0
    corr_short_count = 0
    indep_count      = 0

    for r in results:
        bias = r['bias']
        is_corr_long  = (bias == 'LONG'  and bull_regime)
        is_corr_short = (bias == 'SHORT' and bear_regime)

        if is_corr_long:
            corr_long_count += 1
            slot = corr_long_count
            r['corr_type']    = 'correlated_long'
            r['corr_slot']    = slot
            r['corr_flagged']      = slot > CORRELATED_SLOT_CAP
            r['corr_hard_blocked'] = slot > SAME_DIR_HARD_CAP
        elif is_corr_short:
            corr_short_count += 1
            slot = corr_short_count
            r['corr_type']         = 'correlated_short'
            r['corr_slot']         = slot
            r['corr_flagged']      = slot > CORRELATED_SLOT_CAP
            r['corr_hard_blocked'] = slot > SAME_DIR_HARD_CAP
        else:
            indep_count += 1
            r['corr_type']         = 'independent'
            r['corr_slot']         = indep_count
            r['corr_flagged']      = False
            r['corr_hard_blocked'] = False

    total_corr = corr_long_count + corr_short_count
    over_cap   = max(0, corr_long_count - CORRELATED_SLOT_CAP) + \
                 max(0, corr_short_count - CORRELATED_SLOT_CAP)

    portfolio_summary = {
        'btc_regime':        btc_r,
        'total_signals':     len(results),
        'corr_long':         corr_long_count,
        'corr_short':        corr_short_count,
        'independent':       indep_count,
        'corr_slot_cap':     CORRELATED_SLOT_CAP,
        'over_cap':          over_cap,
        'risk_level':        (
            'CRITICAL' if total_corr >= 10 else
            'HIGH'   if over_cap >= 4 or total_corr >= 7 else
            'MEDIUM' if over_cap >= 2 or total_corr >= 4  else
            'LOW'
        ),
        'hard_blocked':      sum(1 for r in results if r.get('corr_hard_blocked')),
    }
    state._last_portfolio_summary = portfolio_summary

    logger.info(
        "Correlation gate: %d corr_long / %d corr_short / %d independent | "
        "%d over cap | risk=%s",
        corr_long_count, corr_short_count, indep_count,
        over_cap, portfolio_summary['risk_level']
    )

    _pre_filter_count = len(results)
    results = [r for r in results if not r.get('corr_flagged')]
    _dropped_corr = _pre_filter_count - len(results)
    if _dropped_corr:
        logger.info(
            "Correlation gate: dropped %d conflicting over-correlated signal(s) "
            "(kept %d optimum)", _dropped_corr, len(results)
        )

    state.last_scan_results = results
    state.last_scan_time    = datetime.now()

    db_save_scan(results)
    for r in results[:20]:
        db_register_outcome(r)

    try:
        from riven_sync import mirror_signals
        mirror_signals(results, state.last_scan_time)
    except Exception as _ce:
        logger.warning("riven_sync mirror skipped: %s", _ce)

    for r in results:
        _register_lifecycle_signal(r)

    if _PAPER_AVAILABLE:
        for r in results:
            try:
                opened = paper_maybe_open(r, db_connect)
                if opened:
                    logger.info("Paper position auto-opened: %s %s (conf %s)",
                                r.get('bias'), r.get('symbol'), r.get('confidence'))
            except Exception as _pe:
                logger.debug("paper_maybe_open error: %s", _pe)

    logger.info("Scan complete — %d signals found", len(results))
    state._scan_durations.append(time.time() - _scan_t0)
    if len(state._scan_durations) > 50:
        state._scan_durations = state._scan_durations[-50:]
    return results


# ── ScanService Delegation ───────────────────────────────────────────────────
_scan_service_instance: Optional[ScanService] = None


def get_scan_service() -> ScanService:
    global _scan_service_instance
    if _scan_service_instance is None:
        _scan_service_instance = ScanService(
            runner=run_full_scan,
            executor=SCAN_EXECUTOR,
            cache_get=lambda: state._scan_cache,
            cache_set=lambda val: setattr(state, '_scan_cache', val),
            cache_lock=_scan_cache_lock,
            ttl_seconds=CACHE_TTL_SECS,
        )
    return _scan_service_instance


async def get_scan_results(force: bool = False) -> Tuple[List[Dict[str, Any]], bool]:
    """Async wrapper that returns cached results or delegates to ScanService."""
    svc = get_scan_service()
    res = await svc.scan(ScanRequest(force=force))
    return res.signals, res.from_cache

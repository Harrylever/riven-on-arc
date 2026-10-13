"""sakz_network.py - Shared HTTP session with retry, backoff, and default timeouts."""
from __future__ import annotations

import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from config import HEADERS

HTTP_RETRIES = int(os.environ.get("SAKZ_HTTP_RETRIES", "3"))
HTTP_BACKOFF = float(os.environ.get("SAKZ_HTTP_BACKOFF", "0.5"))
HTTP_TIMEOUT = int(os.environ.get("SAKZ_HTTP_TIMEOUT", "15"))


def _make_retry() -> Retry:
    common = dict(
        total=HTTP_RETRIES,
        connect=HTTP_RETRIES,
        read=HTTP_RETRIES,
        status=HTTP_RETRIES,
        backoff_factor=HTTP_BACKOFF,
        status_forcelist=(429, 500, 502, 503, 504),
        raise_on_status=False,
    )
    try:
        return Retry(allowed_methods=frozenset(["GET", "POST"]), **common)
    except TypeError:
        return Retry(method_whitelist=frozenset(["GET", "POST"]), **common)


def _build_http_session() -> requests.Session:
    s = requests.Session()
    adapter = HTTPAdapter(max_retries=_make_retry())
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


_HTTP_SESSION = _build_http_session()


def http_get(url: str, **kwargs) -> requests.Response:
    """Drop-in replacement for requests.get with retry/backoff + default timeout."""
    kwargs.setdefault("timeout", HTTP_TIMEOUT)
    return _HTTP_SESSION.get(url, **kwargs)

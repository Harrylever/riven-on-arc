"""signal_types.py - Typed Signal and Scan containers.

score_pair() returns a plain dict. This module adds typed `Signal`, `ScanRequest`,
and `ScanResult` dataclasses plus lossless dict<->dataclass conversions so call
sites can opt into type safety incrementally WITHOUT touching the hot path.
"""
from __future__ import annotations
from dataclasses import dataclass, field, fields
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from sakz_scanner import ScanFailure


@dataclass
class ScanRequest:
    force: bool = False
    timeframe: Optional[str] = None
    symbol: Optional[str] = None
    limit: Optional[int] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScanResult:
    signals: Sequence[Any] = field(default_factory=list)
    from_cache: bool = False
    scanned_at: Optional[datetime] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def as_dicts(self) -> List[Dict[str, Any]]:
        return [
            s if isinstance(s, dict) else (s.to_dict() if hasattr(s, "to_dict") else dict(s))
            for s in self.signals
        ]

    def as_signals(self) -> List[Signal]:
        return [
            s if isinstance(s, Signal) else Signal.from_dict(s)
            for s in self.signals
        ]


@dataclass
class Signal:
    symbol: Optional[str] = None
    exchange: Optional[str] = None
    bias: Optional[str] = None
    score: Optional[float] = None
    confidence: Optional[float] = None
    entry: Optional[float] = None
    stop_loss: Optional[float] = None
    tp1: Optional[float] = None
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    timeframe: Optional[str] = None
    reasons: List[Any] = field(default_factory=list)
    warnings: List[Any] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def declared_fields(cls):
        return [f.name for f in fields(cls) if f.name != "extra"]

    @classmethod
    def from_dict(cls, data):
        data = dict(data or {})
        known = set(cls.declared_fields())
        kwargs = dict((k, data[k]) for k in list(data) if k in known)
        extra = dict((k, v) for k, v in data.items() if k not in known)
        obj = cls(**kwargs)
        obj.extra = extra
        return obj

    def to_dict(self):
        out = dict()
        for name in self.declared_fields():
            out[name] = getattr(self, name)
        out.update(self.extra)
        return out

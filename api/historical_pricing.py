# ==========================================
# Price each deposit / withdrawal at the rate on ITS day (pure — no database / network)
# ==========================================
# Swyftx values every deposit and withdrawal in US dollars at the exchange rate / coin price on the day it happened.
# We used to value ALL of them at today's rate (Australian dollars) and today's price (crypto transfers), which made our
# "Total deposited", "Total withdrawn" and "Result" drift away from Swyftx's own figures. These helpers look the right day up in
# a daily series ({"YYYY-MM-DD": price}) and fall back to today's rate when a day is unknown, so a data problem never loses a record.

from datetime import datetime
from typing import Dict, List, Optional


def day_key(ts) -> Optional[str]:
    """'YYYY-MM-DD' (UTC) from an ISO string, a datetime or epoch seconds/milliseconds."""
    try:
        if isinstance(ts, (int, float)):
            sec = ts / 1000.0 if ts > 1e11 else float(ts)
            return datetime.utcfromtimestamp(sec).strftime("%Y-%m-%d")
        if isinstance(ts, datetime):
            return ts.strftime("%Y-%m-%d")
        s = str(ts or "")
        return s[:10] if len(s) >= 10 and s[4] == "-" and s[7] == "-" else None
    except (ValueError, OverflowError, OSError):
        return None


def rate_on(series: Optional[Dict[str, float]], ts) -> Optional[float]:
    """The value on that day; weekends and holidays use the last earlier day; a day before the series starts uses its first day."""
    if not series:
        return None
    day = day_key(ts)
    if not day:
        return None
    if day in series:
        return series[day]
    earlier = [d for d in series if d <= day]
    if earlier:
        return series[max(earlier)]
    return series[min(series)]


def daily_series(points: List) -> Dict[str, float]:
    """[[epoch_ms, price], ...] -> {day: the last price of that day}."""
    out: Dict[str, float] = {}
    for p in sorted((p for p in points or [] if isinstance(p, (list, tuple)) and len(p) >= 2), key=lambda x: x[0]):
        day = day_key(p[0])
        try:
            if day and float(p[1]) > 0:
                out[day] = float(p[1])
        except (TypeError, ValueError):
            continue
    return out


def fx_series_from_frankfurter(payload: Dict, quote: str = "USD") -> Dict[str, float]:
    """{"rates": {"2026-03-02": {"USD": 0.65}, ...}} -> {day: rate}."""
    out = {}
    for day, row in ((payload or {}).get("rates") or {}).items():
        try:
            if isinstance(row, dict) and float(row.get(quote, 0)) > 0:
                out[day] = float(row[quote])
        except (TypeError, ValueError):
            continue
    return out


def price_amount(raw_amount: float, currency: str, ts, aud_now: float, crypto_now: Dict[str, float],
                 fx_hist: Optional[Dict[str, float]] = None, px_hist: Optional[Dict[str, Dict[str, float]]] = None) -> Optional[float]:
    """USD value of one record on its own day. USDC/USD/USDT = 1:1; AUD at that day's rate; any other coin at that day's price.
    Falls back to today's AUD rate / today's coin price when the day is unknown. None if there is no price at all."""
    if currency in ("USDC", "USD", "USDT"):
        return round(raw_amount, 2)
    if currency == "AUD":
        rate = rate_on(fx_hist, ts) or aud_now
        return round(raw_amount * rate, 2) if rate else None
    if currency:
        price = rate_on((px_hist or {}).get(currency), ts) or (crypto_now or {}).get(currency)
        return round(raw_amount * price, 2) if price else None
    return None

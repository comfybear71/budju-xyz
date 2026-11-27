# ==========================================
# Rebuild "what the account was worth" before it was recorded (pure — no database / network)
# ==========================================
# Nothing recorded the account's worth before Nov 13. Swyftx can tell us what was TRADED and TRANSFERRED, and what each coin cost on each
# day, so we work backwards from what the wallet holds today:
#     holdings on day D  =  holdings now  -  (effect of every order and transfer after D)
#     worth on day D     =  sum of holdings on D  x  that day's prices
# It is an estimate: fees, coins we cannot price, and anything Swyftx does not list make it drift. The caller checks it against the first REAL
# reading and only keeps it when it lands close.
#
# Swyftx order rows: primary_asset = the quote asset, secondary_asset = the coin, order_type 1 = buy / 2 = sell, status 4 = filled,
# `total` = amount of the quote asset, `amount` = amount of the coin, `audValue` = AUD value of the order.

from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple

DAY_MS = 86_400_000
STABLE = ("USDC", "USD", "USDT")
FILLED = 4


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def day_of(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def day_start_ms(day: str) -> int:
    return int(datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)


def parse_orders(rows: Iterable[Dict], asset_map: Dict[str, str], time_of) -> List[Dict]:
    """Filled orders only -> [{ts, coin, quote, coin_qty, quote_qty, buy, aud}], oldest first. `time_of(row)` -> epoch ms."""
    out = []
    for r in rows:
        if int(_f(r.get("status"))) != FILLED:
            continue
        ts = time_of(r)
        coin, quote = asset_map.get(str(r.get("secondary_asset")), ""), asset_map.get(str(r.get("primary_asset")), "")
        coin_qty, quote_qty = _f(r.get("amount")), _f(r.get("total"))
        side = int(_f(r.get("order_type")))
        if not ts or not coin or not quote or side not in (1, 2) or coin_qty <= 0:
            continue
        out.append({"ts": ts, "coin": coin, "quote": quote, "coin_qty": coin_qty, "quote_qty": quote_qty, "buy": side == 1, "aud": _f(r.get("audValue"))})
    out.sort(key=lambda o: o["ts"])
    return out


def order_price_series(orders: List[Dict]) -> Dict[str, Dict[str, float]]:
    """Fallback prices straight from the orders: {coin: {day: AUD price}} (the last trade of each day)."""
    out: Dict[str, Dict[str, float]] = {}
    for o in orders:
        if o["aud"] > 0 and o["coin_qty"] > 0:
            out.setdefault(o["coin"], {})[day_of(o["ts"])] = o["aud"] / o["coin_qty"]
    return out


def nearest(series: Optional[Dict[str, float]], day: str) -> Optional[float]:
    """Value on `day`, else the closest earlier day, else the first day we have (so a coin's first days are not zero)."""
    if not series:
        return None
    if day in series:
        return series[day]
    earlier = [d for d in series if d <= day]
    return series[max(earlier)] if earlier else series[min(series)]


def balances_by_day(holdings_now: Dict[str, float], orders: List[Dict], transfers: List[Dict], first_day: str, last_day: str) -> Dict[str, Dict[str, float]]:
    """{day: {code: qty}} at the END of each day from `last_day` back to `first_day`, by undoing every order / transfer after that moment.
    transfers: [{ts, code, qty}] with qty > 0 for a deposit, < 0 for a withdrawal."""
    events: List[Tuple[int, Dict[str, float]]] = []
    for o in orders:
        d = {o["coin"]: o["coin_qty"] if o["buy"] else -o["coin_qty"]}
        d[o["quote"]] = d.get(o["quote"], 0.0) + (-o["quote_qty"] if o["buy"] else o["quote_qty"])
        events.append((o["ts"], d))
    for t in transfers:
        events.append((t["ts"], {t["code"]: t["qty"]}))
    events.sort(key=lambda e: e[0], reverse=True)          # newest first: each one is undone as we walk back in time

    bal = {c: q for c, q in holdings_now.items()}
    out: Dict[str, Dict[str, float]] = {}
    i = 0
    day = datetime.strptime(last_day, "%Y-%m-%d")
    end = datetime.strptime(first_day, "%Y-%m-%d")
    while day >= end:
        key = day.strftime("%Y-%m-%d")
        cutoff = day_start_ms(key) + DAY_MS                  # end of that day
        while i < len(events) and events[i][0] >= cutoff:
            for c, q in events[i][1].items():
                bal[c] = bal.get(c, 0.0) - q
            i += 1
        out[key] = dict(bal)
        day -= timedelta(days=1)
    return out


def worth_usd(bal: Dict[str, float], day: str, prices: Dict[str, Dict[str, float]], fallback: Dict[str, Dict[str, float]],
              fx: Dict[str, float]) -> Tuple[float, List[str]]:
    """(USD worth that day, coins we could not price). Negative balances (a gap in the history) count as zero."""
    rate = nearest(fx, day) or 0.0
    total, unpriced = 0.0, []
    for code, q in bal.items():
        if q <= 1e-9:
            continue
        if code in STABLE:
            total += q
        elif code == "AUD":
            total += q * rate
        else:
            p = nearest(prices.get(code), day)
            if p is None:
                p = nearest(fallback.get(code), day)
            if p is None:
                unpriced.append(code)
                continue
            total += q * p * rate
    return total, unpriced


def rebuild(holdings_now: Dict[str, float], orders: List[Dict], transfers: List[Dict], prices: Dict[str, Dict[str, float]],
            fx: Dict[str, float], first_real_day: str) -> Dict:
    """Daily worth from the first order / transfer up to the day BEFORE the first real reading.
    -> {"series": {day: usd}, "check": {"day", "estimated"} for the first real day (to compare), "unpriced": [...] }"""
    stamps = [o["ts"] for o in orders] + [t["ts"] for t in transfers]
    if not stamps:
        return {"series": {}, "check": None, "unpriced": []}
    first_day = day_of(min(stamps))
    last_day = first_real_day
    bals = balances_by_day(holdings_now, orders, transfers, first_day, last_day)
    fallback = order_price_series(orders)
    series, missing = {}, set()
    for day, bal in bals.items():
        v, un = worth_usd(bal, day, prices, fallback, fx)
        series[day] = round(v, 2)
        missing.update(un)
    check = {"day": first_real_day, "estimated": series.pop(first_real_day, None)}
    # the day before the first order, worth is zero by construction; start the line at the first day with money in it
    first_money = next((d for d in sorted(series) if series[d] > 1), None)
    if first_money:
        series = {d: v for d, v in series.items() if d >= first_money}
    return {"series": series, "check": check, "unpriced": sorted(missing)}


def close_enough(estimated: Optional[float], real: Optional[float], tolerance: float = 0.12) -> bool:
    """Is the estimate for the first real day within `tolerance` (12%) of what was really recorded?"""
    if not estimated or not real or real <= 0:
        return False
    return abs(estimated - real) / real <= tolerance

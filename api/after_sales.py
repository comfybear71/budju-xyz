# ==========================================
# After-sale tracker (pure): what did the price do AFTER each real sale?
# ==========================================
from datetime import datetime
from typing import Dict, Iterable, List, Optional

HORIZONS = (1, 7, 14, 30)


def _ts(v) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if hasattr(v, "timestamp"):
        return v.timestamp()
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def after_sales(sells: Iterable[Dict], series: Dict[str, List[float]], now_ts: float) -> Dict:
    """sells: [{"coin","qty","price","ts"}]; series: daily closes per coin, last element = today."""
    rows = []
    for s in sells:
        coin, ts = s.get("coin"), _ts(s.get("ts"))
        closes = series.get(coin) or []
        try:
            qty, price = float(s["qty"]), float(s["price"])
        except (TypeError, ValueError, KeyError):
            continue
        if not closes or ts is None or price <= 0 or qty <= 0:
            continue
        days_ago = int((now_ts - ts) // 86400)
        row = {"coin": coin, "ts": ts, "qty": qty, "price": price, "daysAgo": days_ago, "after": {}, "maxAfterPct": None}
        for h in HORIZONS:
            if days_ago >= h and days_ago - h < len(closes):
                row["after"][str(h)] = round(100 * (closes[-1 - (days_ago - h)] / price - 1), 1)
        if 0 <= days_ago < len(closes):
            window = closes[-(days_ago + 1):]
            row["maxAfterPct"] = round(100 * (max(window) / price - 1), 1)
        row["nowPct"] = round(100 * (closes[-1] / price - 1), 1)
        rows.append(row)
    rows.sort(key=lambda r: -r["ts"])

    def agg(items: List[Dict]) -> Dict:
        out = {"sales": len(items)}
        for h in (7, 14):
            vals = [(r["after"][str(h)], r) for r in items if str(h) in r["after"]]
            out[f"n{h}"] = len(vals)
            out[f"avg{h}"] = round(sum(v for v, _ in vals) / len(vals), 1) if vals else None
            out[f"higher{h}"] = sum(1 for v, _ in vals if v > 0)
            out[f"worth{h}"] = round(sum(r["qty"] * r["price"] * v / 100 for v, r in vals), 2) if vals else 0.0
        return out

    by_coin: Dict[str, List[Dict]] = {}
    for r in rows:
        by_coin.setdefault(r["coin"], []).append(r)
    coins = sorted(({"coin": c, **agg(v)} for c, v in by_coin.items()), key=lambda x: -(x.get("worth7") or 0))
    return {"overall": agg(rows), "coins": coins, "recent": rows[:25]}

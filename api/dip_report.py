# ==========================================
# Dip Report — how often each coin dips, and does it come back?
# ==========================================
# Pure functions (no database / network) so they can be tested. Replays a
# year of DAILY closes through the bot's tier rules (buy when price falls
# X% below its anchor, sell each lot when it is Y% above its buy price) and
# reports what would have happened. Daily closes miss intraday wicks, so
# real dips are a little more frequent than shown — treat it as a ranking,
# not a promise.

from typing import Dict, List, Optional

# (tier, buy dip %, sell target %) — mirrors the live tier settings.
TIERS = [(1, 5.0, 12.5), (2, 8.5, 15.0), (3, 15.0, 20.0)]
ANCHOR_DAYS = 14   # reference high used when the bot holds nothing from that tier


def simulate_tier(closes: List[float], dip_pct: float, sell_pct: float) -> Dict:
    lots: List[Dict] = []        # open lots: {"price", "day"}
    buys = sells = 0
    gain_closed = 0.0            # sum of % gain on closed lots
    days_to_sell: List[int] = []
    for i, p in enumerate(closes):
        if p <= 0:
            continue
        # Sell any lot that reached its target.
        keep = []
        for lot in lots:
            if p >= lot["price"] * (1 + sell_pct / 100):
                sells += 1
                gain_closed += sell_pct
                days_to_sell.append(i - lot["day"])
            else:
                keep.append(lot)
        lots = keep
        window = closes[max(0, i - ANCHOR_DAYS):i + 1]
        anchor = min(lots[-1]["price"], max(window)) if lots else max(window)
        if i >= 1 and p <= anchor * (1 - dip_pct / 100):
            lots.append({"price": p, "day": i})
            buys += 1
    last = closes[-1] if closes else 0.0
    open_pl = sum((last / l["price"] - 1) * 100 for l in lots) if last else 0.0
    return {
        "buys": buys, "sells": sells, "open": len(lots),
        "avgDaysToSell": round(sum(days_to_sell) / len(days_to_sell), 1) if days_to_sell else None,
        "netPct": round(gain_closed + open_pl, 1),   # equal-size lots, closed gains + open marks
        "openPct": round(open_pl, 1),
    }


def coin_report(closes: List[float]) -> Optional[Dict]:
    closes = [c for c in closes if c and c > 0]
    if len(closes) < 60:
        return None
    # Max drawdown expressed as a fall from peak
    max_dd = 0.0
    peak = closes[0]
    for c in closes:
        peak = max(peak, c)
        max_dd = max(max_dd, (1 - c / peak) * 100)
    tiers = {f"t{t}": simulate_tier(closes, d, s) for t, d, s in TIERS}
    net = sum(v["netPct"] for v in tiers.values())
    buys = sum(v["buys"] for v in tiers.values())
    sells = sum(v["sells"] for v in tiers.values())
    return {
        "days": len(closes),
        "tiers": tiers,
        "buys": buys,
        "sells": sells,
        "netPct": round(net, 1),
        "change1y": round((closes[-1] / closes[0] - 1) * 100, 1),
        "maxDrawdown": round(max_dd, 1),
        "fromHigh": round((1 - closes[-1] / max(closes)) * 100, 1),
    }


def suggest(rep: Dict) -> str:
    t = rep["tiers"]
    if rep["buys"] == 0:
        return "Quiet — rarely dips"
    stuck = sum(v["open"] for v in t.values())
    if rep["change1y"] <= -60 or (stuck >= 3 and rep["netPct"] < 0):
        return "Careful — dips often don't come back"
    parts = [f"T{n}" for n, k in ((1, "t1"), (2, "t2"), (3, "t3")) if t[k]["buys"] >= 1 and t[k]["sells"] >= 1]
    return ("Use " + "+".join(parts)) if parts else "Dips but slow to recover"


def build_report(series: Dict[str, List[float]], denylist=None) -> Dict:
    deny = set(denylist or [])
    coins: List[Dict] = []
    for sym, closes in series.items():
        rep = coin_report(closes)
        if not rep:
            continue
        rep["coin"] = sym
        rep["advice"] = suggest(rep)
        rep["denied"] = sym in deny
        coins.append(rep)
    coins.sort(key=lambda r: r["netPct"], reverse=True)
    rank = 0
    for r in coins:
        if r["denied"] or r["advice"].startswith(("Careful", "Quiet")):
            r["focus"] = False
        else:
            rank += 1
            r["focus"] = rank <= 15
    return {"coins": coins}

# ==========================================
# Strategy Lab — replay the bot's dip-buy / take-profit rules on a year of DAILY prices (pure)
# ==========================================
# One coin, $1,000 starting cash, three tiers sharing one cash pool and one position, like the live bot:
#   buy   when price <= buy target: spend `alloc`% of cash; then buy target = price*(1-dev), sell target = max(old, price*(1+sellDev))
#   sell  when price >= sell target: sell alloc%*0.833 of the position (never below average cost); both targets reset
# Variants change ONLY how/when the sell happens. Daily closes miss intraday moves, so use this to RANK ideas,
# not to predict results. Fees are charged on every buy and sell.

import statistics
from typing import Dict, List, Optional

SELL_RATIO = 0.833
START_CASH = 1000.0
MIN_ORDER = 8.0

CURRENT_TIERS = [  # (dev %, sell dev %, allocation %, cooldown days)
    (5.0, 12.5, 5.0, 1), (8.5, 15.0, 10.0, 1), (15.0, 20.0, 15.0, 1),
]

VARIANTS = {
    "current": {"label": "Current (+12.5 / +15 / +20)", "sell_mult": 1.0, "mode": "fixed"},
    "wider": {"label": "Wider sells (+20 / +25 / +30)", "sells": [20.0, 25.0, 30.0], "mode": "fixed"},
    "trail5": {"label": "Trailing: sell on a 5% pullback", "mode": "trail", "trail": 0.05},
    "trail8": {"label": "Trailing: sell on an 8% pullback", "mode": "trail", "trail": 0.08},
    "uptrend": {"label": "Hold winners: no sells in an uptrend", "mode": "uptrend"},
    "vol": {"label": "Volatility-scaled bands", "mode": "fixed", "vol_scale": True},
}


def _sma(closes: List[float], i: int, n: int) -> Optional[float]:
    if i + 1 < n:
        return None
    w = closes[i + 1 - n:i + 1]
    return sum(w) / n


def daily_vol(closes: List[float]) -> float:
    rets = [closes[i] / closes[i - 1] - 1 for i in range(1, len(closes)) if closes[i - 1] > 0]
    return statistics.pstdev(rets) if len(rets) > 5 else 0.0


def simulate(closes: List[float], variant: Dict, fee: float = 0.005, vol_ratio: float = 1.0) -> Dict:
    tiers_cfg = []
    for idx, (dev, sdev, alloc, cd) in enumerate(CURRENT_TIERS):
        if variant.get("sells"):
            sdev = variant["sells"][idx]
        if variant.get("vol_scale"):
            scale = min(2.0, max(0.5, vol_ratio))
            dev, sdev = dev * scale, sdev * scale
        tiers_cfg.append({"dev": dev / 100, "sdev": sdev / 100, "alloc": alloc / 100, "cd": cd})

    cash, qty, cost = START_CASH, 0.0, 0.0
    buys = sells = 0
    fees = 0.0
    p0 = closes[0]
    tiers = [{"buy": p0 * (1 - t["dev"]), "sell": p0 * (1 + t["sdev"]), "cool": 0, "armed": False, "high": 0.0} for t in tiers_cfg]
    mode = variant.get("mode", "fixed")

    for i in range(1, len(closes)):
        p = closes[i]
        if p <= 0:
            continue
        avg = cost / qty if qty > 1e-12 else 0.0
        sma50 = _sma(closes, i, 50)
        sma50_prev = _sma(closes, i - 5, 50) if i >= 5 else None
        uptrend = bool(sma50 and sma50_prev and p > sma50 and sma50 > sma50_prev)

        for t, cfg in zip(tiers, tiers_cfg):
            if i < t["cool"]:
                continue
            if p <= t["buy"]:
                amount = cfg["alloc"] * cash
                if amount >= MIN_ORDER and cash - amount >= 0:
                    got = amount * (1 - fee) / p
                    cash -= amount
                    qty += got
                    cost += amount
                    fees += amount * fee
                    buys += 1
                    t["buy"] = p * (1 - cfg["dev"])
                    t["sell"] = max(t["sell"], p * (1 + cfg["sdev"]))
                    t["cool"] = i + cfg["cd"]
                    t["armed"] = False
                    avg = cost / qty
                continue
            if p >= t["sell"] or t["armed"]:
                ready = False
                if mode == "fixed":
                    ready = p >= t["sell"]
                elif mode == "uptrend":
                    ready = p >= t["sell"] and not uptrend
                elif mode == "trail":
                    if p >= t["sell"]:
                        t["armed"] = True
                    if t["armed"]:
                        t["high"] = max(t["high"], p)
                        ready = p <= t["high"] * (1 - variant["trail"])
                if ready and qty > 1e-12 and p >= avg:
                    sell_qty = min(qty, qty * cfg["alloc"] * SELL_RATIO)
                    proceeds = sell_qty * p
                    if proceeds >= MIN_ORDER:
                        cash += proceeds * (1 - fee)
                        fees += proceeds * fee
                        cost -= avg * sell_qty
                        qty -= sell_qty
                        sells += 1
                        t["buy"] = p * (1 - cfg["dev"])
                        t["sell"] = p * (1 + cfg["sdev"])
                        t["cool"] = i + cfg["cd"]
                        t["armed"], t["high"] = False, 0.0
                        avg = cost / qty if qty > 1e-12 else 0.0

    final = cash + qty * closes[-1]
    hold = START_CASH * (1 - fee) * closes[-1] / p0
    return {"final": final, "ret": final / START_CASH - 1, "holdRet": hold / START_CASH - 1, "buys": buys, "sells": sells, "fees": fees,
            "cashPct": cash / final if final else 0.0}


def run_lab(series: Dict[str, List[float]], fee: float = 0.005, min_days: int = 200) -> Dict:
    """Every variant on every coin, over the whole year and each half separately."""
    usable = {c: s for c, s in series.items() if len(s) >= min_days}
    vols = {c: daily_vol(s) for c, s in usable.items()}
    med_vol = statistics.median([v for v in vols.values() if v > 0]) if any(v > 0 for v in vols.values()) else 0.0
    out_variants = {}
    per_coin_best: Dict[str, Dict] = {}
    for key, var in VARIANTS.items():
        full, h1, h2, hold = [], [], [], []
        beat = 0
        trades = 0
        for coin, s in usable.items():
            vr = (vols[coin] / med_vol) if med_vol and vols[coin] else 1.0
            r = simulate(s, var, fee, vr)
            mid = len(s) // 2
            full.append(r["ret"])
            hold.append(r["holdRet"])
            h1.append(simulate(s[:mid], var, fee, vr)["ret"])
            h2.append(simulate(s[mid:], var, fee, vr)["ret"])
            beat += 1 if r["ret"] > r["holdRet"] else 0
            trades += r["buys"] + r["sells"]
            best = per_coin_best.get(coin)
            if best is None or r["ret"] > best["ret"]:
                per_coin_best[coin] = {"variant": key, "ret": r["ret"]}
        n = len(usable) or 1
        out_variants[key] = {
            "label": var["label"], "avgRet": round(100 * sum(full) / n, 2), "medianRet": round(100 * statistics.median(full), 2) if full else 0.0,
            "avgH1": round(100 * sum(h1) / n, 2), "avgH2": round(100 * sum(h2) / n, 2),
            "avgHold": round(100 * sum(hold) / n, 2), "beatHold": beat, "avgTrades": round(trades / n, 1),
        }
    wins: Dict[str, int] = {}
    for v in per_coin_best.values():
        wins[v["variant"]] = wins.get(v["variant"], 0) + 1
    return {"coins": len(usable), "fee": fee, "variants": out_variants, "bestByCoin": {c: v["variant"] for c, v in per_coin_best.items()},
            "bestCounts": wins, "skipped": sorted(set(series) - set(usable))}

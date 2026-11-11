# ==========================================
# Accumulation Lab (v1) — "which setup gathers the most coins?" (pure — no database / network)
# ==========================================
# The goal is MORE COINS over many years while users keep topping up cash (AUD -> USDC), so every test here
#   * adds a weekly top-up per coin (default $25) on top of the starting cash, and
#   * is scored in COINS held, against the simplest alternative: spend every top-up on the coin the day it arrives (weekly buying).
# One coin at a time, three tiers sharing one cash pool and one position, like the live bot:
#   buy  when price <= buy target: spend `alloc`% of the cash on hand; then buy target = price*(1-dev), sell target = max(old, price*(1+sellDev))
#   sell when the sell rule fires: sell alloc%*0.833 of the position (never below average cost); both targets reset
# Each scenario changes ONE thing from today's setup, so a difference can be put down to that one change.
# Daily closes miss intraday moves and a year is one market: use it to RANK ideas, not to predict results.

import statistics
from typing import Dict, List, Optional

SELL_RATIO = 0.833
MIN_ORDER = 8.0
START_CASH = 1000.0
WEEK = 7

TODAY = [(5.0, 12.5, 5.0, 1), (8.5, 15.0, 10.0, 1), (15.0, 20.0, 15.0, 1)]   # (buy dev %, sell dev %, allocation %, cooldown days)


def _tiers(devs=None, sells=None, allocs=None, keep=None):
    out = []
    for i, (d, s, a, c) in enumerate(TODAY):
        if keep is not None and i not in keep:
            continue
        out.append((devs[i] if devs else d, sells[i] if sells else s, allocs[i] if allocs else a, c))
    return out


SCENARIOS = {
    "today": {"group": "baseline", "label": "Today's setup", "tiers": _tiers(), "sell": "fixed", "base": 0.0},
    # --- selling ---
    "sell_wide": {"group": "selling", "label": "Sell higher (+20 / +25 / +30%)", "tiers": _tiers(sells=[20, 25, 30]), "sell": "fixed", "base": 0.0},
    "sell_pump": {"group": "selling", "label": "Only sell big pumps (+60 / +80 / +100%)", "tiers": _tiers(sells=[60, 80, 100]), "sell": "fixed", "base": 0.0},
    "sell_trail5": {"group": "selling", "label": "Trailing sell (5% pullback)", "tiers": _tiers(), "sell": "trail", "trail": 0.05, "base": 0.0},
    "sell_never": {"group": "selling", "label": "Never sell", "tiers": _tiers(), "sell": "never", "base": 0.0},
    # --- how many tiers / how deep ---
    "tier_t1": {"group": "tiers", "label": "Only Tier 1 (-5%)", "tiers": _tiers(keep=[0]), "sell": "fixed", "base": 0.0},
    "tier_t13": {"group": "tiers", "label": "Tier 1 + Tier 3 (no middle)", "tiers": _tiers(keep=[0, 2]), "sell": "fixed", "base": 0.0},
    "tier_wide": {"group": "tiers", "label": "Buy deeper dips (-7 / -12 / -20%)", "tiers": _tiers(devs=[7, 12, 20]), "sell": "fixed", "base": 0.0},
    "tier_tight": {"group": "tiers", "label": "Buy smaller dips (-3 / -6 / -12%)", "tiers": _tiers(devs=[3, 6, 12]), "sell": "fixed", "base": 0.0},
    # --- how much per dip ---
    "alloc_small": {"group": "size", "label": "Smaller buys (3 / 6 / 10% of cash)", "tiers": _tiers(allocs=[3, 6, 10]), "sell": "fixed", "base": 0.0},
    "alloc_big": {"group": "size", "label": "Bigger buys (10 / 15 / 25% of cash)", "tiers": _tiers(allocs=[10, 15, 25]), "sell": "fixed", "base": 0.0},
    # --- always buying a bit ---
    "base25": {"group": "base", "label": "Buy 25% of each top-up straight away", "tiers": _tiers(), "sell": "fixed", "base": 0.25},
    "base50": {"group": "base", "label": "Buy 50% of each top-up straight away", "tiers": _tiers(), "sell": "fixed", "base": 0.50},
}

GROUPS = [("baseline", "Where we are"), ("selling", "When to sell"), ("tiers", "How many tiers / how deep"), ("size", "How much per dip"), ("base", "Always buying a little")]


def simulate(closes: List[float], sc: Dict, weekly: float = 25.0, fee: float = 0.005, start_cash: float = START_CASH) -> Optional[Dict]:
    if len(closes) < 30 or closes[0] <= 0:
        return None
    tcfg = [{"dev": d / 100, "sdev": s / 100, "alloc": a / 100, "cd": c} for d, s, a, c in sc["tiers"]]
    base = sc.get("base", 0.0)
    mode = sc.get("sell", "fixed")
    p0 = closes[0]
    tiers = [{"buy": p0 * (1 - t["dev"]), "sell": p0 * (1 + t["sdev"]), "cool": 0, "armed": False, "high": 0.0} for t in tcfg]
    cash = qty = cost = 0.0
    deposited = 0.0
    dca_qty = 0.0
    buys = sells = 0
    idle_sum = 0.0
    days = 0

    def deposit(amount: float, p: float):
        nonlocal cash, qty, cost, deposited, dca_qty
        deposited += amount
        dca_qty += amount * (1 - fee) / p
        put = amount * base
        if put >= MIN_ORDER:
            qty += put * (1 - fee) / p
            cost += put
            cash += amount - put
        else:
            cash += amount

    deposit(start_cash, p0)
    for i in range(1, len(closes)):
        p = closes[i]
        if p <= 0:
            continue
        if i % WEEK == 0:
            deposit(weekly, p)
        avg = cost / qty if qty > 1e-12 else 0.0
        for t, cfg in zip(tiers, tcfg):
            if i < t["cool"]:
                continue
            if p <= t["buy"]:
                amount = cfg["alloc"] * cash
                if amount >= MIN_ORDER:
                    cash -= amount
                    qty += amount * (1 - fee) / p
                    cost += amount
                    buys += 1
                    t["buy"] = p * (1 - cfg["dev"])
                    t["sell"] = max(t["sell"], p * (1 + cfg["sdev"]))
                    t["cool"] = i + cfg["cd"]
                    t["armed"] = False
                    avg = cost / qty
                continue
            if mode == "never":
                continue
            ready = False
            if mode == "fixed":
                ready = p >= t["sell"]
            elif mode == "trail":
                if p >= t["sell"]:
                    t["armed"] = True
                if t["armed"]:
                    t["high"] = max(t["high"], p)
                    ready = p <= t["high"] * (1 - sc["trail"])
            if ready and qty > 1e-12 and p >= avg:
                sq = min(qty, qty * cfg["alloc"] * SELL_RATIO)
                proceeds = sq * p
                if proceeds >= MIN_ORDER:
                    cash += proceeds * (1 - fee)
                    cost -= avg * sq
                    qty -= sq
                    sells += 1
                    t["buy"] = p * (1 - cfg["dev"])
                    t["sell"] = p * (1 + cfg["sdev"])
                    t["cool"] = i + cfg["cd"]
                    t["armed"], t["high"] = False, 0.0
                    avg = cost / qty if qty > 1e-12 else 0.0
        value = cash + qty * p
        idle_sum += cash / value if value > 0 else 0.0
        days += 1

    pe = closes[-1]
    final = cash + qty * pe
    dca_final = dca_qty * pe
    if dca_qty <= 1e-12 or deposited <= 0:
        return None
    return {
        "qty": qty, "dcaQty": dca_qty, "qtyVsDca": qty / dca_qty - 1,
        "ret": final / deposited - 1, "dcaRet": dca_final / deposited - 1,
        "costPerCoin": (deposited - cash) / qty if qty > 1e-12 else None, "dcaCostPerCoin": deposited / dca_qty,
        "idlePct": idle_sum / days if days else 0.0, "trades": buys + sells,
    }


def _avg(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def run_lab(series: Dict[str, List[float]], weekly: float = 25.0, fee: float = 0.005, min_days: int = 200) -> Dict:
    usable = {c: s for c, s in series.items() if len(s) >= min_days}
    out: Dict[str, Dict] = {}
    for key, sc in SCENARIOS.items():
        full, h1, h2, ret, dret, idle, trades, cost_ratio = [], [], [], [], [], [], [], []
        beat = 0
        for coin, s in usable.items():
            r = simulate(s, sc, weekly, fee)
            if r is None:
                continue
            mid = len(s) // 2
            a, b = simulate(s[:mid], sc, weekly, fee), simulate(s[mid:], sc, weekly, fee)
            full.append(r["qtyVsDca"])
            if a:
                h1.append(a["qtyVsDca"])
            if b:
                h2.append(b["qtyVsDca"])
            ret.append(r["ret"])
            dret.append(r["dcaRet"])
            idle.append(r["idlePct"])
            trades.append(r["trades"])
            if r["costPerCoin"] is not None:
                cost_ratio.append(r["costPerCoin"] / r["dcaCostPerCoin"] - 1)
            beat += 1 if r["qtyVsDca"] > 0 else 0
        n = len(full)
        out[key] = {
            "group": sc["group"], "label": sc["label"], "coinsTested": n,
            "coinsVsDca": round(100 * _avg(full), 2), "medianCoinsVsDca": round(100 * statistics.median(full), 2) if full else 0.0,
            "h1": round(100 * _avg(h1), 2), "h2": round(100 * _avg(h2), 2),
            "beatDca": beat, "ret": round(100 * _avg(ret), 2), "dcaRet": round(100 * _avg(dret), 2),
            "costVsDca": round(100 * _avg(cost_ratio), 2), "idlePct": round(100 * _avg(idle), 1), "avgTrades": round(_avg(trades), 1),
        }
    return {"coins": len(usable), "weekly": weekly, "fee": fee, "scenarios": out, "groups": GROUPS, "verdict": verdict(out)}


def verdict(sc: Dict[str, Dict]) -> Dict:
    """Plain-English reading: what beat today's setup in BOTH halves of the year, by enough to matter."""
    base = sc.get("today")
    if not base or not base["coinsTested"]:
        return {"text": "Not enough price history to test yet.", "winners": []}
    winners = []
    for k, v in sc.items():
        if k == "today":
            continue
        gain = v["coinsVsDca"] - base["coinsVsDca"]
        if gain >= 3.0 and v["h1"] > base["h1"] and v["h2"] > base["h2"]:
            winners.append({"key": k, "label": v["label"], "gainPts": round(gain, 1)})
    winners.sort(key=lambda w: -w["gainPts"])
    losing_to_dca = base["coinsVsDca"] < 0
    parts = [f"Today's setup ends with {abs(base['coinsVsDca']):.1f}% {'more' if base['coinsVsDca'] >= 0 else 'fewer'} coins than simply buying every top-up straight away."]
    if winners:
        parts.append("Beat it in BOTH halves of the year by 3+ points: " + "; ".join(f"{w['label']} ({w['gainPts']:+.1f})" for w in winners[:3]) + ".")
    else:
        parts.append("No single change beat it in both halves by a clear margin — so there is no proven reason to change anything yet.")
    if losing_to_dca:
        parts.append("Waiting for dips cost coins versus buying straight away, because cash sat idle while prices rose.")
    return {"text": " ".join(parts), "winners": winners}

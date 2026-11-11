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


def simulate(closes: List[float], sc: Dict, weekly: float = 25.0, fee: float = 0.005, start_cash: float = START_CASH, trace: bool = False) -> Optional[Dict]:
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
    events: List[List] = []
    equity: List[float] = []
    dca_equity: List[float] = []
    avg_line: List[float] = []

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
                    if trace:
                        events.append([i, "buy", round(p, 8)])
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
                    if trace:
                        events.append([i, "sell", round(p, 8)])
                    t["buy"] = p * (1 - cfg["dev"])
                    t["sell"] = p * (1 + cfg["sdev"])
                    t["cool"] = i + cfg["cd"]
                    t["armed"], t["high"] = False, 0.0
                    avg = cost / qty if qty > 1e-12 else 0.0
        value = cash + qty * p
        idle_sum += cash / value if value > 0 else 0.0
        days += 1
        if trace:
            equity.append(round(value, 2))
            dca_equity.append(round(dca_qty * p, 2))
            avg_line.append(round(cost / qty, 8) if qty > 1e-12 else 0.0)

    pe = closes[-1]
    final = cash + qty * pe
    dca_final = dca_qty * pe
    if dca_qty <= 1e-12 or deposited <= 0:
        return None
    extra = {"trace": {"events": events, "equity": equity, "dcaEquity": dca_equity, "avgCost": avg_line}} if trace else {}
    return {
        **extra,
        "qty": qty, "dcaQty": dca_qty, "qtyVsDca": qty / dca_qty - 1,
        "ret": final / deposited - 1, "dcaRet": dca_final / deposited - 1,
        "costPerCoin": (deposited - cash) / qty if qty > 1e-12 else None, "dcaCostPerCoin": deposited / dca_qty,
        "idlePct": idle_sum / days if days else 0.0, "trades": buys + sells,
    }


def _avg(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def run_lab(series: Dict[str, List[float]], weekly: float = 25.0, fee: float = 0.005, min_days: int = 200, start: float = START_CASH) -> Dict:
    usable = {c: s for c, s in series.items() if len(s) >= min_days}
    out: Dict[str, Dict] = {}
    for key, sc in SCENARIOS.items():
        full, h1, h2, ret, dret, idle, trades, cost_ratio = [], [], [], [], [], [], [], []
        beat = 0
        for coin, s in usable.items():
            r = simulate(s, sc, weekly, fee, start)
            if r is None:
                continue
            mid = len(s) // 2
            a, b = simulate(s[:mid], sc, weekly, fee, start), simulate(s[mid:], sc, weekly, fee, start)
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


def clamp(v, lo, hi, default):
    try:
        return min(hi, max(lo, float(v)))
    except (TypeError, ValueError):
        return default


def build_scenario(params: Dict) -> Dict:
    """Turn the Lab's sliders into a scenario. tiers: [[dip %, sell +%, spend % of cash, cooldown days], ...] (any 1-3 of them)."""
    tiers = []
    for t in (params.get("tiers") or [])[:3]:
        try:
            tiers.append((clamp(t[0], 1, 40, 5), clamp(t[1], 2, 300, 12.5), clamp(t[2], 1, 60, 5), int(clamp(t[3] if len(t) > 3 else 1, 0, 14, 1))))
        except (TypeError, IndexError):
            continue
    mode = params.get("sell") if params.get("sell") in ("fixed", "trail", "never") else "fixed"
    return {"group": "custom", "label": "Your setup", "tiers": tiers, "sell": mode, "trail": clamp(params.get("trail"), 1, 30, 5) / 100,
            "base": clamp(params.get("base"), 0, 100, 0) / 100}


def run_custom(series: Dict[str, List[float]], params: Dict, coin: str = "ALL") -> Dict:
    """Your own setup: ALL coins averaged, or one coin with its trades and account-value line for the chart."""
    weekly = clamp(params.get("weekly"), 0, 1000, 25)
    fee = clamp(params.get("fee"), 0, 3, 0.5) / 100
    start = clamp(params.get("start"), 0, 1_000_000, START_CASH)
    sc = build_scenario(params)
    usable = {c: s for c, s in series.items() if len(s) >= 200}
    if not sc["tiers"] and sc["base"] <= 0:
        return {"error": "Switch on at least one tier or some base buying.", "coins": sorted(usable)}
    out: Dict = {"coins": sorted(usable), "scenario": {"tiers": sc["tiers"], "sell": sc["sell"], "trail": sc["trail"], "base": sc["base"]}}
    if coin != "ALL" and coin in usable:
        r = simulate(usable[coin], sc, weekly, fee, start, trace=True)
        if r is None:
            return {**out, "error": "Not enough history for that coin."}
        r["coin"] = coin
        r["prices"] = [round(x, 8) for x in usable[coin]]
        r["days"] = len(usable[coin])
        out["single"] = r
        return out
    full, h1, h2, idle, trades, cost_ratio, ret, dret = [], [], [], [], [], [], [], []
    beat = 0
    for c, s in usable.items():
        r = simulate(s, sc, weekly, fee, start)
        if r is None:
            continue
        mid = len(s) // 2
        a, b = simulate(s[:mid], sc, weekly, fee, start), simulate(s[mid:], sc, weekly, fee, start)
        full.append(r["qtyVsDca"])
        if a:
            h1.append(a["qtyVsDca"])
        if b:
            h2.append(b["qtyVsDca"])
        idle.append(r["idlePct"]); trades.append(r["trades"]); ret.append(r["ret"]); dret.append(r["dcaRet"])
        if r["costPerCoin"] is not None:
            cost_ratio.append(r["costPerCoin"] / r["dcaCostPerCoin"] - 1)
        beat += 1 if r["qtyVsDca"] > 0 else 0
    out["all"] = {"coinsTested": len(full), "coinsVsDca": round(100 * _avg(full), 2), "h1": round(100 * _avg(h1), 2), "h2": round(100 * _avg(h2), 2),
                  "beatDca": beat, "costVsDca": round(100 * _avg(cost_ratio), 2), "idlePct": round(100 * _avg(idle), 1),
                  "avgTrades": round(_avg(trades), 1), "ret": round(100 * _avg(ret), 2), "dcaRet": round(100 * _avg(dret), 2)}
    return out


# ==========================================
# Paper trial — the whole account at once (ONE shared cash pool, every coin), forward from a start date
# ==========================================
# Three virtual accounts get the same cash on the same days:
#   bot    = today's rules (dip tiers, sells refill the cash pool)
#   hybrid = half of every top-up is spread over the coins at once, the rest waits for dips; bigger dip buys
#   hold   = every top-up spread over the coins at once and kept (the benchmark the bot must beat)
# Nothing live is touched. Daily closes only, so read it as a ranking.

TRIAL_ARMS = {
    "bot": {"label": "Today's bot", "tiers": TODAY, "base": 0.0, "sell": "fixed"},
    "hybrid": {"label": "Hybrid (half bought at once + bigger dips)", "tiers": [(5.0, 12.5, 10.0, 1), (8.5, 15.0, 15.0, 1), (15.0, 20.0, 25.0, 1)], "base": 0.5, "sell": "fixed"},
    "hold": {"label": "Just hold (buy everything as the money arrives)", "tiers": [], "base": 1.0, "sell": "never"},
}
TRIAL_DAYS = 90


def portfolio_simulate(series: Dict[str, List[float]], days: int, arm: Dict, start_cash: float, topup: float, topup_every: int = 30, fee: float = 0.005) -> Dict:
    coins = sorted(c for c, s in series.items() if len(s) >= days + 1 and all(v > 0 for v in s[-(days + 1):]))
    if not coins or days < 1:
        return {"error": "not enough price history"}
    px = {c: series[c][-(days + 1):] for c in coins}
    n = len(coins)
    tcfg = [{"dev": d / 100, "sdev": s / 100, "alloc": a / 100, "cd": cd} for d, s, a, cd in arm["tiers"]]
    base, mode = arm.get("base", 0.0), arm.get("sell", "fixed")
    cash = 0.0
    deposited = 0.0
    qty = {c: 0.0 for c in coins}
    cost = {c: 0.0 for c in coins}
    tiers = {c: [{"buy": px[c][0] * (1 - t["dev"]), "sell": px[c][0] * (1 + t["sdev"]), "cool": 0} for t in tcfg] for c in coins}
    trades = 0
    equity: List[float] = []

    def deposit(amount: float, i: int):
        nonlocal cash, deposited
        deposited += amount
        put = amount * base
        each = put / n
        if each >= 1.0:
            for c in coins:
                qty[c] += each * (1 - fee) / px[c][i]
                cost[c] += each
            cash += amount - put
        else:
            cash += amount

    deposit(start_cash, 0)
    for i in range(0, days + 1):
        if i > 0 and i % topup_every == 0:
            deposit(topup, i)
        if i > 0:
            for c in coins:
                p = px[c][i]
                for t, cfg in zip(tiers[c], tcfg):
                    if i < t["cool"]:
                        continue
                    avg = cost[c] / qty[c] if qty[c] > 1e-12 else 0.0
                    if p <= t["buy"]:
                        amount = cfg["alloc"] * cash
                        if amount >= MIN_ORDER:
                            cash -= amount
                            qty[c] += amount * (1 - fee) / p
                            cost[c] += amount
                            trades += 1
                            t["buy"] = p * (1 - cfg["dev"])
                            t["sell"] = max(t["sell"], p * (1 + cfg["sdev"]))
                            t["cool"] = i + cfg["cd"]
                        continue
                    if mode != "never" and p >= t["sell"] and qty[c] > 1e-12 and p >= avg:
                        sq = min(qty[c], qty[c] * cfg["alloc"] * SELL_RATIO)
                        proceeds = sq * p
                        if proceeds >= MIN_ORDER:
                            cash += proceeds * (1 - fee)
                            cost[c] -= avg * sq
                            qty[c] -= sq
                            trades += 1
                            t["buy"] = p * (1 - cfg["dev"])
                            t["sell"] = p * (1 + cfg["sdev"])
                            t["cool"] = i + cfg["cd"]
        equity.append(round(cash + sum(qty[c] * px[c][i] for c in coins), 2))
    value = equity[-1]
    return {"value": value, "deposited": deposited, "ret": value / deposited - 1 if deposited else 0.0, "cashPct": cash / value if value else 0.0,
            "trades": trades, "equity": equity, "qty": qty, "coins": coins}


def run_trial(series: Dict[str, List[float]], days: int, start_cash: float = 10000.0, topup: float = 1000.0, topup_every: int = 30, fee: float = 0.005) -> Dict:
    days = max(1, min(365, int(days)))
    res = {k: portfolio_simulate(series, days, arm, start_cash, topup, topup_every, fee) for k, arm in TRIAL_ARMS.items()}
    if any("error" in r for r in res.values()):
        return {"error": "Not enough price history yet.", "days": days}
    hold = res["hold"]
    arms = {}
    for k, r in res.items():
        ratios = [r["qty"][c] / hold["qty"][c] - 1 for c in r["coins"] if hold["qty"].get(c, 0) > 1e-12]
        arms[k] = {"label": TRIAL_ARMS[k]["label"], "value": round(r["value"], 2), "deposited": round(r["deposited"], 2),
                   "valueVsHold": round(100 * (r["value"] / hold["value"] - 1), 2) if hold["value"] else 0.0,
                   "coinsVsHold": round(100 * _avg(ratios), 2), "cashPct": round(100 * r["cashPct"], 1), "trades": r["trades"], "equity": r["equity"]}
    return {"days": days, "coins": len(hold["coins"]), "arms": arms, "verdict": trial_verdict(arms, days)}


def trial_verdict(arms: Dict[str, Dict], days: int) -> str:
    if days < 14:
        return f"Day {days} — far too early to read anything. Check back in a few weeks."
    bot, hyb = arms["bot"], arms["hybrid"]
    lead = max((("Today's bot", bot), ("Hybrid", hyb)), key=lambda x: x[1]["coinsVsHold"])
    word = "more" if lead[1]["coinsVsHold"] >= 0 else "fewer"
    text = f"After {days} days the best of the two dip setups holds {abs(lead[1]['coinsVsHold']):.1f}% {word} coins than just holding ({lead[0]})."
    if days < TRIAL_DAYS:
        text += f" The pass mark is read at day {TRIAL_DAYS}; until then this can still swing either way."
    elif lead[1]["coinsVsHold"] < 0:
        text += " Neither beat simply holding — time to rethink the dip rules, or hold more of each top-up straight away."
    else:
        text += " That beats just holding on coins — worth trialling with real money in a small slice."
    return text


# ==========================================
# Find the best setup — try a grid of combinations on every coin and rank them
# ==========================================
def _grid():
    for base in (0.0, 0.25, 0.5, 0.75):
        for dip_scale in (0.6, 1.0, 1.5):
            for alloc_scale in (1, 2, 3):
                for sell, sell_scale in (("fixed", 1.0), ("fixed", 2.0), ("never", 1.0), ("trail", 1.0)):
                    yield base, dip_scale, alloc_scale, sell, sell_scale


def _grid_setup(base, dip_scale, alloc_scale, sell, sell_scale):
    tiers = [(round(d * dip_scale, 1), round(s * sell_scale, 1), min(40.0, a * alloc_scale), c) for d, s, a, c in TODAY]
    return {"group": "search", "label": "", "tiers": tiers, "sell": sell, "trail": 0.05, "base": base}


def _score(series, sc, weekly, fee, start, halves=False):
    full, h1, h2, idle, cost = [], [], [], [], []
    for s in series.values():
        r = simulate(s, sc, weekly, fee, start)
        if r is None:
            continue
        full.append(r["qtyVsDca"])
        idle.append(r["idlePct"])
        if r["costPerCoin"] is not None:
            cost.append(r["costPerCoin"] / r["dcaCostPerCoin"] - 1)
        if halves:
            mid = len(s) // 2
            a, b = simulate(s[:mid], sc, weekly, fee, start), simulate(s[mid:], sc, weekly, fee, start)
            if a:
                h1.append(a["qtyVsDca"])
            if b:
                h2.append(b["qtyVsDca"])
    return {"coinsVsDca": round(100 * _avg(full), 2), "h1": round(100 * _avg(h1), 2), "h2": round(100 * _avg(h2), 2),
            "idlePct": round(100 * _avg(idle), 1), "costVsDca": round(100 * _avg(cost), 2)}


def search_best(series: Dict[str, List[float]], weekly: float = 25.0, fee: float = 0.005, start: float = START_CASH, top: int = 8) -> Dict:
    usable = {c: s for c, s in series.items() if len(s) >= 200}
    if not usable:
        return {"error": "Not enough price history yet."}
    first = []
    for combo in _grid():
        sc = _grid_setup(*combo)
        first.append((_score(usable, sc, weekly, fee, start)["coinsVsDca"], combo))
    first.sort(key=lambda x: -x[0])
    rows = []
    for _, combo in first[:max(top * 2, 12)]:
        sc = _grid_setup(*combo)
        res = _score(usable, sc, weekly, fee, start, halves=True)
        base, dip_scale, alloc_scale, sell, sell_scale = combo
        rows.append({**res, "wins": res["coinsVsDca"] > 0 and res["h1"] > 0 and res["h2"] > 0,
                     "setup": {"tiers": [{"on": True, "dip": d, "sell": s, "spend": a} for d, s, a, _ in sc["tiers"]], "sell": sell, "trail": 5, "base": int(base * 100)},
                     "plain": f"{int(base * 100)}% of each top-up bought at once · dips at {int(round(5 * dip_scale))}/{round(8.5 * dip_scale, 1):g}/{round(15 * dip_scale, 1):g}% · "
                              f"spend {int(5 * alloc_scale)}/{int(10 * alloc_scale)}/{min(40, int(15 * alloc_scale))}% of cash per dip · "
                              + {"never": "never sell", "trail": "trailing sell"}.get(sell, f"sell at +{12.5 * sell_scale:g}/{15 * sell_scale:g}/{20 * sell_scale:g}%")})
    rows.sort(key=lambda r: (not r["wins"], -r["coinsVsDca"]))
    winners = [r for r in rows if r["wins"]]
    return {"tried": len(first), "coins": len(usable), "winners": len(winners), "best": rows[:top],
            "text": (f"Tried {len(first)} setups on {len(usable)} coins. {len(winners)} beat buying every week in BOTH halves of the year."
                     if winners else f"Tried {len(first)} setups on {len(usable)} coins. None beat buying every week in both halves of this year — the table shows the closest.")}

# ==========================================
# Market mood — "is it a good time to add USDC?" (pure — no database / network)
# ==========================================
# A plain, rules-based reading of conditions. It does NOT predict a bottom. It combines:
#   * how far down things are (Bitcoin and the tracked coins vs their 30-day highs),
#   * how frightened the market is (Fear & Greed index, when available),
#   * whether prices are still making NEW lows (the falling-knife check),
#   * how many of the bot's buys are waiting for cash (a sign of a broad fall).
# Four states: good (🟢) / falling (🟠) / neutral (🟡) / wait (🔴). All thresholds are listed below and shown to the user.

from typing import Dict, List, Optional

DEEP_BTC_DRAWDOWN = -15.0        # Bitcoin this far (%) below its 30-day high counts as a discount
BREADTH_DOWN_PCT = 0.20          # a coin is "down" when 20%+ below its 30-day high
BREADTH_DOWN_SHARE = 0.50        # ...and the market is broadly down when half the coins are
FEAR_LEVEL = 40                  # Fear & Greed at or below this = fear (25 or less = extreme fear)
EXTREME_FEAR = 25
GREED_LEVEL = 75                 # at or above this = frothy
NEW_LOW_LOOKBACK = 14            # "new low" = lowest close of the last 14 days
FALLING_SHARE = 0.30             # still falling when 30%+ of coins made a new low in the last 2 days
STABLE_SHARE = 0.15              # settled when under 15% made a new low in the last 3 days
WAITING_MANY_MIN = 8             # "many" waiting buys: at least this many...
WAITING_MANY_SHARE = 0.08        # ...and at least this share of the bot's active signals


def drawdown_pct(closes: List[float], window: int = 30) -> Optional[float]:
    """% below the highest close of the last `window` days (0 or negative)."""
    if len(closes) < 5:
        return None
    high = max(closes[-window:])
    return (closes[-1] / high - 1) * 100 if high > 0 else None


def made_new_low(closes: List[float], recent: int, lookback: int = NEW_LOW_LOOKBACK) -> bool:
    """True if any of the last `recent` closes is below the lowest close of the `lookback` days before them."""
    if len(closes) < lookback + recent + 1:
        return False
    prior = closes[-(lookback + recent):-recent]
    return min(closes[-recent:]) < min(prior)


def breadth(series: Dict[str, List[float]]) -> Dict:
    """Share of coins well below their 30-day high, and share making new 14-day lows lately."""
    usable = [s for s in series.values() if len(s) >= 45 and s[-1] > 0]
    n = len(usable)
    if not n:
        return {"coins": 0, "down": 0, "newLow2": 0, "newLow3": 0}
    down = sum(1 for s in usable if s[-1] <= (1 - BREADTH_DOWN_PCT) * max(s[-30:]))
    return {"coins": n, "down": down,
            "newLow2": sum(1 for s in usable if made_new_low(s, 2)),
            "newLow3": sum(1 for s in usable if made_new_low(s, 3))}


def count_waiting(assignments: Dict, tier_active: Dict, targets: Dict, cooldowns: Dict, prices: Dict[str, float],
                  skip: set, now_ms: int) -> Dict[str, int]:
    """Buys that have triggered (price at or below the tier's buy level, tier on, not cooling down) but haven't happened: waiting for cash."""
    active = waiting = 0
    for coin, tiers in (assignments or {}).items():
        if coin in skip:
            continue
        for t in (tiers if isinstance(tiers, list) else []):
            if not (tier_active or {}).get(str(t)):
                continue
            active += 1
            ck = f"{coin}:{t}"
            try:
                buy = float((targets.get(ck) or {}).get("buy", 0) or 0)
            except (TypeError, ValueError):
                continue
            price = prices.get(coin)
            if buy > 0 and price and price <= buy and not (float((cooldowns or {}).get(ck, 0) or 0) > now_ms):
                waiting += 1
    return {"active": active, "waiting": waiting}


def _fear_word(v: int) -> str:
    return "extreme fear" if v <= EXTREME_FEAR else "fear" if v <= FEAR_LEVEL else "neutral" if v < GREED_LEVEL else "greed"


def classify(btc_closes: List[float], series: Dict[str, List[float]], fear_greed: Optional[int], waiting: Dict[str, int],
             waiting_before: Optional[int] = None) -> Dict:
    dd = drawdown_pct(btc_closes)
    br = breadth(series)
    n = br["coins"]
    down_share = br["down"] / n if n else 0.0
    new2 = br["newLow2"] / n if n else 0.0
    new3 = br["newLow3"] / n if n else 0.0
    btc_low2 = made_new_low(btc_closes, 2)
    btc_low4 = made_new_low(btc_closes, 4)
    w, active = waiting.get("waiting", 0), waiting.get("active", 0)
    many = w >= WAITING_MANY_MIN and (w / active if active else 0) >= WAITING_MANY_SHARE

    fear = fear_greed is not None and fear_greed <= FEAR_LEVEL
    deep = dd is not None and dd <= DEEP_BTC_DRAWDOWN
    broad = down_share >= BREADTH_DOWN_SHARE
    discount = fear or deep or broad or many
    frothy = (fear_greed is not None and fear_greed >= GREED_LEVEL) or (
        dd is not None and dd >= -3 and down_share <= 0.10 and fear_greed is not None and fear_greed >= 65)
    falling_now = btc_low2 or new2 >= FALLING_SHARE
    stable = (not btc_low4) and new3 < STABLE_SHARE

    if discount and stable:
        state = "good"
    elif discount:
        state = "falling"
    elif falling_now:
        state = "wait"
    elif frothy:
        state = "wait"
    else:
        state = "neutral"

    text = {
        "good": ("🟢", "Good time to add", "Prices look discounted and have stopped making new lows. If you add, consider adding in steps — for example a third now."),
        "falling": ("🟠", "Blood on the street — still falling", "It's a bargain zone, but prices are still making new lows. If you add, consider only a third and wait for it to settle. Waiting buys will fire the moment USDC arrives."),
        "neutral": ("🟡", "Neutral", "Nothing extreme right now. Follow your normal plan."),
        "wait": ("🔴", "Wait", "Prices are dropping and fear hasn't really shown up yet — often early in a drop, so waiting is reasonable." if not frothy or falling_now
                 else "The market looks frothy. There's no rush to add."),
    }[state]

    lines = []
    if dd is not None:
        lines.append(f"Bitcoin is {abs(dd):.0f}% below its 30-day high.")
    if n:
        lines.append(f"{br['down']} of {n} coins ({down_share * 100:.0f}%) are {int(BREADTH_DOWN_PCT * 100)}%+ below their 30-day high.")
    lines.append(f"Fear & Greed index: {fear_greed} ({_fear_word(fear_greed)})." if fear_greed is not None else "Fear & Greed index: not available right now.")
    lines.append(f"Bitcoin made a new 2-week low in the last 2 days: {'yes' if btc_low2 else 'no'}.")
    if n:
        lines.append(f"{br['newLow3']} coins ({new3 * 100:.0f}%) made a new 2-week low in the last 3 days.")
    trend = ""
    if waiting_before is not None and waiting_before >= 0:
        trend = f" (was {waiting_before} yesterday)"
    lines.append(f"Buys waiting for cash: {w}{trend}.")

    return {
        "state": state, "emoji": text[0], "label": text[1], "advice": text[2], "lines": lines,
        "waiting": w, "waitingBefore": waiting_before, "activeSignals": active,
        "inputs": {"btcDrawdownPct": None if dd is None else round(dd, 1), "downShare": round(down_share, 3), "newLow2Share": round(new2, 3),
                   "newLow3Share": round(new3, 3), "fearGreed": fear_greed, "btcNewLow2d": btc_low2, "btcNewLow4d": btc_low4},
        "thresholds": {"deepBtcDrawdown": DEEP_BTC_DRAWDOWN, "fearAtOrBelow": FEAR_LEVEL, "frothyAtOrAbove": GREED_LEVEL,
                       "stillFallingShare": FALLING_SHARE, "settledBelowShare": STABLE_SHARE},
    }

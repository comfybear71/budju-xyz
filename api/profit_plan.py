# ==========================================
# Profit-taking plan (pure — no database / network)
# ==========================================
# Each tier has its own profit-taking rules, independent of how much it BUYS:
#   arm    = how far above its reference price the tier starts watching for a sale (+%)
#   trail  = once armed, how far the price must fall back from its high before the slice is sold (%)
#   slice  = how much of the position that one sale takes (% of what the bot holds of the coin)
# There is no "sell anyway" cap: a coin that keeps climbing is simply left running until it pulls back.
#
# Staggered on purpose, so a rising coin gives something at each stage instead of everything at once:
#   Tier 1 gives a little early (cash back for the next dip), Tier 3 only on a big run.

from typing import Dict, Optional, Tuple

PLAN_VERSION = 1

DEFAULT_PLAN: Dict[int, Dict[str, float]] = {
    1: {"arm": 15.0, "trail": 5.0, "slice": 5.0},
    2: {"arm": 30.0, "trail": 8.0, "slice": 7.5},
    3: {"arm": 75.0, "trail": 12.0, "slice": 10.0},
}

MAX_MIN_BUMP_FRACTION = 0.25      # never let the exchange minimum make one sale take more than this share of a position


def _clamp(v, lo, hi, default):
    try:
        return min(hi, max(lo, float(v)))
    except (TypeError, ValueError):
        return default


def plan_for(tier: int, overrides: Optional[Dict] = None) -> Dict[str, float]:
    """The profit-taking numbers for one tier. `overrides` (from the saved state) may change any of them; anything missing or
    out of range falls back to / is clamped against safe limits."""
    base = DEFAULT_PLAN.get(int(tier), DEFAULT_PLAN[3])
    raw = {}
    if isinstance(overrides, dict):
        raw = overrides.get(str(tier)) or overrides.get(int(tier)) or {}
        if not isinstance(raw, dict):
            raw = {}
    return {
        "arm": _clamp(raw.get("arm", base["arm"]), 3.0, 500.0, base["arm"]),
        "trail": _clamp(raw.get("trail", base["trail"]), 1.0, 30.0, base["trail"]),
        "slice": _clamp(raw.get("slice", base["slice"]), 1.0, 50.0, base["slice"]),
    }


def size_sell(slice_pct: float, position_qty: float, price: float, min_usd: float,
              max_bump_fraction: float = MAX_MIN_BUMP_FRACTION) -> Tuple[Optional[float], str]:
    """How much to sell. -> (quantity, note); quantity None means skip this sale.
    The tier's slice is used as is. If it is below the exchange minimum, it is raised to the minimum ONLY when that
    still takes no more than `max_bump_fraction` of the position — otherwise the sale is skipped and the coin keeps growing."""
    if position_qty <= 0 or price <= 0:
        return None, "no position"
    qty = position_qty * slice_pct / 100.0
    if qty * price >= min_usd:
        return round(min(qty, position_qty), 8), ""
    if position_qty * price < min_usd:
        return None, "position below the Swyftx minimum"
    min_qty = min_usd / price
    if min_qty <= position_qty * max_bump_fraction:
        return round(min_qty, 8), "raised to the Swyftx minimum"
    return None, f"slice is below the Swyftx minimum and raising it would sell more than {int(max_bump_fraction * 100)}% of the position"


SELL_SANITY_MULT = 4.0


def sane_sell(sell: float, price: float, buy: float, dev: float, arm: float):
    """Guard against a runaway sell level. A sell level legitimately sits at most about (reference price) x (1 + arm%) — a bit
    higher when it stayed anchored after a later, lower buy — so anything beyond SELL_SANITY_MULT times that is a corrupted value
    (an old bug multiplied levels into the millions). -> the level to use instead, or None when the level is fine.
    The reference is the higher of today's price and the signal's open price (buy level / (1 - dip%))."""
    try:
        sell, price, buy, dev, arm = float(sell), float(price or 0), float(buy or 0), float(dev or 0), float(arm or 0)
    except (TypeError, ValueError):
        return None
    if sell <= 0:
        return None
    open_price = buy / (1 - dev / 100.0) if buy > 0 and 0 < dev < 100 else 0.0
    ref = max(price, open_price)
    if ref <= 0:
        return None
    fair = ref * (1 + arm / 100.0)
    return fair if sell > fair * SELL_SANITY_MULT else None

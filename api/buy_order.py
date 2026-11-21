# ==========================================
# Order in which a wallet works through its coin-tier signals (pure)
# ==========================================
# When several buys are waiting and cash is limited, the order is:
#   1. CORE coins first (BTC, ETH, SOL), then MAJOR coins (the other big, established ones), then everything else.
#   2. Within each group, the deepest discount first: the coin whose price is furthest below its buy level.
#   3. Ties go to the bigger tier (T3 dips, then T2, then T1), then coin name so the order is stable.
# The first buys are the biggest (each takes a % of the cash left), so the important coins must be at the front.
# Signals that aren't waiting to buy follow, in the same stable order (they only matter for sells).

from typing import Dict, List, Tuple

CORE_COINS = ("BTC", "ETH", "SOL")
MAJOR_COINS = ("XRP", "BNB", "ADA", "DOGE", "AVAX", "LINK", "TRX", "SUI", "LTC", "DOT")


def priority(coin: str) -> int:
    """0 = core, 1 = major, 2 = everything else."""
    c = (coin or "").upper()
    return 0 if c in CORE_COINS else 1 if c in MAJOR_COINS else 2


def discount_pct(price: float, buy_target: float) -> float:
    """% the price is below the buy level (positive = discount; 0 if not below / unknown)."""
    try:
        if price and buy_target and price <= buy_target:
            return (buy_target - price) / buy_target * 100.0
    except (TypeError, ZeroDivisionError):
        pass
    return 0.0


def order_pairs(pairs: List[Tuple[str, int]], prices: Dict[str, float], targets: Dict) -> List[Tuple[str, int]]:
    def key(p):
        coin, tier = p
        tgt = targets.get(f"{coin}:{tier}") or targets.get(coin) or {}
        try:
            buy = float(tgt.get("buy", 0) or 0)
        except (TypeError, ValueError, AttributeError):
            buy = 0.0
        return (priority(coin), -discount_pct(prices.get(coin, 0), buy), -int(tier), coin)
    return sorted(pairs, key=key)

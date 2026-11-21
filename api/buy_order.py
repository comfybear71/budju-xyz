# ==========================================
# Order in which a wallet works through its coin-tier signals (pure)
# ==========================================
# When several buys are waiting and cash is limited, the first buys take the biggest slices, so the order matters:
#   1. By GROUP, the same five groups as the Holdings screen:
#        Top 10 (market-cap rank 1-10)  >  Innovation  >  Top 50  >  Top 200  >  Smaller
#   2. Inside a group, BTC / ETH / SOL come before the rest of that group.
#   3. Then the deepest discount first: the coin whose price is furthest below its buy level.
#   4. Ties go to the bigger tier (T3 dips, then T2, then T1), then coin name so the order is stable.
# Signals that aren't waiting to buy follow, in the same stable order (they only matter for sells).

from typing import Dict, List, Optional, Tuple

CORE_COINS = ("BTC", "ETH", "SOL")
# Used only when a coin's market-cap rank is not known yet (same list as the Holdings screen)
TOP_10_FALLBACK = ("BTC", "ETH", "XRP", "BNB", "SOL", "DOGE", "ADA", "LINK", "AVAX")
# AI, compute, next-gen L1s: a theme, not a size (same list as the Holdings screen)
INNOVATION_COINS = ("SUI", "NEAR", "RENDER", "FET", "TAO", "HYPE", "DOT", "UNI")

GROUP_NAMES = ("Top 10", "Innovation", "Top 50", "Top 200", "Smaller")


def group_of(coin: str, rank: Optional[int] = None) -> int:
    """0 Top 10, 1 Innovation, 2 Top 50, 3 Top 200, 4 Smaller. BTC / ETH / SOL are always in the first group."""
    c = (coin or "").upper()
    if c in CORE_COINS:
        return 0
    if (rank is not None and rank <= 10) or (rank is None and c in TOP_10_FALLBACK):
        return 0
    if c in INNOVATION_COINS:
        return 1
    if rank is None:
        return 4
    if rank <= 50:
        return 2
    if rank <= 200:
        return 3
    return 4


def discount_pct(price: float, buy_target: float) -> float:
    """% the price is below the buy level (positive = discount; 0 if not below / unknown)."""
    try:
        if price and buy_target and price <= buy_target:
            return (buy_target - price) / buy_target * 100.0
    except (TypeError, ZeroDivisionError):
        pass
    return 0.0


def order_pairs(pairs: List[Tuple[str, int]], prices: Dict[str, float], targets: Dict,
                ranks: Optional[Dict[str, int]] = None) -> List[Tuple[str, int]]:
    ranks = ranks if isinstance(ranks, dict) else {}

    def key(p):
        coin, tier = p
        tgt = targets.get(f"{coin}:{tier}") or targets.get(coin) or {}
        try:
            buy = float(tgt.get("buy", 0) or 0)
        except (TypeError, ValueError, AttributeError):
            buy = 0.0
        core = 0 if (coin or "").upper() in CORE_COINS else 1
        return (group_of(coin, ranks.get(coin)), core, -discount_pct(prices.get(coin, 0), buy), -int(tier), coin)
    return sorted(pairs, key=key)

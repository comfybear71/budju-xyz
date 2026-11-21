# ==========================================
# Order in which a wallet works through its coin-tier signals (pure)
# ==========================================
# When several buys are waiting and cash is limited, the first buys take the biggest slices, so the order matters:
#   0. Coins on the shit list (Dip Report "Careful": their dips often don't come back) go LAST, whatever their group,
#      and a buy is capped at SHIT_LIST_MAX_BUY.
#   1. By GROUP, the same five groups as the Holdings screen:
#        Top 10 (market-cap rank 1-10)  >  Innovation  >  Top 50  >  Top 200  >  Smaller
#   2. Inside a group, BTC / ETH / SOL come before the rest of that group.
#   3. Then "accumulate" coins (Dip Report focus: best average gain per dip) before the rest, then coins the wallet holds
#      little of before ones it already holds a lot of.
#   4. Then the deepest discount first: the coin whose price is furthest below its buy level.
#   5. Ties go to the bigger tier (T3 dips, then T2, then T1), then coin name so the order is stable.
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


SHIT_LIST_MAX_BUY = 50.0      # a "Careful" coin never gets more than this in one buy


def underweight_buckets(holdings: Dict[str, float], prices: Dict[str, float], cash_codes=("USDC", "USDT", "USD", "AUD")) -> Dict[str, int]:
    """How much of the wallet's coin value each coin is: 0 = under 0.5% (or none), 1 = under 2%, 2 = 2% or more.
    Only coins with a known price count. Coins the wallet does not hold are absent (read as 0 by the caller)."""
    vals = {}
    for c, q in (holdings or {}).items():
        if c in cash_codes:
            continue
        try:
            v = float(q) * float(prices.get(c, 0) or 0)
        except (TypeError, ValueError):
            continue
        if v > 0:
            vals[c] = v
    total = sum(vals.values())
    if total <= 0:
        return {}
    return {c: (0 if v / total < 0.005 else 1 if v / total < 0.02 else 2) for c, v in vals.items()}


def order_pairs(pairs: List[Tuple[str, int]], prices: Dict[str, float], targets: Dict,
                ranks: Optional[Dict[str, int]] = None, info: Optional[Dict] = None) -> List[Tuple[str, int]]:
    """info (all optional): {"careful": coins on the shit list, "focus": accumulate coins, "buckets": underweight_buckets()}."""
    ranks = ranks if isinstance(ranks, dict) else {}
    info = info if isinstance(info, dict) else {}
    careful, focus = set(info.get("careful") or ()), set(info.get("focus") or ())
    buckets = info.get("buckets") if isinstance(info.get("buckets"), dict) else {}

    def key(p):
        coin, tier = p
        tgt = targets.get(f"{coin}:{tier}") or targets.get(coin) or {}
        try:
            buy = float(tgt.get("buy", 0) or 0)
        except (TypeError, ValueError, AttributeError):
            buy = 0.0
        core = 0 if (coin or "").upper() in CORE_COINS else 1
        weight = buckets.get(coin, 0) if buckets else 1
        return (1 if coin in careful else 0, group_of(coin, ranks.get(coin)), core, 0 if coin in focus else 1, weight,
                -discount_pct(prices.get(coin, 0), buy), -int(tier), coin)
    return sorted(pairs, key=key)


def explain(coin: str, ranks: Optional[Dict[str, int]] = None, info: Optional[Dict] = None) -> List[str]:
    """Short plain-English tags saying why a coin sits where it does."""
    ranks = ranks if isinstance(ranks, dict) else {}
    info = info if isinstance(info, dict) else {}
    tags = [GROUP_NAMES[group_of(coin, ranks.get(coin))]]
    if coin in set(info.get("careful") or ()):
        return ["Shit list (Careful)"]
    if coin in set(info.get("focus") or ()):
        tags.append("accumulate")
    buckets = info.get("buckets") if isinstance(info.get("buckets"), dict) else {}
    if buckets and buckets.get(coin, 0) == 0:
        tags.append("holds little")
    return tags

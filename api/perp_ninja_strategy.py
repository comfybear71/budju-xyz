# ==========================================
# Perpetual Paper Trading — Ninja Ambush Strategy
# ==========================================
# Places pending limit/stop orders at key technical levels detected
# from price history. Orders wait like ambushes at:
#   1. Swing high/low support & resistance
#   2. Bollinger Band extremes (mean reversion)
#   3. Previous session highs/lows (breakout/breakdown)
#   4. Round psychological numbers
#   5. Liquidity sweep levels (equal lows/highs clusters)
#
# Confluence scoring ranks levels — only top 3-5 get orders.
# Runs once per hour (not every minute) to avoid churn.
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

sys.path.insert(0, os.path.dirname(__file__))
from database import db
from perp_engine import MARKETS, perp_accounts, perp_positions
from perp_strategies import (
    get_price_series, store_price, bollinger_bands, atr, sma,
    get_strategy_config, log_signal, calculate_position_size,
    COOLDOWN_MINUTES,
)
from perp_engine import (
    create_pending_order, get_pending_orders, cancel_pending_order,
    get_pending_order_count, MAX_PENDING_ORDERS, perp_pending_orders,
)

# ── Constants ────────────────────────────────────────────────────────────

NINJA_MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP", "AVAX-PERP", "LINK-PERP"]

# Swing detection window (number of candles on each side for local extrema)
SWING_WINDOW = 5

# Max pending orders the ninja strategy will maintain (leaves room for manual orders)
MAX_NINJA_ORDERS = 8

# How many top-scored levels to place orders at per symbol
MAX_ORDERS_PER_SYMBOL = 2

# Max total levels to act on across all symbols
MAX_TOTAL_LEVELS = 5

# Leverage for ninja orders (conservative)
NINJA_LEVERAGE = 2

# ATR multiplier for stop loss
NINJA_SL_ATR_MULT = 2.5

# ATR multiplier for take profit
NINJA_TP_ATR_MULT = 6.0

# Trailing stop percentage
NINJA_TRAILING_STOP_PCT = 2.0

# Order expiry in hours
NINJA_EXPIRY_HOURS = 24

# Don't place orders if one already exists within this % of the level
DUPLICATE_THRESHOLD_PCT = 0.3

# Only consider levels within this range of current price
MIN_DISTANCE_PCT = 2.0
MAX_DISTANCE_PCT = 8.0

# Round number intervals by base asset
ROUND_NUMBER_INTERVALS = {
    "BTC-PERP": 1000,
    "ETH-PERP": 100,
    "SOL-PERP": 5,
    "SUI-PERP": 1,
    "AVAX-PERP": 5,
    "LINK-PERP": 1,
}

# Equal lows/highs cluster tolerance
EQUAL_LEVEL_TOLERANCE_PCT = 0.1

# Minimum candles needed for analysis
MIN_NINJA_CANDLES = 60


# ── Level Detection ──────────────────────────────────────────────────────

def find_swing_highs(prices: List[float], window: int = SWING_WINDOW) -> List[Tuple[int, float]]:
    """Find local maxima — swing highs where price is highest in a window on each side."""
    swings = []
    for i in range(window, len(prices) - window):
        is_high = True
        for j in range(1, window + 1):
            if prices[i] <= prices[i - j] or prices[i] <= prices[i + j]:
                is_high = False
                break
        if is_high:
            swings.append((i, prices[i]))
    return swings


def find_swing_lows(prices: List[float], window: int = SWING_WINDOW) -> List[Tuple[int, float]]:
    """Find local minima — swing lows where price is lowest in a window on each side."""
    swings = []
    for i in range(window, len(prices) - window):
        is_low = True
        for j in range(1, window + 1):
            if prices[i] >= prices[i - j] or prices[i] >= prices[i + j]:
                is_low = False
                break
        if is_low:
            swings.append((i, prices[i]))
    return swings


def find_swing_levels(prices: List[float]) -> List[Dict]:
    """Detect support/resistance from swing highs and lows."""
    levels = []

    swing_highs = find_swing_highs(prices)
    swing_lows = find_swing_lows(prices)

    for _idx, price_level in swing_highs:
        levels.append({
            "price": price_level,
            "type": "resistance",
            "order_type": "limit_sell",
            "source": "swing_high",
        })

    for _idx, price_level in swing_lows:
        levels.append({
            "price": price_level,
            "type": "support",
            "order_type": "limit_buy",
            "source": "swing_low",
        })

    return levels


def find_bb_levels(prices: List[float]) -> List[Dict]:
    """Detect Bollinger Band extreme levels for mean reversion ambush."""
    upper, middle, lower = bollinger_bands(prices, period=20, num_std=2.0)
    if not upper:
        return []

    levels = [
        {
            "price": lower[-1],
            "type": "support",
            "order_type": "limit_buy",
            "source": "bb_lower",
        },
        {
            "price": upper[-1],
            "type": "resistance",
            "order_type": "limit_sell",
            "source": "bb_upper",
        },
    ]
    return levels


def find_session_levels(prices: List[float]) -> List[Dict]:
    """Calculate previous session (last 60 candles as proxy for day) high/low/open/close."""
    if len(prices) < 60:
        return []

    # Use last 60 1-minute candles as a "session" proxy
    session = prices[-60:]
    prev_high = max(session)
    prev_low = min(session)

    levels = [
        # Limit buy at previous low (support bounce)
        {
            "price": prev_low,
            "type": "support",
            "order_type": "limit_buy",
            "source": "session_low",
        },
        # Sell stop below previous low (breakdown)
        {
            "price": prev_low * 0.998,  # Slightly below for breakdown confirmation
            "type": "breakdown",
            "order_type": "sell_stop",
            "source": "session_breakdown",
        },
        # Buy stop above previous high (breakout)
        {
            "price": prev_high * 1.002,  # Slightly above for breakout confirmation
            "type": "breakout",
            "order_type": "buy_stop",
            "source": "session_breakout",
        },
    ]
    return levels


def find_round_numbers(current_price: float, symbol: str) -> List[Dict]:
    """Find round psychological number levels within range of current price."""
    interval = ROUND_NUMBER_INTERVALS.get(symbol, 5)
    levels = []

    # Find nearest round numbers within MIN_DISTANCE_PCT to MAX_DISTANCE_PCT
    lower_bound = current_price * (1 - MAX_DISTANCE_PCT / 100)
    upper_bound = current_price * (1 + MAX_DISTANCE_PCT / 100)

    # Start from the nearest round number below lower_bound
    start = math.floor(lower_bound / interval) * interval
    level = start

    while level <= upper_bound:
        if level > 0:
            distance_pct = abs(level - current_price) / current_price * 100
            if MIN_DISTANCE_PCT <= distance_pct <= MAX_DISTANCE_PCT:
                if level < current_price:
                    levels.append({
                        "price": float(level),
                        "type": "support",
                        "order_type": "limit_buy",
                        "source": "round_number",
                    })
                else:
                    levels.append({
                        "price": float(level),
                        "type": "resistance",
                        "order_type": "limit_sell",
                        "source": "round_number",
                    })
        level += interval

    return levels


def find_liquidity_sweep_levels(prices: List[float]) -> List[Dict]:
    """Find clusters of equal lows where stops likely rest, then place orders below."""
    if len(prices) < 20:
        return []

    levels = []
    tolerance = EQUAL_LEVEL_TOLERANCE_PCT / 100

    # Find swing lows and cluster them
    swing_lows = find_swing_lows(prices, window=3)  # Smaller window for more lows
    if len(swing_lows) < 2:
        return []

    # Group lows that are within tolerance of each other
    low_prices = sorted([p for _, p in swing_lows])
    clusters = []
    current_cluster = [low_prices[0]]

    for i in range(1, len(low_prices)):
        if abs(low_prices[i] - current_cluster[0]) / current_cluster[0] <= tolerance:
            current_cluster.append(low_prices[i])
        else:
            if len(current_cluster) >= 2:
                clusters.append(current_cluster[:])
            current_cluster = [low_prices[i]]

    if len(current_cluster) >= 2:
        clusters.append(current_cluster)

    # Place limit_buy BELOW equal-low clusters (catch the wick after stop sweep)
    for cluster in clusters:
        cluster_level = min(cluster)
        sweep_price = cluster_level * 0.997  # 0.3% below the cluster
        levels.append({
            "price": sweep_price,
            "type": "liquidity_sweep",
            "order_type": "limit_buy",
            "source": "liquidity_sweep",
            "cluster_size": len(cluster),
        })

    return levels


# ── Confluence Scoring ───────────────────────────────────────────────────

def score_levels(all_levels: List[Dict], current_price: float) -> List[Dict]:
    """Score levels by confluence — levels from multiple sources get higher scores.

    Levels within 0.5% of each other are considered confluent.
    Returns levels sorted by score (highest first), deduplicated.
    """
    if not all_levels:
        return []

    confluence_tolerance = 0.005  # 0.5%

    # Group confluent levels
    scored = []
    used = [False] * len(all_levels)

    for i, level in enumerate(all_levels):
        if used[i]:
            continue

        group = [level]
        used[i] = True
        total_score = 1.0

        # Source-based bonus
        source_bonus = {
            "swing_high": 1.5,
            "swing_low": 1.5,
            "bb_lower": 1.0,
            "bb_upper": 1.0,
            "session_low": 1.2,
            "session_breakout": 1.0,
            "session_breakdown": 1.0,
            "round_number": 0.8,
            "liquidity_sweep": 1.3,
        }
        total_score = source_bonus.get(level["source"], 1.0)

        # Liquidity sweep cluster size bonus
        if level.get("cluster_size", 0) >= 3:
            total_score += 0.5

        for j in range(i + 1, len(all_levels)):
            if used[j]:
                continue
            other = all_levels[j]
            # Check if levels are confluent (close together)
            if abs(level["price"] - other["price"]) / level["price"] <= confluence_tolerance:
                # Same direction confluence adds score
                if level["order_type"] == other["order_type"]:
                    total_score += source_bonus.get(other["source"], 1.0)
                    group.append(other)
                    used[j] = True

        # Distance preference: levels closer to current price (but not too close) score higher
        distance_pct = abs(level["price"] - current_price) / current_price * 100
        if distance_pct < MIN_DISTANCE_PCT:
            continue  # Too close — skip
        if distance_pct > MAX_DISTANCE_PCT:
            continue  # Too far — skip

        # Sweet spot bonus: 3-5% distance is ideal
        if 3.0 <= distance_pct <= 5.0:
            total_score += 0.3

        # Use the average price of the group
        avg_price = sum(l["price"] for l in group) / len(group)

        sources = list(set(l["source"] for l in group))
        scored.append({
            "price": round(avg_price, 6),
            "order_type": level["order_type"],
            "type": level["type"],
            "score": round(total_score, 2),
            "sources": sources,
            "confluence_count": len(group),
            "distance_pct": round(distance_pct, 2),
        })

    # Sort by score descending
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


# ── Order Management ─────────────────────────────────────────────────────

def has_nearby_order(existing_orders: List[Dict], price: float) -> bool:
    """Check if there's already a pending order within DUPLICATE_THRESHOLD_PCT of this price."""
    for order in existing_orders:
        if order.get("status") != "pending":
            continue
        order_price = order.get("trigger_price", 0)
        if order_price <= 0:
            continue
        if abs(order_price - price) / price * 100 < DUPLICATE_THRESHOLD_PCT:
            return True
    return False


def cancel_ninja_orders(wallet: str) -> int:
    """Cancel all existing ninja-strategy pending orders for refresh."""
    existing = get_pending_orders(wallet, status="pending")
    cancelled = 0
    for order in existing:
        reason = order.get("entry_reason", "")
        if reason.startswith("[ninja]"):
            try:
                cancel_pending_order(order["_id"], wallet)
                cancelled += 1
            except Exception as e:
                print(f"[ninja] Failed to cancel order {order['_id']}: {e}")
    return cancelled


# ── Main Strategy ────────────────────────────────────────────────────────

def run_ninja_strategy(wallet: str, prices: Dict[str, float],
                       equity: float, peak_equity: float) -> List[Dict]:
    """Run the ninja ambush strategy for a wallet.

    Detects key technical levels across all markets, scores them by
    confluence, and places pending orders at the top-ranked levels.

    Args:
        wallet: Account wallet address.
        prices: Dict of symbol -> current price.
        equity: Current account equity.
        peak_equity: Peak account equity (for drawdown scaling).

    Returns:
        List of action dicts describing what was done.
    """
    actions = []

    # Drawdown protection: stop placing new orders at 10% drawdown
    if peak_equity and peak_equity > 0:
        drawdown_pct = (peak_equity - equity) / peak_equity * 100
        if drawdown_pct >= 10:
            actions.append({"action": "skipped", "reason": "Drawdown >= 10%, ninja paused"})
            return actions

    # Cancel existing ninja orders and refresh
    cancelled = cancel_ninja_orders(wallet)
    if cancelled > 0:
        actions.append({"action": "cancelled", "count": cancelled, "reason": "ninja_refresh"})
        print(f"[ninja] Cancelled {cancelled} stale ninja orders for {wallet[:8]}")

    # Get existing non-ninja pending orders to check capacity
    existing_orders = get_pending_orders(wallet, status="pending")
    non_ninja_count = sum(1 for o in existing_orders if not o.get("entry_reason", "").startswith("[ninja]"))
    available_slots = MAX_PENDING_ORDERS - non_ninja_count
    ninja_slots = min(available_slots, MAX_NINJA_ORDERS)

    if ninja_slots <= 0:
        actions.append({"action": "skipped", "reason": "No order slots available"})
        return actions

    # Get open positions to avoid placing orders in same market
    open_positions = list(perp_positions.find({"account_id": wallet, "status": "open"}))
    open_symbols = set(p["symbol"] for p in open_positions)

    # Collect all scored levels across all markets
    all_scored_levels = []

    for symbol in NINJA_MARKETS:
        if symbol not in prices:
            continue
        if symbol in open_symbols:
            continue  # Skip markets with open positions

        current_price = prices[symbol]

        # Get price history
        price_series = get_price_series(symbol, count=120)
        if len(price_series) < MIN_NINJA_CANDLES:
            continue

        # Detect levels from all sources
        levels = []
        levels.extend(find_swing_levels(price_series))
        levels.extend(find_bb_levels(price_series))
        levels.extend(find_session_levels(price_series))
        levels.extend(find_round_numbers(current_price, symbol))
        levels.extend(find_liquidity_sweep_levels(price_series))

        if not levels:
            continue

        # Score by confluence and filter
        scored = score_levels(levels, current_price)

        # Take top levels per symbol
        top_for_symbol = scored[:MAX_ORDERS_PER_SYMBOL]
        for level in top_for_symbol:
            level["symbol"] = symbol
            level["current_price"] = current_price
            all_scored_levels.append(level)

    # Sort all levels across all symbols by score, take top N
    all_scored_levels.sort(key=lambda x: x["score"], reverse=True)
    top_levels = all_scored_levels[:min(MAX_TOTAL_LEVELS, ninja_slots)]

    if not top_levels:
        actions.append({"action": "skipped", "reason": "No qualifying levels found"})
        return actions

    # Re-fetch existing orders after cancellation for duplicate check
    existing_orders = get_pending_orders(wallet, status="pending")

    # Calculate ATR for each symbol (cache to avoid re-computation)
    atr_cache = {}

    orders_placed = 0
    for level in top_levels:
        symbol = level["symbol"]
        trigger_price = level["price"]
        order_type = level["order_type"]
        current_price = level["current_price"]

        # Check for duplicate
        if has_nearby_order(existing_orders, trigger_price):
            continue

        # Get ATR for stop/TP calculation
        if symbol not in atr_cache:
            price_series = get_price_series(symbol, count=60)
            atr_vals = atr(price_series, period=14)
            atr_cache[symbol] = atr_vals[-1] if atr_vals else 0
        atr_value = atr_cache[symbol]

        if atr_value <= 0:
            continue

        # Calculate stop loss based on structure + ATR
        stop_distance = atr_value * NINJA_SL_ATR_MULT
        tp_distance = atr_value * NINJA_TP_ATR_MULT

        direction = "long" if order_type in ("limit_buy", "buy_stop") else "short"

        if direction == "long":
            stop_loss = trigger_price - stop_distance
            take_profit = trigger_price + tp_distance
        else:
            stop_loss = trigger_price + stop_distance
            take_profit = trigger_price - tp_distance

        # Ensure stop_loss is positive
        if stop_loss <= 0:
            continue

        # Position sizing: risk 1% of equity
        risk_pct = 0.01
        if peak_equity and peak_equity > 0:
            dd_pct = (peak_equity - equity) / peak_equity * 100
            if dd_pct >= 5:
                risk_pct *= 0.5  # Half size at 5% drawdown

        risk_amount = equity * risk_pct
        stop_pct = stop_distance / trigger_price
        if stop_pct <= 0:
            continue

        size_usd = risk_amount / stop_pct
        # Cap at 10% of equity * leverage
        max_size = equity * 0.10 * NINJA_LEVERAGE
        size_usd = min(size_usd, max_size)

        # Minimum $50
        if size_usd < 50:
            continue

        size_usd = round(size_usd, 2)

        entry_reason = (
            f"[ninja] {level['type']} "
            f"({', '.join(level['sources'])}) "
            f"score={level['score']}"
        )

        # Map order_type to create_pending_order format
        mapped_order_type = "limit" if "limit" in order_type else "stop"

        try:
            order = create_pending_order(
                wallet=wallet,
                symbol=symbol,
                direction=direction,
                leverage=NINJA_LEVERAGE,
                size_usd=size_usd,
                order_type=mapped_order_type,
                trigger_price=trigger_price,
                stop_loss=round(stop_loss, 6),
                take_profit=round(take_profit, 6),
                trailing_stop_pct=NINJA_TRAILING_STOP_PCT,
                entry_reason=entry_reason,
                expiry_hours=NINJA_EXPIRY_HOURS,
            )

            orders_placed += 1
            action = {
                "action": "placed",
                "strategy": "ninja",
                "symbol": symbol,
                "order_type": order_type,
                "direction": direction,
                "trigger_price": trigger_price,
                "size_usd": size_usd,
                "leverage": NINJA_LEVERAGE,
                "stop_loss": round(stop_loss, 6),
                "take_profit": round(take_profit, 6),
                "score": level["score"],
                "sources": level["sources"],
                "distance_pct": level["distance_pct"],
                "order_id": order.get("_id"),
            }
            actions.append(action)

            # Log signal for auditing
            log_signal(
                wallet=wallet,
                strategy="ninja",
                symbol=symbol,
                direction=direction,
                signal_type=f"ambush_{level['type']}",
                indicators={
                    "trigger_price": trigger_price,
                    "current_price": current_price,
                    "score": level["score"],
                    "sources": level["sources"],
                    "atr": round(atr_value, 6),
                },
                acted=True,
                reason=entry_reason,
            )

            print(
                f"[ninja] Placed {order_type} {symbol} @ ${trigger_price:.4f} "
                f"(score={level['score']}, sources={level['sources']}) "
                f"for {wallet[:8]}"
            )

        except ValueError as e:
            print(f"[ninja] Failed to place {order_type} {symbol}: {e}")
            actions.append({
                "action": "error",
                "strategy": "ninja",
                "symbol": symbol,
                "error": str(e),
            })
        except Exception as e:
            print(f"[ninja] Unexpected error placing {order_type} {symbol}: {e}")

    if orders_placed > 0:
        print(f"[ninja] Placed {orders_placed} ambush orders for {wallet[:8]}")
    else:
        actions.append({"action": "skipped", "reason": "No orders placed (duplicates or sizing)"})

    return actions

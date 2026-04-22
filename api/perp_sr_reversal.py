# ==========================================
# Perpetual Paper Trading — Support/Resistance Reversal Strategy
# ==========================================
# Uses 15-minute chart data to identify key support and resistance
# levels, then enters reversal trades when price hits those levels.
#
# The strategy looks for:
#   1. Horizontal S/R from swing highs/lows on 15-min chart
#   2. Clusters where price has bounced multiple times (stronger levels)
#   3. RSI divergence at the level (confirms reversal momentum)
#   4. Candlestick rejection patterns (wicks, engulfing)
#
# Entry rules:
#   - Price touches a support level → LONG reversal
#   - Price touches a resistance level → SHORT reversal
#   - Must have RSI confirmation (oversold at support, overbought at resistance)
#   - Must show rejection (price bouncing away from level, not breaking through)
#
# 15-minute timeframe gives cleaner S/R levels than 1-minute noise
# while still being fast enough for intraday trading.
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(__file__))
from perp_strategies import (
    get_price_series, get_price_series_15m, get_15m_hlc,
    seed_15m_candles, store_price,
    ema, rsi, atr, sma,
    log_signal, build_standard_indicators,
    perp_strategy_signals, perp_price_history,
    BINANCE_SYMBOLS,
)
from perp_engine import (
    MARKETS, open_position, perp_accounts, perp_positions,
)

# ── Constants ────────────────────────────────────────────────────────────

# S/R Detection Parameters (15-minute chart)
SR_LOOKBACK = 100               # Look back 100 fifteen-minute candles (~25 hours)
SR_SWING_WINDOW = 3             # Swing detection window (3 bars each side)
SR_CLUSTER_TOLERANCE_PCT = 0.3  # Levels within 0.3% are the same level
SR_MIN_TOUCHES = 2              # Level needs at least 2 touches to be valid
SR_PROXIMITY_PCT = 0.5          # Price must be within 0.5% of level to trigger

# Entry Confirmation
RSI_PERIOD = 14                 # RSI period on 15-min data
RSI_OVERSOLD = 35               # RSI oversold for support bounce
RSI_OVERBOUGHT = 65             # RSI overbought for resistance bounce
REJECTION_MIN_PCT = 0.1         # Minimum 0.1% rejection bounce from level

# Risk Settings
SR_LEVERAGE = 3
SR_SL_ATR_MULT = 1.5            # Tight SL: 1.5x ATR (behind the level)
SR_TP_ATR_MULT = 3.0            # TP: 3x ATR (back toward middle)
SR_TRAILING_STOP_PCT = 1.0      # 1% trailing stop
SR_SIZE_PCT = 0.015              # 1.5% of equity risk per trade

# Cooldown
SR_COOLDOWN_MINUTES = 30        # 30-minute cooldown per symbol (faster than trend strategies)

# Markets
SR_MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP", "AVAX-PERP", "LINK-PERP"]

# Min 15-min candles needed
MIN_15M_CANDLES = 50


# ── S/R Level Detection (15-minute) ─────────────────────────────────────

def find_15m_swing_highs(highs: List[float], window: int = SR_SWING_WINDOW) -> List[Tuple[int, float]]:
    """Find swing highs on 15-min chart (resistance candidates)."""
    swings = []
    for i in range(window, len(highs) - window):
        is_high = True
        for j in range(1, window + 1):
            if highs[i] <= highs[i - j] or highs[i] <= highs[i + j]:
                is_high = False
                break
        if is_high:
            swings.append((i, highs[i]))
    return swings


def find_15m_swing_lows(lows: List[float], window: int = SR_SWING_WINDOW) -> List[Tuple[int, float]]:
    """Find swing lows on 15-min chart (support candidates)."""
    swings = []
    for i in range(window, len(lows) - window):
        is_low = True
        for j in range(1, window + 1):
            if lows[i] >= lows[i - j] or lows[i] >= lows[i + j]:
                is_low = False
                break
        if is_low:
            swings.append((i, lows[i]))
    return swings


def cluster_levels(levels: List[float], tolerance_pct: float = SR_CLUSTER_TOLERANCE_PCT) -> List[Dict]:
    """Group nearby price levels into clusters and count touches.

    Returns list of {price, touches, type} sorted by touches descending.
    """
    if not levels:
        return []

    sorted_levels = sorted(levels)
    clusters = []
    current_cluster = [sorted_levels[0]]

    for i in range(1, len(sorted_levels)):
        if abs(sorted_levels[i] - current_cluster[0]) / current_cluster[0] * 100 <= tolerance_pct:
            current_cluster.append(sorted_levels[i])
        else:
            if len(current_cluster) >= SR_MIN_TOUCHES:
                avg_price = sum(current_cluster) / len(current_cluster)
                clusters.append({
                    "price": round(avg_price, 6),
                    "touches": len(current_cluster),
                })
            current_cluster = [sorted_levels[i]]

    # Don't forget the last cluster
    if len(current_cluster) >= SR_MIN_TOUCHES:
        avg_price = sum(current_cluster) / len(current_cluster)
        clusters.append({
            "price": round(avg_price, 6),
            "touches": len(current_cluster),
        })

    # Sort by touches (strongest levels first)
    clusters.sort(key=lambda c: c["touches"], reverse=True)
    return clusters


def detect_sr_levels(symbol: str) -> Dict:
    """Detect support and resistance levels from 15-minute chart data.

    Returns {support_levels: [...], resistance_levels: [...]}
    Each level has: price, touches, strength
    """
    highs, lows, closes = get_15m_hlc(symbol, count=SR_LOOKBACK)

    if len(highs) < MIN_15M_CANDLES:
        # Try to seed 15m candles if we don't have enough
        seed_15m_candles(symbol, 200)
        highs, lows, closes = get_15m_hlc(symbol, count=SR_LOOKBACK)
        if len(highs) < MIN_15M_CANDLES:
            return {"support_levels": [], "resistance_levels": []}

    # Find swing highs and lows
    swing_highs = find_15m_swing_highs(highs)
    swing_lows = find_15m_swing_lows(lows)

    # Also add price levels where wicks rejected (touched but closed away)
    for i in range(1, len(highs)):
        # Upper wick rejection: high was significantly above close
        wick_pct = (highs[i] - closes[i]) / closes[i] * 100 if closes[i] > 0 else 0
        if wick_pct > 0.15:  # 0.15% upper wick
            swing_highs.append((i, highs[i]))

        # Lower wick rejection: low was significantly below close
        wick_pct = (closes[i] - lows[i]) / closes[i] * 100 if closes[i] > 0 else 0
        if wick_pct > 0.15:
            swing_lows.append((i, lows[i]))

    # Cluster resistance levels (from swing highs)
    resistance_prices = [price for _, price in swing_highs]
    resistance_clusters = cluster_levels(resistance_prices)

    # Cluster support levels (from swing lows)
    support_prices = [price for _, price in swing_lows]
    support_clusters = cluster_levels(support_prices)

    # Add strength rating based on touches
    for level in resistance_clusters:
        level["type"] = "resistance"
        level["strength"] = "strong" if level["touches"] >= 4 else "moderate" if level["touches"] >= 3 else "weak"

    for level in support_clusters:
        level["type"] = "support"
        level["strength"] = "strong" if level["touches"] >= 4 else "moderate" if level["touches"] >= 3 else "weak"

    return {
        "support_levels": support_clusters[:5],      # Top 5 support levels
        "resistance_levels": resistance_clusters[:5], # Top 5 resistance levels
    }


# ── Reversal Confirmation ───────────────────────────────────────────────

def check_reversal_at_support(
    current_price: float,
    prev_price: float,
    support_level: float,
    rsi_value: float,
) -> bool:
    """Check if conditions are met for a long reversal at support.

    Requirements:
    1. Price is within proximity of support level
    2. RSI shows oversold or near-oversold
    3. Price is bouncing UP (current > prev, showing rejection)
    """
    # Price within proximity of support
    distance_pct = abs(current_price - support_level) / support_level * 100
    if distance_pct > SR_PROXIMITY_PCT:
        return False

    # RSI confirmation: oversold or approaching
    if rsi_value > RSI_OVERSOLD:
        return False

    # Rejection: price bouncing up from the level
    bounce_pct = (current_price - prev_price) / prev_price * 100
    if bounce_pct < REJECTION_MIN_PCT:
        return False

    # Price should be at or just above support (not below — that's a break)
    if current_price < support_level * 0.998:  # Allow 0.2% below for wicks
        return False

    return True


def check_reversal_at_resistance(
    current_price: float,
    prev_price: float,
    resistance_level: float,
    rsi_value: float,
) -> bool:
    """Check if conditions are met for a short reversal at resistance.

    Requirements:
    1. Price is within proximity of resistance level
    2. RSI shows overbought or near-overbought
    3. Price is dropping (current < prev, showing rejection)
    """
    distance_pct = abs(current_price - resistance_level) / resistance_level * 100
    if distance_pct > SR_PROXIMITY_PCT:
        return False

    if rsi_value < RSI_OVERBOUGHT:
        return False

    # Rejection: price dropping from resistance
    drop_pct = (prev_price - current_price) / prev_price * 100
    if drop_pct < REJECTION_MIN_PCT:
        return False

    # Price should be at or just below resistance (not above — that's a break)
    if current_price > resistance_level * 1.002:
        return False

    return True


# ── Cooldown ─────────────────────────────────────────────────────────────

def is_sr_on_cooldown(wallet: str, symbol: str) -> bool:
    """Check if symbol is on SR reversal cooldown."""
    cutoff = datetime.utcnow() - timedelta(minutes=SR_COOLDOWN_MINUTES)
    recent = perp_strategy_signals.find_one({
        "account_id": wallet,
        "strategy": "sr_reversal",
        "symbol": symbol,
        "acted": True,
        "timestamp": {"$gte": cutoff},
    })
    return recent is not None


# ── Main Strategy ────────────────────────────────────────────────────────

def run_sr_reversal(wallet: str, prices: Dict[str, float],
                    equity: float, peak_equity: float) -> List[Dict]:
    """Run the Support/Resistance Reversal strategy.

    1. Detect S/R levels from 15-minute chart data
    2. Check if current price is at a support or resistance level
    3. Confirm reversal with RSI and price rejection
    4. Enter reversal trade with tight SL behind the level

    Args:
        wallet: Account wallet address
        prices: Dict of symbol -> current price
        equity: Current account equity
        peak_equity: Peak equity for drawdown checks

    Returns:
        List of action dicts
    """
    actions = []

    # Drawdown protection
    if peak_equity and peak_equity > 0:
        dd_pct = (peak_equity - equity) / peak_equity * 100
        if dd_pct >= 10:
            return [{"action": "skipped", "reason": "Drawdown >= 10%, S/R reversal paused"}]

    for symbol in SR_MARKETS:
        if symbol not in prices:
            continue

        current_price = prices[symbol]

        # Cooldown check
        if is_sr_on_cooldown(wallet, symbol):
            continue

        # Detect S/R levels from 15-min chart
        sr_data = detect_sr_levels(symbol)
        support_levels = sr_data["support_levels"]
        resistance_levels = sr_data["resistance_levels"]

        if not support_levels and not resistance_levels:
            continue

        # Get 15-min price series for RSI calculation
        prices_15m = get_price_series_15m(symbol, count=30)
        if len(prices_15m) < RSI_PERIOD + 2:
            continue

        rsi_vals = rsi(prices_15m, RSI_PERIOD)
        atr_vals = atr(prices_15m, 14)
        if not rsi_vals or not atr_vals:
            continue

        curr_rsi = rsi_vals[-1]
        curr_atr = atr_vals[-1]
        prev_price = prices_15m[-2] if len(prices_15m) >= 2 else current_price

        # ── Check for LONG reversal at support ──
        for level in support_levels:
            support_price = level["price"]

            if check_reversal_at_support(current_price, prev_price, support_price, curr_rsi):
                # SL just below the support level (behind the level)
                stop_loss = support_price - (curr_atr * SR_SL_ATR_MULT)
                take_profit = current_price + (curr_atr * SR_TP_ATR_MULT)

                if stop_loss <= 0:
                    continue

                # Position size
                risk_amount = equity * SR_SIZE_PCT
                stop_distance_pct = abs(current_price - stop_loss) / current_price
                if stop_distance_pct <= 0:
                    continue
                size_usd = round(min(risk_amount / stop_distance_pct, equity * 0.10 * SR_LEVERAGE), 2)
                if size_usd < 50:
                    continue

                entry_reason = (
                    f"[sr_reversal] support_bounce @ ${support_price:.4f} "
                    f"({level['touches']} touches, {level['strength']})"
                )

                try:
                    position = open_position(
                        wallet=wallet,
                        symbol=symbol,
                        direction="long",
                        leverage=SR_LEVERAGE,
                        size_usd=size_usd,
                        entry_price=current_price,
                        stop_loss=round(stop_loss, 6),
                        take_profit=round(take_profit, 6),
                        trailing_stop_pct=SR_TRAILING_STOP_PCT,
                        entry_reason=entry_reason,
                    )

                    log_signal(wallet, "sr_reversal", symbol, "long",
                               "support_bounce", {
                                   **build_standard_indicators(prices_15m),
                                   "support_price": support_price,
                                   "touches": level["touches"],
                                   "strength": level["strength"],
                                   "rsi": round(curr_rsi, 2),
                                   "atr": round(curr_atr, 6),
                                   "price": current_price,
                               }, True)

                    actions.append({
                        "action": "opened",
                        "symbol": symbol,
                        "direction": "long",
                        "signal": "support_bounce",
                        "level_price": support_price,
                        "touches": level["touches"],
                        "strength": level["strength"],
                        "size_usd": size_usd,
                        "entry_price": current_price,
                        "stop_loss": round(stop_loss, 6),
                        "take_profit": round(take_profit, 6),
                        "rsi": round(curr_rsi, 2),
                    })

                    print(f"[sr] LONG reversal {symbol} at support ${support_price:.4f} "
                          f"({level['touches']} touches) for {wallet[:8]}")
                    break  # Only one trade per symbol per cycle

                except ValueError as e:
                    print(f"[sr] Failed to open long {symbol}: {e}")

        # ── Check for SHORT reversal at resistance ──
        for level in resistance_levels:
            resistance_price = level["price"]

            if check_reversal_at_resistance(current_price, prev_price, resistance_price, curr_rsi):
                # SL just above the resistance level (behind the level)
                stop_loss = resistance_price + (curr_atr * SR_SL_ATR_MULT)
                take_profit = current_price - (curr_atr * SR_TP_ATR_MULT)

                if take_profit <= 0:
                    continue

                # Position size
                risk_amount = equity * SR_SIZE_PCT
                stop_distance_pct = abs(stop_loss - current_price) / current_price
                if stop_distance_pct <= 0:
                    continue
                size_usd = round(min(risk_amount / stop_distance_pct, equity * 0.10 * SR_LEVERAGE), 2)
                if size_usd < 50:
                    continue

                entry_reason = (
                    f"[sr_reversal] resistance_rejection @ ${resistance_price:.4f} "
                    f"({level['touches']} touches, {level['strength']})"
                )

                try:
                    position = open_position(
                        wallet=wallet,
                        symbol=symbol,
                        direction="short",
                        leverage=SR_LEVERAGE,
                        size_usd=size_usd,
                        entry_price=current_price,
                        stop_loss=round(stop_loss, 6),
                        take_profit=round(take_profit, 6),
                        trailing_stop_pct=SR_TRAILING_STOP_PCT,
                        entry_reason=entry_reason,
                    )

                    log_signal(wallet, "sr_reversal", symbol, "short",
                               "resistance_rejection", {
                                   **build_standard_indicators(prices_15m),
                                   "resistance_price": resistance_price,
                                   "touches": level["touches"],
                                   "strength": level["strength"],
                                   "rsi": round(curr_rsi, 2),
                                   "atr": round(curr_atr, 6),
                                   "price": current_price,
                               }, True)

                    actions.append({
                        "action": "opened",
                        "symbol": symbol,
                        "direction": "short",
                        "signal": "resistance_rejection",
                        "level_price": resistance_price,
                        "touches": level["touches"],
                        "strength": level["strength"],
                        "size_usd": size_usd,
                        "entry_price": current_price,
                        "stop_loss": round(stop_loss, 6),
                        "take_profit": round(take_profit, 6),
                        "rsi": round(curr_rsi, 2),
                    })

                    print(f"[sr] SHORT reversal {symbol} at resistance ${resistance_price:.4f} "
                          f"({level['touches']} touches) for {wallet[:8]}")
                    break  # Only one trade per symbol per cycle

                except ValueError as e:
                    print(f"[sr] Failed to open short {symbol}: {e}")

    return actions

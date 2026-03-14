# ==========================================
# Perpetual Paper Trading — Ninja Scalper Strategy
# ==========================================
# Ultra-fast micro-scalping: tight limit orders around current price
# to capture small bounces and micro-moves. Entries are placed within
# 0.1–0.8% of current price (not 2-8% like the old ambush strategy).
#
# Tactics:
#   1. Layered buy limits below / sell limits above for mean-reversion
#   2. Buy stop-limits above recent highs for breakout momentum
#   3. Sell stop-limits below recent lows for breakdown momentum
#   4. EMA/RSI micro-filters for direction bias
#   5. Volatility & spread checks to avoid dead/choppy markets
#
# Targets 0.05–0.3% raw capture per trade (before leverage).
# Tight stops, fast TP, maker-preferred orders.
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from database import db
from perp_engine import MARKETS, perp_accounts, perp_positions
from perp_strategies import (
    get_price_series, store_price, bollinger_bands, atr, sma, rsi, ema,
    get_strategy_config, log_signal, calculate_position_size,
    COOLDOWN_MINUTES,
)
from perp_engine import (
    create_pending_order, get_pending_orders, cancel_pending_order,
    get_pending_order_count, MAX_PENDING_ORDERS, perp_pending_orders,
)

# ── Constants ────────────────────────────────────────────────────────────

NINJA_MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP", "AVAX-PERP", "LINK-PERP"]

# ── Scalping parameters ──────────────────────────────────────────────────

# How close to price we place orders (as % of price)
# Layer 1: 0.10% from price (tightest)
# Layer 2: 0.25% from price
# Layer 3: 0.50% from price (widest mean-reversion)
SCALP_LAYERS = [0.10, 0.25, 0.50]

# Breakout/breakdown offset above recent high / below recent low
BREAKOUT_OFFSET_PCT = 0.05  # 0.05% beyond the extreme

# Recent high/low lookback (candles)
MICRO_LOOKBACK = 15  # 15 one-minute candles

# ATR multiplier for stop loss — needs room to breathe past noise
NINJA_SL_ATR_MULT = 1.5   # 1.5x ATR stop gives room for normal volatility
# ATR multiplier for take profit
NINJA_TP_ATR_MULT = 3.0   # 3x ATR target (2:1 R:R)
# Trailing stop percentage
NINJA_TRAILING_STOP_PCT = 1.0  # 1% trailing stop

# Max pending ninja orders
MAX_NINJA_ORDERS = 10
# Max orders per symbol
MAX_ORDERS_PER_SYMBOL = 4
# Leverage for ninja (higher for scalps, but still careful)
NINJA_LEVERAGE = 5
# Order expiry — scalp orders go stale fast
NINJA_EXPIRY_HOURS = 1  # 1 hour max, refreshed every cron cycle

# Don't place if order already exists within this % of the level
DUPLICATE_THRESHOLD_PCT = 0.08

# Risk per order (% of equity)
RISK_PER_ORDER_PCT = 0.005  # 0.5% of equity per scalp order

# Minimum candles needed
MIN_NINJA_CANDLES = 30

# ── Volatility / quality filters ─────────────────────────────────────────

# Skip if ATR/price ratio is below this (market is dead, no moves to scalp)
MIN_VOLATILITY_RATIO = 0.0003  # 0.03% — market needs some pulse

# Skip if ATR/price ratio is above this (too wild, will get stopped)
MAX_VOLATILITY_RATIO = 0.02  # 2% — avoid liquidation wicks

# RSI extremes to bias direction (avoid fading strong momentum)
RSI_OVERBOUGHT = 75
RSI_OVERSOLD = 25

# EMA period for micro-trend bias
MICRO_EMA_PERIOD = 9


# ── Level Detection ──────────────────────────────────────────────────────

def detect_scalp_levels(prices: List[float], current_price: float,
                        symbol: str) -> List[Dict]:
    """Detect ultra-tight scalp levels around current price.

    Returns list of order dicts with: price, order_type, direction, source, score
    """
    levels = []

    if len(prices) < MIN_NINJA_CANDLES:
        return levels

    # ── Micro indicators ──
    ema_vals = ema(prices, MICRO_EMA_PERIOD)
    rsi_vals = rsi(prices, period=14)
    current_rsi = rsi_vals[-1] if rsi_vals else 50.0
    ema_val = ema_vals[-1] if ema_vals else current_price

    # Direction bias: above EMA = prefer longs, below = prefer shorts
    bullish_bias = current_price > ema_val
    # RSI filter: don't buy overbought, don't sell oversold
    rsi_ok_long = current_rsi < RSI_OVERBOUGHT
    rsi_ok_short = current_rsi > RSI_OVERSOLD

    # ── 1. Layered limit orders (mean reversion) ──
    # Buy limits below price, sell limits above
    for i, offset_pct in enumerate(SCALP_LAYERS):
        layer_score = 2.0 - (i * 0.3)  # Tighter = higher score

        if rsi_ok_long:
            buy_price = current_price * (1 - offset_pct / 100)
            levels.append({
                "price": round(buy_price, 6),
                "order_type": "limit",
                "direction": "long",
                "source": f"layer_{i+1}_buy",
                "score": layer_score + (0.3 if bullish_bias else 0),
            })

        if rsi_ok_short:
            sell_price = current_price * (1 + offset_pct / 100)
            levels.append({
                "price": round(sell_price, 6),
                "order_type": "limit",
                "direction": "short",
                "source": f"layer_{i+1}_sell",
                "score": layer_score + (0.3 if not bullish_bias else 0),
            })

    # ── 2. Breakout / breakdown stop orders ──
    recent = prices[-MICRO_LOOKBACK:]
    recent_high = max(recent)
    recent_low = min(recent)

    # Buy stop above recent high (momentum long)
    if rsi_ok_long and bullish_bias:
        breakout_price = recent_high * (1 + BREAKOUT_OFFSET_PCT / 100)
        levels.append({
            "price": round(breakout_price, 6),
            "order_type": "stop",
            "direction": "long",
            "source": "breakout_high",
            "score": 1.8 if current_rsi > 55 else 1.2,
        })

    # Sell stop below recent low (momentum short)
    if rsi_ok_short and not bullish_bias:
        breakdown_price = recent_low * (1 - BREAKOUT_OFFSET_PCT / 100)
        levels.append({
            "price": round(breakdown_price, 6),
            "order_type": "stop",
            "direction": "short",
            "source": "breakdown_low",
            "score": 1.8 if current_rsi < 45 else 1.2,
        })

    # ── 3. Bollinger Band micro-scalp ──
    # If price is near BB extremes, add a level at the band
    upper, middle, lower = bollinger_bands(prices, period=20, num_std=2.0)
    if upper and lower:
        bb_upper = upper[-1]
        bb_lower = lower[-1]

        # Distance from current price to BB bands (as %)
        dist_to_lower = (current_price - bb_lower) / current_price * 100
        dist_to_upper = (bb_upper - current_price) / current_price * 100

        # Only add if BB band is within our scalp range (< 0.8%)
        if 0.05 < dist_to_lower < 0.8 and rsi_ok_long:
            levels.append({
                "price": round(bb_lower, 6),
                "order_type": "limit",
                "direction": "long",
                "source": "bb_lower_scalp",
                "score": 2.2,  # High score — BB confluence
            })
        if 0.05 < dist_to_upper < 0.8 and rsi_ok_short:
            levels.append({
                "price": round(bb_upper, 6),
                "order_type": "limit",
                "direction": "short",
                "source": "bb_upper_scalp",
                "score": 2.2,
            })

    # Sort by score descending
    levels.sort(key=lambda x: x["score"], reverse=True)
    return levels


# ── Order Management ─────────────────────────────────────────────────────

def has_nearby_order(existing_orders: List[Dict], price: float) -> bool:
    """Check if there's already a pending order within DUPLICATE_THRESHOLD_PCT."""
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
    """Run the ninja scalper strategy for a wallet.

    Places tight limit/stop orders around current price for micro-scalping.
    Orders are within 0.1-0.5% of price for mean reversion, plus breakout
    stops just beyond recent highs/lows.

    Args:
        wallet: Account wallet address.
        prices: Dict of symbol -> current price.
        equity: Current account equity.
        peak_equity: Peak account equity (for drawdown scaling).

    Returns:
        List of action dicts describing what was done.
    """
    actions = []

    # Drawdown protection: pause at 10% drawdown
    if peak_equity and peak_equity > 0:
        drawdown_pct = (peak_equity - equity) / peak_equity * 100
        if drawdown_pct >= 10:
            actions.append({"action": "skipped", "reason": "Drawdown >= 10%, ninja paused"})
            return actions

    # Cancel existing ninja orders and refresh (scalp orders go stale fast)
    cancelled = cancel_ninja_orders(wallet)
    if cancelled > 0:
        actions.append({"action": "cancelled", "count": cancelled, "reason": "ninja_refresh"})
        print(f"[ninja] Cancelled {cancelled} stale ninja orders for {wallet[:8]}")

    # Check available order slots
    existing_orders = get_pending_orders(wallet, status="pending")
    non_ninja_count = sum(1 for o in existing_orders
                         if not o.get("entry_reason", "").startswith("[ninja]"))
    available_slots = MAX_PENDING_ORDERS - non_ninja_count
    ninja_slots = min(available_slots, MAX_NINJA_ORDERS)

    if ninja_slots <= 0:
        actions.append({"action": "skipped", "reason": "No order slots available"})
        return actions

    # Get open positions to avoid doubling up
    open_positions = list(perp_positions.find({"account_id": wallet, "status": "open"}))
    open_symbols = set(p["symbol"] for p in open_positions)

    # Collect all scored levels across all markets
    all_levels = []

    for symbol in NINJA_MARKETS:
        if symbol not in prices:
            continue
        if symbol in open_symbols:
            continue  # Skip markets with open positions

        current_price = prices[symbol]

        # Get price history (1-min candles)
        price_series = get_price_series(symbol, count=120)
        if len(price_series) < MIN_NINJA_CANDLES:
            continue

        # ── Volatility filter ──
        atr_vals = atr(price_series, period=14)
        if not atr_vals:
            continue
        current_atr = atr_vals[-1]
        vol_ratio = current_atr / current_price
        if vol_ratio < MIN_VOLATILITY_RATIO:
            continue  # Market is dead
        if vol_ratio > MAX_VOLATILITY_RATIO:
            continue  # Too wild

        # Detect scalp levels
        levels = detect_scalp_levels(price_series, current_price, symbol)
        if not levels:
            continue

        # Cap per symbol and attach metadata
        for level in levels[:MAX_ORDERS_PER_SYMBOL]:
            level["symbol"] = symbol
            level["current_price"] = current_price
            level["atr"] = current_atr
            all_levels.append(level)

    # Sort all levels by score, take top N
    all_levels.sort(key=lambda x: x["score"], reverse=True)
    top_levels = all_levels[:ninja_slots]

    if not top_levels:
        actions.append({"action": "skipped", "reason": "No qualifying scalp levels found"})
        return actions

    # Re-fetch existing orders after cancellation for duplicate check
    existing_orders = get_pending_orders(wallet, status="pending")

    orders_placed = 0
    for level in top_levels:
        symbol = level["symbol"]
        trigger_price = level["price"]
        order_type = level["order_type"]
        direction = level["direction"]
        current_price = level["current_price"]
        current_atr = level["atr"]

        # Duplicate check
        if has_nearby_order(existing_orders, trigger_price):
            continue

        # ── SL / TP calculation ──
        # ATR is already scaled to ~1hr in perp_strategies (sqrt(60) factor).
        # Use it directly — dividing further makes stops too tight and
        # causes instant stop-outs from normal 1-min noise.
        stop_distance = current_atr * NINJA_SL_ATR_MULT
        tp_distance = current_atr * NINJA_TP_ATR_MULT

        if direction == "long":
            stop_loss = trigger_price - stop_distance
            take_profit = trigger_price + tp_distance
        else:
            stop_loss = trigger_price + stop_distance
            take_profit = trigger_price - tp_distance

        if stop_loss <= 0 or take_profit <= 0:
            continue

        # ── Position sizing: risk RISK_PER_ORDER_PCT of equity ──
        risk_pct = RISK_PER_ORDER_PCT
        if peak_equity and peak_equity > 0:
            dd_pct = (peak_equity - equity) / peak_equity * 100
            if dd_pct >= 5:
                risk_pct *= 0.5  # Half size at 5% drawdown

        risk_amount = equity * risk_pct
        stop_pct = stop_distance / trigger_price
        if stop_pct <= 0:
            continue

        size_usd = risk_amount / stop_pct
        # Cap at 5% of equity * leverage
        max_size = equity * 0.05 * NINJA_LEVERAGE
        size_usd = min(size_usd, max_size)

        # Minimum $25 for scalps
        if size_usd < 25:
            continue

        size_usd = round(size_usd, 2)

        distance_pct = abs(trigger_price - current_price) / current_price * 100

        entry_reason = (
            f"[ninja] scalp {level['source']} "
            f"score={level['score']:.1f} "
            f"dist={distance_pct:.2f}%"
        )

        try:
            order = create_pending_order(
                wallet=wallet,
                symbol=symbol,
                direction=direction,
                leverage=NINJA_LEVERAGE,
                size_usd=size_usd,
                order_type=order_type,
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
                "source": level["source"],
                "distance_pct": round(distance_pct, 3),
                "order_id": order.get("_id"),
            }
            actions.append(action)

            log_signal(
                wallet=wallet,
                strategy="ninja",
                symbol=symbol,
                direction=direction,
                signal_type=f"scalp_{level['source']}",
                indicators={
                    "trigger_price": trigger_price,
                    "current_price": current_price,
                    "score": level["score"],
                    "source": level["source"],
                    "atr": round(current_atr, 6),
                    "atr_used": round(current_atr, 6),
                    "distance_pct": round(distance_pct, 3),
                },
                acted=True,
                reason=entry_reason,
            )

            print(
                f"[ninja] Placed {order_type} {direction} {symbol} @ ${trigger_price:.4f} "
                f"(dist={distance_pct:.3f}%, score={level['score']:.1f}, src={level['source']}) "
                f"SL=${stop_loss:.4f} TP=${take_profit:.4f} "
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
        print(f"[ninja] Placed {orders_placed} scalp orders for {wallet[:8]}")
    else:
        actions.append({"action": "skipped", "reason": "No orders placed (duplicates or sizing)"})

    return actions

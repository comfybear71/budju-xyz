# ==========================================
# Perpetual Paper Trading — Zone Recovery (Hedge Recovery) Strategy
# ==========================================
# Forex EA-inspired strategy that recovers from losing trades by
# opening opposing positions with escalating lot sizes.
#
# How it works:
#   1. Open initial trade based on trend signal (EMA + RSI)
#   2. If trade moves against us by ZONE_WIDTH, open opposing trade
#      at 1.3x size (smooth martingale)
#   3. Continue alternating until net PnL of the "zone" is positive
#   4. Close all positions in the zone when net profit target is hit
#
# Risk controls:
#   - Smooth martingale (1.3x) instead of classic 2x doubling
#   - Max 5 recovery levels (hard cap)
#   - Total zone exposure capped at 15% of equity
#   - D'Alembert option: additive (+base_size) instead of multiplicative
#   - Circuit breaker: abandon zone at max drawdown
#   - Max 2 active zones across all symbols
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from database import db
from perp_engine import (
    MARKETS, open_position, close_position, get_open_positions,
    perp_accounts, perp_positions,
)
from perp_strategies import (
    get_price_series, store_price, ema, rsi, atr,
    log_signal, calculate_position_size, trend_filter,
)

# ── Collections ──────────────────────────────────────────────────────────

perp_zone_state = db["perp_zone_state"]
perp_zone_state.create_index([("account_id", 1)], unique=True)

# ── Constants ────────────────────────────────────────────────────────────

# Zone dimensions
ZONE_ATR_MULT = 1.5          # Zone width = 1.5x ATR
PROFIT_TARGET_ATR = 0.5       # Close zone when net profit = 0.5x ATR worth
MAX_RECOVERY_LEVELS = 5       # Max hedge/recovery attempts per zone
MAX_ACTIVE_ZONES = 2          # Max zones across all symbols

# Sizing
BASE_SIZE_PCT = 0.01          # 1% of equity for initial trade
SMOOTH_MARTINGALE_MULT = 1.3  # Each recovery level is 1.3x previous
MAX_ZONE_EXPOSURE_PCT = 0.15  # Total zone exposure never exceeds 15% equity

# Sizing mode: "smooth_martingale" | "dalembert" | "fibonacci"
DEFAULT_SIZING_MODE = "smooth_martingale"

# Entry signal
ENTRY_EMA_FAST = 9
ENTRY_EMA_SLOW = 21
ENTRY_RSI_PERIOD = 14
ENTRY_RSI_OVERSOLD = 35
ENTRY_RSI_OVERBOUGHT = 65
ATR_PERIOD = 14

# Leverage
ZONE_LEVERAGE = 3

# Markets
ZONE_MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP"]

# Min candles
MIN_ZONE_CANDLES = 30

# Cooldown between zone closures on same symbol
ZONE_COOLDOWN_MINUTES = 120


# ── Fibonacci Sequence for sizing ────────────────────────────────────────

FIB_SEQUENCE = [1, 1, 2, 3, 5, 8, 13]


def get_level_size(base_size: float, level: int, mode: str = DEFAULT_SIZING_MODE) -> float:
    """Calculate position size for a given recovery level.

    level 0 = initial trade, level 1 = first recovery, etc.

    Modes:
        smooth_martingale: base * 1.3^level (gentler than 2x doubling)
        dalembert: base * (1 + level) (linear additive)
        fibonacci: base * fib(level) (natural progression)
    """
    if mode == "dalembert":
        return base_size * (1 + level)
    elif mode == "fibonacci":
        idx = min(level, len(FIB_SEQUENCE) - 1)
        return base_size * FIB_SEQUENCE[idx]
    else:  # smooth_martingale
        return base_size * (SMOOTH_MARTINGALE_MULT ** level)


# ── Zone State ───────────────────────────────────────────────────────────

def get_zone_state(wallet: str) -> Dict:
    """Get zone recovery state for an account."""
    state = perp_zone_state.find_one({"account_id": wallet})
    if state:
        result = dict(state)
        result.pop("_id", None)
        return result
    return {
        "account_id": wallet,
        "zones": {},         # symbol -> zone info
        "sizing_mode": DEFAULT_SIZING_MODE,
    }


def save_zone_state(wallet: str, state: Dict):
    state["account_id"] = wallet
    state["updated_at"] = datetime.utcnow()
    perp_zone_state.update_one(
        {"account_id": wallet},
        {"$set": state},
        upsert=True,
    )


# ── Zone Management ─────────────────────────────────────────────────────

def calculate_zone_net_pnl(wallet: str, zone: Dict) -> float:
    """Calculate net PnL of all positions in a zone."""
    position_ids = zone.get("position_ids", [])
    if not position_ids:
        return 0.0

    total_pnl = 0.0
    for pid in position_ids:
        pos = perp_positions.find_one({"_id": pid, "account_id": wallet})
        if pos:
            if pos["status"] == "open":
                total_pnl += pos.get("unrealized_pnl", 0)
            elif pos["status"] == "closed":
                total_pnl += pos.get("realized_pnl", 0)

    # Add realized PnL from already-closed zone positions
    total_pnl += zone.get("realized_pnl", 0)

    return total_pnl


def get_zone_open_positions(wallet: str, zone: Dict) -> List[Dict]:
    """Get all open positions in a zone."""
    position_ids = zone.get("position_ids", [])
    positions = []
    for pid in position_ids:
        pos = perp_positions.find_one({"_id": pid, "account_id": wallet, "status": "open"})
        if pos:
            positions.append(pos)
    return positions


def close_zone(wallet: str, zone: Dict, prices: Dict[str, float], reason: str) -> List[Dict]:
    """Close all open positions in a zone."""
    actions = []
    symbol = zone["symbol"]
    price = prices.get(symbol, 0)
    if price <= 0:
        return actions

    open_positions = get_zone_open_positions(wallet, zone)
    for pos in open_positions:
        try:
            close_position(
                wallet=wallet,
                position_id=str(pos["_id"]),
                exit_price=price,
                exit_reason=f"[zone_recovery] {reason}",
            )
            actions.append({
                "action": "zone_closed",
                "symbol": symbol,
                "position_id": str(pos["_id"]),
                "direction": pos["direction"],
                "reason": reason,
            })
        except Exception as e:
            print(f"[zone] Failed to close position {pos['_id']}: {e}")

    return actions


# ── Entry Signal ─────────────────────────────────────────────────────────

def detect_entry_signal(prices_list: List[float]) -> Optional[str]:
    """Detect initial entry direction using EMA crossover + RSI."""
    if len(prices_list) < max(ENTRY_EMA_SLOW + 2, ENTRY_RSI_PERIOD + 2):
        return None

    fast_ema = ema(prices_list, ENTRY_EMA_FAST)
    slow_ema = ema(prices_list, ENTRY_EMA_SLOW)
    rsi_vals = rsi(prices_list, ENTRY_RSI_PERIOD)

    if len(fast_ema) < 2 or len(slow_ema) < 2 or not rsi_vals:
        return None

    curr_fast = fast_ema[-1]
    prev_fast = fast_ema[-2]
    curr_slow = slow_ema[-1]
    prev_slow = slow_ema[-2]
    curr_rsi = rsi_vals[-1]

    # Bullish crossover
    if prev_fast <= prev_slow and curr_fast > curr_slow:
        if ENTRY_RSI_OVERSOLD < curr_rsi < ENTRY_RSI_OVERBOUGHT:
            if trend_filter(prices_list, "long"):
                return "long"

    # Bearish crossover
    if prev_fast >= prev_slow and curr_fast < curr_slow:
        if ENTRY_RSI_OVERSOLD < curr_rsi < ENTRY_RSI_OVERBOUGHT:
            if trend_filter(prices_list, "short"):
                return "short"

    return None


# ── Main Strategy ────────────────────────────────────────────────────────

def run_zone_recovery(wallet: str, prices: Dict[str, float],
                      equity: float, peak_equity: float) -> List[Dict]:
    """Run the zone recovery strategy.

    1. Check existing zones — manage recovery or close on profit target
    2. Open new zones on fresh signals if under max active zones
    """
    actions = []

    # Drawdown protection
    if peak_equity and peak_equity > 0:
        dd_pct = (peak_equity - equity) / peak_equity * 100
        if dd_pct >= 10:
            return [{"action": "skipped", "reason": "Drawdown >= 10%, zone recovery paused"}]

    state = get_zone_state(wallet)
    sizing_mode = state.get("sizing_mode", DEFAULT_SIZING_MODE)
    zones = state.get("zones", {})
    base_size = equity * BASE_SIZE_PCT

    # ── Step 1: Manage existing zones ──

    zones_to_remove = []

    for symbol, zone in list(zones.items()):
        if symbol not in prices:
            continue

        current_price = prices[symbol]
        zone_width = zone.get("zone_width", 0)
        level = zone.get("level", 0)
        profit_target = zone.get("profit_target", 0)

        # Calculate net PnL of zone
        net_pnl = calculate_zone_net_pnl(wallet, zone)

        # Check profit target — close entire zone
        if net_pnl >= profit_target:
            close_actions = close_zone(wallet, zone, prices, f"profit_target (net=${net_pnl:.2f})")
            actions.extend(close_actions)
            zones_to_remove.append(symbol)
            print(f"[zone] Closed zone {symbol} at profit target: net=${net_pnl:.2f}")
            continue

        # Check max recovery levels — abandon zone if exhausted
        if level >= MAX_RECOVERY_LEVELS:
            close_actions = close_zone(wallet, zone, prices, f"max_levels_reached (L{level})")
            actions.extend(close_actions)
            zones_to_remove.append(symbol)
            print(f"[zone] Abandoned zone {symbol} at level {level}: net=${net_pnl:.2f}")
            continue

        # Check if price has crossed zone boundary → need recovery trade
        open_pos = get_zone_open_positions(wallet, zone)
        if not open_pos:
            zones_to_remove.append(symbol)
            continue

        last_direction = zone.get("last_direction", "long")
        last_entry = zone.get("last_entry_price", current_price)

        # Determine if we need a recovery hedge
        needs_recovery = False
        if last_direction == "long" and current_price <= last_entry - zone_width:
            needs_recovery = True
            recovery_direction = "short"
        elif last_direction == "short" and current_price >= last_entry + zone_width:
            needs_recovery = True
            recovery_direction = "long"

        if needs_recovery:
            new_level = level + 1
            level_size = get_level_size(base_size, new_level, sizing_mode)

            # Check total zone exposure cap
            total_exposure = sum(
                p.get("size_usd", 0) for p in open_pos
            ) + level_size
            max_exposure = equity * MAX_ZONE_EXPOSURE_PCT * ZONE_LEVERAGE
            if total_exposure > max_exposure:
                # Abandon — too much exposure
                close_actions = close_zone(wallet, zone, prices, "exposure_cap_exceeded")
                actions.extend(close_actions)
                zones_to_remove.append(symbol)
                print(f"[zone] Abandoned zone {symbol}: exposure ${total_exposure:.2f} > cap ${max_exposure:.2f}")
                continue

            # Open recovery position
            try:
                if recovery_direction == "long":
                    sl = current_price - zone_width * 2
                    tp = current_price + zone_width
                else:
                    sl = current_price + zone_width * 2
                    tp = current_price - zone_width

                if sl <= 0:
                    sl = current_price * 0.90

                pos = open_position(
                    wallet=wallet,
                    symbol=symbol,
                    direction=recovery_direction,
                    leverage=ZONE_LEVERAGE,
                    size_usd=round(level_size, 2),
                    entry_price=current_price,
                    stop_loss=round(sl, 6),
                    take_profit=round(tp, 6),
                    entry_reason=f"[zone_recovery] hedge_L{new_level} ({sizing_mode})",
                )

                pid = pos.get("_id") or pos.get("position_id")
                zone["position_ids"].append(pid)
                zone["level"] = new_level
                zone["last_direction"] = recovery_direction
                zone["last_entry_price"] = current_price

                actions.append({
                    "action": "recovery_hedge",
                    "symbol": symbol,
                    "direction": recovery_direction,
                    "level": new_level,
                    "size_usd": round(level_size, 2),
                    "sizing_mode": sizing_mode,
                    "net_pnl": round(net_pnl, 2),
                })

                log_signal(wallet, "zone_recovery", symbol, recovery_direction,
                           f"hedge_L{new_level}", {"level": new_level, "net_pnl": net_pnl,
                           "sizing_mode": sizing_mode}, True)

                print(f"[zone] Recovery hedge L{new_level} {recovery_direction} {symbol} "
                      f"${level_size:.2f} (net=${net_pnl:.2f})")

            except ValueError as e:
                print(f"[zone] Recovery hedge failed for {symbol}: {e}")
                actions.append({"action": "error", "symbol": symbol, "error": str(e)})

    # Remove closed zones
    for sym in zones_to_remove:
        zones.pop(sym, None)

    # ── Step 2: Open new zones on fresh signals ──

    active_zone_count = len(zones)
    if active_zone_count >= MAX_ACTIVE_ZONES:
        state["zones"] = zones
        save_zone_state(wallet, state)
        return actions

    for symbol in ZONE_MARKETS:
        if symbol in zones:
            continue
        if active_zone_count >= MAX_ACTIVE_ZONES:
            break
        if symbol not in prices:
            continue

        current_price = prices[symbol]

        # Get price data
        price_series = get_price_series(symbol, count=60)
        if len(price_series) < MIN_ZONE_CANDLES:
            continue

        # Check for entry signal
        direction = detect_entry_signal(price_series)
        if not direction:
            continue

        # Calculate zone width from ATR
        atr_vals = atr(price_series, ATR_PERIOD)
        if not atr_vals:
            continue
        curr_atr = atr_vals[-1]
        zone_width = curr_atr * ZONE_ATR_MULT
        profit_target = curr_atr * PROFIT_TARGET_ATR

        # Initial position
        initial_size = round(get_level_size(base_size, 0, sizing_mode), 2)
        if initial_size < 50:
            continue

        if direction == "long":
            sl = current_price - zone_width * 2
            tp = current_price + zone_width
        else:
            sl = current_price + zone_width * 2
            tp = current_price - zone_width

        if sl <= 0:
            sl = current_price * 0.90

        try:
            pos = open_position(
                wallet=wallet,
                symbol=symbol,
                direction=direction,
                leverage=ZONE_LEVERAGE,
                size_usd=initial_size,
                entry_price=current_price,
                stop_loss=round(sl, 6),
                take_profit=round(tp, 6),
                entry_reason=f"[zone_recovery] initial_{direction} ({sizing_mode})",
            )

            pid = pos.get("_id") or pos.get("position_id")
            zones[symbol] = {
                "symbol": symbol,
                "direction": direction,
                "level": 0,
                "last_direction": direction,
                "last_entry_price": current_price,
                "zone_width": zone_width,
                "profit_target": profit_target,
                "position_ids": [pid],
                "realized_pnl": 0,
                "opened_at": datetime.utcnow().isoformat(),
            }
            active_zone_count += 1

            actions.append({
                "action": "zone_opened",
                "symbol": symbol,
                "direction": direction,
                "size_usd": initial_size,
                "zone_width": round(zone_width, 4),
                "profit_target": round(profit_target, 4),
                "sizing_mode": sizing_mode,
            })

            log_signal(wallet, "zone_recovery", symbol, direction,
                       "zone_opened", {"zone_width": zone_width, "atr": curr_atr,
                       "sizing_mode": sizing_mode}, True)

            print(f"[zone] Opened new zone {symbol} {direction} ${initial_size:.2f} "
                  f"(width=${zone_width:.4f}, target=${profit_target:.4f})")

        except ValueError as e:
            print(f"[zone] Failed to open zone {symbol}: {e}")
            actions.append({"action": "error", "symbol": symbol, "error": str(e)})

    state["zones"] = zones
    save_zone_state(wallet, state)
    return actions

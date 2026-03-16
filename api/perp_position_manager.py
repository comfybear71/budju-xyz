# ==========================================
# Advanced Position Management System
# ==========================================
# Manages long-running winning perpetual positions with:
#   1. Pyramiding — add to winners with decreasing lot sizes
#   2. Re-entry — get back in after trailing stop exits
#   3. Funding rate management — track drag, avoid snapshots
#   4. Position flipping — cut and reverse at confirmed reversals
#   5. Core + satellite — long-term core with short-term satellites
#   6. Time-based management — evaluate on 4H/daily closes
#
# All logic runs from the 1-minute cron. Decision frequency is
# controlled per-concept (e.g., pyramiding checks every tick,
# time-based evaluates only on 4H candle closes).
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Optional, Dict, List

sys.path.insert(0, os.path.dirname(__file__))
from database import db
from perp_engine import (
    MARKETS, INITIAL_BALANCE, open_position, close_position,
    partial_close_position, perp_accounts, perp_positions,
    perp_trades, perp_funding, calculate_pnl, modify_position,
)
from perp_strategies import (
    get_price_series, ema, rsi, atr, bollinger_bands,
    perp_strategy_signals, COOLDOWN_MINUTES,
)

# ── Collections ──────────────────────────────────────────────────────────

perp_position_mgmt = db["perp_position_mgmt"]   # Per-position management state
perp_reentry_queue = db["perp_reentry_queue"]    # Positions waiting for re-entry
perp_flip_log = db["perp_flip_log"]              # Position flip audit log

# Indexes
perp_position_mgmt.create_index("position_id", unique=True)
perp_reentry_queue.create_index([("wallet", 1), ("symbol", 1)])
perp_reentry_queue.create_index("expires_at", expireAfterSeconds=0)
perp_flip_log.create_index([("wallet", 1), ("timestamp", -1)])


# ═══════════════════════════════════════════════════════════════════════
# 1. PYRAMIDING — Add to winners with decreasing lot sizes
# ═══════════════════════════════════════════════════════════════════════

PYRAMID_CONFIG = {
    "enabled": True,
    "max_additions": 3,          # Max times to add to a winner
    "size_decay": 0.5,           # Each add is 50% of previous add size
    "min_profit_atr": 2.0,       # Must be +2 ATR in profit before adding
    "atr_between_adds": 1.5,     # Price must move 1.5 ATR between adds
    "max_total_size_mult": 3.0,  # Cap total size at 3x original
    "move_stop_on_add": True,    # Tighten stop after each pyramid
    "stop_atr_mult": 2.0,        # New stop = new_avg_entry - 2*ATR
}


def check_pyramid_opportunity(position: Dict, mark_price: float,
                               prices: List[float]) -> Optional[Dict]:
    """Check if we should pyramid (add to) a winning position.

    Returns pyramid action dict if yes, None if no.
    """
    config = PYRAMID_CONFIG
    if not config["enabled"]:
        return None

    pos_id = str(position["_id"])
    wallet = position["account_id"]
    direction = position["direction"]
    entry = position["entry_price"]
    size_usd = position["size_usd"]

    # Get or create management state
    mgmt = perp_position_mgmt.find_one({"position_id": pos_id})
    if not mgmt:
        mgmt = {
            "position_id": pos_id,
            "pyramid_count": 0,
            "last_pyramid_price": entry,
            "last_pyramid_size": size_usd,
            "original_size": size_usd,
            "position_type": "core",  # core vs satellite
            "created_at": datetime.utcnow(),
        }
        perp_position_mgmt.insert_one(mgmt)

    pyramid_count = mgmt.get("pyramid_count", 0)
    if pyramid_count >= config["max_additions"]:
        return None

    # Check total size cap
    max_total = mgmt.get("original_size", size_usd) * config["max_total_size_mult"]
    if size_usd >= max_total:
        return None

    # Need ATR for distance checks
    if len(prices) < 15:
        return None
    atr_vals = atr(prices, 14)
    if not atr_vals:
        return None
    curr_atr = atr_vals[-1]
    if curr_atr <= 0:
        return None

    # Check profit threshold: must be +min_profit_atr ATR in profit
    if direction == "long":
        profit_atr = (mark_price - entry) / curr_atr
    else:
        profit_atr = (entry - mark_price) / curr_atr

    if profit_atr < config["min_profit_atr"]:
        return None

    # Check distance from last add
    last_price = mgmt.get("last_pyramid_price", entry)
    if direction == "long":
        distance_atr = (mark_price - last_price) / curr_atr
    else:
        distance_atr = (last_price - mark_price) / curr_atr

    if distance_atr < config["atr_between_adds"]:
        return None

    # Calculate new add size (decaying)
    last_size = mgmt.get("last_pyramid_size", size_usd)
    new_size = round(last_size * config["size_decay"], 2)
    if new_size < 50:
        return None

    # Calculate new stop if configured
    new_stop = None
    if config["move_stop_on_add"]:
        # New avg entry after adding
        total_size = size_usd + new_size
        avg_entry = (entry * size_usd + mark_price * new_size) / total_size
        if direction == "long":
            new_stop = avg_entry - (curr_atr * config["stop_atr_mult"])
        else:
            new_stop = avg_entry + (curr_atr * config["stop_atr_mult"])

    return {
        "action": "pyramid",
        "position_id": pos_id,
        "wallet": wallet,
        "symbol": position["symbol"],
        "direction": direction,
        "add_size_usd": new_size,
        "leverage": position["leverage"],
        "new_stop": new_stop,
        "pyramid_count": pyramid_count + 1,
        "atr": curr_atr,
    }


def execute_pyramid(action: Dict, mark_price: float) -> Optional[Dict]:
    """Execute a pyramid addition by opening a new linked position."""
    wallet = action["wallet"]
    pos_id = action["position_id"]

    # Check account balance
    account = perp_accounts.find_one({"wallet": wallet})
    if not account:
        return None
    margin_needed = action["add_size_usd"] / action["leverage"]
    if margin_needed > account.get("balance", 0) * 0.9:
        return None

    try:
        # Open the pyramid addition as a new position
        new_pos = open_position(
            wallet=wallet,
            symbol=action["symbol"],
            direction=action["direction"],
            leverage=action["leverage"],
            size_usd=action["add_size_usd"],
            entry_price=mark_price,
            stop_loss=action.get("new_stop"),
            take_profit=None,  # Inherits from original management
            entry_reason=f"[pyramid] add #{action['pyramid_count']} to {pos_id[:8]}",
        )

        # Update management state
        perp_position_mgmt.update_one(
            {"position_id": pos_id},
            {"$set": {
                "pyramid_count": action["pyramid_count"],
                "last_pyramid_price": mark_price,
                "last_pyramid_size": action["add_size_usd"],
                "last_pyramid_at": datetime.utcnow(),
            }}
        )

        # If we should move the stop on the original position
        if action.get("new_stop"):
            try:
                modify_position(pos_id, stop_loss=action["new_stop"])
            except Exception:
                pass  # Non-critical

        return {
            "action": "pyramid_added",
            "parent_position": pos_id,
            "new_position_id": new_pos.get("_id"),
            "add_size": action["add_size_usd"],
            "pyramid_count": action["pyramid_count"],
            "symbol": action["symbol"],
            "direction": action["direction"],
        }

    except Exception as e:
        print(f"[position-mgr] Pyramid error: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════
# 2. RE-ENTRY — Get back in after trailing stop exits
# ═══════════════════════════════════════════════════════════════════════

REENTRY_CONFIG = {
    "enabled": True,
    "cooldown_minutes": 60,       # Wait 1 hour after stop-out
    "max_reentries": 2,           # Max re-entries per original trade
    "size_reduction": 0.5,        # Re-enter at 50% of original size
    "require_trend_intact": True, # Must confirm trend still valid
    "require_price_recovery": True,  # Price must recover above exit price
    "adx_min": 25,                # Minimum ADX for trend strength
    "expiry_hours": 24,           # Re-entry opportunity expires after 24h
}


def queue_reentry(position: Dict, exit_price: float, exit_type: str):
    """Queue a position for potential re-entry after a trailing stop exit.

    Called when a position is closed by trailing_stop.
    """
    config = REENTRY_CONFIG
    if not config["enabled"]:
        return

    if exit_type not in ("trailing_stop", "stop_loss"):
        return  # Only re-enter after stop-based exits

    wallet = position["account_id"]
    symbol = position["symbol"]

    # Check if we've already re-entered too many times
    existing = perp_reentry_queue.count_documents({
        "wallet": wallet,
        "symbol": symbol,
        "original_entry_reason": position.get("entry_reason", ""),
        "status": {"$in": ["waiting", "executed"]},
    })
    if existing >= config["max_reentries"]:
        return

    reentry = {
        "wallet": wallet,
        "symbol": symbol,
        "direction": position["direction"],
        "original_entry_price": position["entry_price"],
        "exit_price": exit_price,
        "original_size_usd": position.get("size_usd", 0),
        "original_leverage": position.get("leverage", 3),
        "original_entry_reason": position.get("entry_reason", ""),
        "reentry_size_usd": round(position.get("size_usd", 0) * config["size_reduction"], 2),
        "reentry_count": existing + 1,
        "status": "waiting",
        "exit_type": exit_type,
        "queued_at": datetime.utcnow(),
        "cooldown_until": datetime.utcnow() + timedelta(minutes=config["cooldown_minutes"]),
        "expires_at": datetime.utcnow() + timedelta(hours=config["expiry_hours"]),
    }
    perp_reentry_queue.insert_one(reentry)
    print(f"[position-mgr] Queued re-entry for {symbol} {position['direction']} "
          f"(#{existing + 1}, size ${reentry['reentry_size_usd']:.0f})")


def check_reentry_opportunities(wallet: str, prices: Dict[str, float]) -> List[Dict]:
    """Check if any queued re-entries should fire.

    Returns list of actions taken.
    """
    config = REENTRY_CONFIG
    if not config["enabled"]:
        return []

    now = datetime.utcnow()
    waiting = list(perp_reentry_queue.find({
        "wallet": wallet,
        "status": "waiting",
        "cooldown_until": {"$lte": now},
    }))

    actions = []
    for entry in waiting:
        symbol = entry["symbol"]
        if symbol not in prices:
            continue

        mark_price = prices[symbol]
        direction = entry["direction"]
        exit_price = entry["exit_price"]

        # Check: price must recover above exit price (trend resuming)
        if config["require_price_recovery"]:
            if direction == "long" and mark_price <= exit_price:
                continue
            if direction == "short" and mark_price >= exit_price:
                continue

        # Check: trend still intact (using EMA alignment)
        if config["require_trend_intact"]:
            price_series = get_price_series(symbol, 60)
            if len(price_series) >= 50:
                ema_fast = ema(price_series, 9)
                ema_slow = ema(price_series, 21)
                if ema_fast and ema_slow:
                    if direction == "long" and ema_fast[-1] <= ema_slow[-1]:
                        continue  # Trend broken
                    if direction == "short" and ema_fast[-1] >= ema_slow[-1]:
                        continue

        # All checks passed — re-enter
        size_usd = entry["reentry_size_usd"]
        if size_usd < 50:
            perp_reentry_queue.update_one(
                {"_id": entry["_id"]},
                {"$set": {"status": "skipped", "reason": "size_too_small"}}
            )
            continue

        # Check balance
        account = perp_accounts.find_one({"wallet": wallet})
        if not account:
            continue
        leverage = entry["original_leverage"]
        margin = size_usd / leverage
        if margin > account.get("balance", 0) * 0.9:
            continue

        # Calculate SL/TP from ATR
        price_series = get_price_series(symbol, 30)
        atr_vals = atr(price_series, 14) if len(price_series) >= 15 else []
        curr_atr = atr_vals[-1] if atr_vals else mark_price * 0.02

        if direction == "long":
            stop_loss = mark_price - (curr_atr * 2.5)
            take_profit = mark_price + (curr_atr * 8.0)
        else:
            stop_loss = mark_price + (curr_atr * 2.5)
            take_profit = mark_price - (curr_atr * 8.0)

        try:
            pos = open_position(
                wallet=wallet,
                symbol=symbol,
                direction=direction,
                leverage=leverage,
                size_usd=size_usd,
                entry_price=mark_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                trailing_stop_pct=2.0,
                trailing_activation_pct=3.0,
                entry_reason=f"[reentry] #{entry['reentry_count']} after {entry['exit_type']}",
            )

            perp_reentry_queue.update_one(
                {"_id": entry["_id"]},
                {"$set": {
                    "status": "executed",
                    "executed_at": datetime.utcnow(),
                    "executed_price": mark_price,
                    "new_position_id": pos.get("_id"),
                }}
            )

            actions.append({
                "action": "reentry",
                "symbol": symbol,
                "direction": direction,
                "size_usd": size_usd,
                "reentry_count": entry["reentry_count"],
                "entry_price": mark_price,
            })

        except Exception as e:
            print(f"[position-mgr] Re-entry error for {symbol}: {e}")
            perp_reentry_queue.update_one(
                {"_id": entry["_id"]},
                {"$set": {"status": "failed", "error": str(e)}}
            )

    return actions


# ═══════════════════════════════════════════════════════════════════════
# 3. FUNDING RATE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════
# Perpetual futures charge funding every 8 hours. This tracks cumulative
# funding drag and flags positions where funding is eating profits.

FUNDING_CONFIG = {
    "enabled": True,
    "drag_warning_pct": 30,     # Warn when funding > 30% of profits
    "drag_close_pct": 50,       # Auto-close when funding > 50% of profits
    "high_rate_threshold": 0.05, # 0.05% per 8h = high funding
    "snapshot_hours": [0, 8, 16], # UTC hours when funding snapshots happen
    "annualized_max_pct": 50,   # If annualized funding > 50%, flag
}


def analyze_funding_drag(position: Dict) -> Dict:
    """Analyze funding drag on a position.

    Returns analysis dict with drag metrics and recommendations.
    """
    config = FUNDING_CONFIG
    cumulative_funding = position.get("cumulative_funding", 0)
    unrealized_pnl = position.get("unrealized_pnl", 0)
    size_usd = position.get("size_usd", 0)
    entry = position.get("entry_price", 0)
    opened_at = position.get("opened_at", datetime.utcnow())

    if isinstance(opened_at, str):
        opened_at = datetime.fromisoformat(opened_at)

    # Calculate position age
    age_hours = (datetime.utcnow() - opened_at).total_seconds() / 3600
    age_days = age_hours / 24

    # Funding drag as percentage of profits
    drag_pct = 0
    if unrealized_pnl > 0:
        drag_pct = (cumulative_funding / unrealized_pnl * 100) if unrealized_pnl != 0 else 0

    # Annualized funding cost estimate
    if age_hours > 0:
        daily_funding = (cumulative_funding / age_hours) * 24
        annualized = daily_funding * 365
        annualized_pct = (annualized / size_usd * 100) if size_usd > 0 else 0
    else:
        daily_funding = 0
        annualized = 0
        annualized_pct = 0

    # Determine recommendation
    recommendation = "hold"
    if drag_pct >= config["drag_close_pct"]:
        recommendation = "close_funding_drag"
    elif drag_pct >= config["drag_warning_pct"]:
        recommendation = "reduce_or_hedge"
    elif annualized_pct >= config["annualized_max_pct"]:
        recommendation = "review_funding_cost"

    return {
        "position_id": str(position.get("_id", "")),
        "symbol": position.get("symbol", ""),
        "cumulative_funding": round(cumulative_funding, 4),
        "unrealized_pnl": round(unrealized_pnl, 4),
        "funding_drag_pct": round(drag_pct, 2),
        "daily_funding_cost": round(daily_funding, 4),
        "annualized_funding": round(annualized, 2),
        "annualized_pct": round(annualized_pct, 2),
        "position_age_hours": round(age_hours, 1),
        "position_age_days": round(age_days, 1),
        "recommendation": recommendation,
    }


def check_funding_actions(position: Dict, mark_price: float) -> Optional[Dict]:
    """Check if a position needs funding-related action.

    Returns action dict or None.
    """
    config = FUNDING_CONFIG
    if not config["enabled"]:
        return None

    analysis = analyze_funding_drag(position)

    if analysis["recommendation"] == "close_funding_drag":
        return {
            "action": "close_funding_drag",
            "position_id": str(position["_id"]),
            "symbol": position["symbol"],
            "reason": f"Funding consumed {analysis['funding_drag_pct']:.1f}% of profits "
                      f"(${analysis['cumulative_funding']:.2f} of ${analysis['unrealized_pnl']:.2f})",
            "analysis": analysis,
        }

    return None


# ═══════════════════════════════════════════════════════════════════════
# 4. POSITION FLIPPING — Cut and reverse at confirmed reversals
# ═══════════════════════════════════════════════════════════════════════

FLIP_CONFIG = {
    "enabled": True,
    "min_position_age_minutes": 30,  # Don't flip positions < 30 min old
    "reverse_size_pct": 50,          # Start reverse at 50% of closed size
    "require_volume_confirmation": False,  # Simplified for paper
    "rsi_reversal_threshold": 50,    # RSI must cross 50 for flip
    "cooldown_minutes": 120,         # 2 hours between flips
}


def check_position_flip(position: Dict, mark_price: float,
                         prices: List[float]) -> Optional[Dict]:
    """Check if a position should be flipped (closed and reversed).

    Looks for strong reversal signals: EMA crossover + RSI crossing 50.
    Returns flip action dict or None.
    """
    config = FLIP_CONFIG
    if not config["enabled"]:
        return None

    direction = position["direction"]
    opened_at = position.get("opened_at", datetime.utcnow())
    if isinstance(opened_at, str):
        opened_at = datetime.fromisoformat(opened_at)

    # Don't flip very new positions
    age_min = (datetime.utcnow() - opened_at).total_seconds() / 60
    if age_min < config["min_position_age_minutes"]:
        return None

    # Check cooldown from last flip
    wallet = position["account_id"]
    symbol = position["symbol"]
    last_flip = perp_flip_log.find_one(
        {"wallet": wallet, "symbol": symbol},
        sort=[("timestamp", -1)]
    )
    if last_flip:
        flip_time = last_flip.get("timestamp", datetime.min)
        if isinstance(flip_time, str):
            flip_time = datetime.fromisoformat(flip_time)
        if (datetime.utcnow() - flip_time).total_seconds() / 60 < config["cooldown_minutes"]:
            return None

    # Need enough price data for indicators
    if len(prices) < 25:
        return None

    # Calculate indicators
    ema_fast = ema(prices, 9)
    ema_slow = ema(prices, 21)
    rsi_vals = rsi(prices, 14)

    if len(ema_fast) < 2 or len(ema_slow) < 2 or len(rsi_vals) < 2:
        return None

    curr_fast = ema_fast[-1]
    prev_fast = ema_fast[-2]
    curr_slow = ema_slow[-1]
    prev_slow = ema_slow[-2]
    curr_rsi = rsi_vals[-1]

    # Detect reversal based on current direction
    reversal_detected = False
    new_direction = None

    if direction == "long":
        # Long → Short reversal: EMA cross down + RSI < 50
        if prev_fast >= prev_slow and curr_fast < curr_slow and curr_rsi < config["rsi_reversal_threshold"]:
            reversal_detected = True
            new_direction = "short"
    else:
        # Short → Long reversal: EMA cross up + RSI > 50
        if prev_fast <= prev_slow and curr_fast > curr_slow and curr_rsi > config["rsi_reversal_threshold"]:
            reversal_detected = True
            new_direction = "long"

    if not reversal_detected:
        return None

    # Calculate reverse position size
    reverse_size = round(position["size_usd"] * config["reverse_size_pct"] / 100, 2)
    if reverse_size < 50:
        return None

    return {
        "action": "flip",
        "position_id": str(position["_id"]),
        "wallet": wallet,
        "symbol": symbol,
        "close_direction": direction,
        "new_direction": new_direction,
        "reverse_size_usd": reverse_size,
        "leverage": position["leverage"],
        "indicators": {
            "ema_fast": round(curr_fast, 6),
            "ema_slow": round(curr_slow, 6),
            "rsi": round(curr_rsi, 2),
        },
    }


def execute_flip(action: Dict, mark_price: float) -> Optional[Dict]:
    """Execute a position flip: close current, open reverse.

    Two-step: close first, then open reverse on next tick.
    For safety, we do both in one call but sequentially.
    """
    wallet = action["wallet"]
    pos_id = action["position_id"]

    try:
        # Step 1: Close the current position
        trade = close_position(
            pos_id, mark_price, "manual",
            f"Position flip: {action['close_direction']} → {action['new_direction']}"
        )

        pnl = trade.get("realized_pnl", 0)

        # Step 2: Open the reverse position
        # Calculate SL/TP from ATR
        price_series = get_price_series(action["symbol"], 30)
        atr_vals = atr(price_series, 14) if len(price_series) >= 15 else []
        curr_atr = atr_vals[-1] if atr_vals else mark_price * 0.02

        new_dir = action["new_direction"]
        if new_dir == "long":
            stop_loss = mark_price - (curr_atr * 2.5)
            take_profit = mark_price + (curr_atr * 8.0)
        else:
            stop_loss = mark_price + (curr_atr * 2.5)
            take_profit = mark_price - (curr_atr * 8.0)

        new_pos = open_position(
            wallet=wallet,
            symbol=action["symbol"],
            direction=new_dir,
            leverage=action["leverage"],
            size_usd=action["reverse_size_usd"],
            entry_price=mark_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            trailing_stop_pct=2.0,
            trailing_activation_pct=3.0,
            entry_reason=f"[flip] {action['close_direction']}→{new_dir} (RSI={action['indicators']['rsi']:.0f})",
        )

        # Log the flip
        perp_flip_log.insert_one({
            "wallet": wallet,
            "symbol": action["symbol"],
            "closed_direction": action["close_direction"],
            "new_direction": new_dir,
            "closed_pnl": pnl,
            "reverse_size": action["reverse_size_usd"],
            "price": mark_price,
            "indicators": action["indicators"],
            "timestamp": datetime.utcnow(),
        })

        return {
            "action": "position_flipped",
            "symbol": action["symbol"],
            "from_direction": action["close_direction"],
            "to_direction": new_dir,
            "closed_pnl": pnl,
            "reverse_size": action["reverse_size_usd"],
            "entry_price": mark_price,
        }

    except Exception as e:
        print(f"[position-mgr] Flip error: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════
# 5. CORE + SATELLITE — Long-term core with short-term satellites
# ═══════════════════════════════════════════════════════════════════════

SATELLITE_CONFIG = {
    "enabled": True,
    "dip_ema_period": 20,         # Buy when price dips below 20 EMA
    "trend_ema_period": 50,       # Only if 50 EMA is bullish
    "max_satellites": 2,          # Max active satellites per core
    "satellite_size_pct": 20,     # 20% of core size
    "satellite_tp_atr": 2.0,     # Close satellite at +2 ATR
    "satellite_sl_atr": 1.5,     # SL at 1.5 ATR
}


def check_satellite_opportunity(core_position: Dict, mark_price: float,
                                 prices: List[float]) -> Optional[Dict]:
    """Check if we should open a satellite trade around a core position.

    Satellites trade mean-reversion dips within the core's trend.
    """
    config = SATELLITE_CONFIG
    if not config["enabled"]:
        return None

    pos_id = str(core_position["_id"])
    wallet = core_position["account_id"]
    direction = core_position["direction"]
    symbol = core_position["symbol"]

    # Only satellite around profitable core positions
    pnl_pct = core_position.get("unrealized_pnl_pct", 0)
    if pnl_pct < 2.0:  # Core must be at least +2%
        return None

    # Check management state
    mgmt = perp_position_mgmt.find_one({"position_id": pos_id})
    if not mgmt:
        return None

    if mgmt.get("position_type") != "core":
        return None

    # Count existing satellites
    satellite_count = perp_positions.count_documents({
        "account_id": wallet,
        "symbol": symbol,
        "status": "open",
        "entry_reason": {"$regex": "\\[satellite\\]"},
    })
    if satellite_count >= config["max_satellites"]:
        return None

    if len(prices) < config["trend_ema_period"] + 2:
        return None

    # Calculate indicators
    dip_ema = ema(prices, config["dip_ema_period"])
    trend_ema_vals = ema(prices, config["trend_ema_period"])
    atr_vals = atr(prices, 14)

    if not dip_ema or not trend_ema_vals or not atr_vals:
        return None

    curr_dip_ema = dip_ema[-1]
    curr_trend_ema = trend_ema_vals[-1]
    curr_atr = atr_vals[-1]

    # Check for satellite entry
    should_enter = False

    if direction == "long":
        # Trend is bullish (price above 50 EMA) but dipped below 20 EMA
        if mark_price > curr_trend_ema and mark_price < curr_dip_ema:
            should_enter = True
    else:
        # Trend is bearish but rallied above 20 EMA
        if mark_price < curr_trend_ema and mark_price > curr_dip_ema:
            should_enter = True

    if not should_enter:
        return None

    # Calculate satellite size and levels
    core_size = core_position["size_usd"]
    sat_size = round(core_size * config["satellite_size_pct"] / 100, 2)
    if sat_size < 50:
        return None

    if direction == "long":
        stop_loss = mark_price - (curr_atr * config["satellite_sl_atr"])
        take_profit = mark_price + (curr_atr * config["satellite_tp_atr"])
    else:
        stop_loss = mark_price + (curr_atr * config["satellite_sl_atr"])
        take_profit = mark_price - (curr_atr * config["satellite_tp_atr"])

    return {
        "action": "satellite",
        "wallet": wallet,
        "symbol": symbol,
        "direction": direction,
        "size_usd": sat_size,
        "leverage": core_position["leverage"],
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "core_position_id": pos_id,
    }


def execute_satellite(action: Dict, mark_price: float) -> Optional[Dict]:
    """Open a satellite trade around a core position."""
    wallet = action["wallet"]

    # Check balance
    account = perp_accounts.find_one({"wallet": wallet})
    if not account:
        return None
    margin = action["size_usd"] / action["leverage"]
    if margin > account.get("balance", 0) * 0.9:
        return None

    try:
        pos = open_position(
            wallet=wallet,
            symbol=action["symbol"],
            direction=action["direction"],
            leverage=action["leverage"],
            size_usd=action["size_usd"],
            entry_price=mark_price,
            stop_loss=action["stop_loss"],
            take_profit=action["take_profit"],
            entry_reason=f"[satellite] dip trade around {action['core_position_id'][:8]}",
        )

        # Mark as satellite in management state
        new_pos_id = pos.get("_id")
        if new_pos_id:
            perp_position_mgmt.update_one(
                {"position_id": new_pos_id},
                {"$set": {
                    "position_id": new_pos_id,
                    "position_type": "satellite",
                    "core_position_id": action["core_position_id"],
                    "created_at": datetime.utcnow(),
                }},
                upsert=True,
            )

        return {
            "action": "satellite_opened",
            "symbol": action["symbol"],
            "direction": action["direction"],
            "size_usd": action["size_usd"],
            "core_position": action["core_position_id"],
        }

    except Exception as e:
        print(f"[position-mgr] Satellite error: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════
# 6. TIME-BASED MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════

TIME_CONFIG = {
    "enabled": True,
    "max_hold_days": 14,                # Close underperformers after 14 days
    "min_expected_profit_pct": 2.0,     # Must be +2% after max_hold_days
    "evaluate_on_4h": True,             # Only evaluate on 4H candle closes
    "weekend_reduce_pct": 0,            # 0 = don't reduce on weekends (crypto 24/7)
    "stale_position_hours": 72,         # Flag positions with no profit movement for 72h
}


def check_time_based_actions(position: Dict, mark_price: float) -> Optional[Dict]:
    """Check if a position needs time-based management action.

    Evaluates:
    - Position age vs max hold days
    - Stale positions (no profit movement)
    - 4H candle alignment (only acts on 4H boundaries)
    """
    config = TIME_CONFIG
    if not config["enabled"]:
        return None

    opened_at = position.get("opened_at", datetime.utcnow())
    if isinstance(opened_at, str):
        opened_at = datetime.fromisoformat(opened_at)

    age_hours = (datetime.utcnow() - opened_at).total_seconds() / 3600
    age_days = age_hours / 24
    pnl_pct = position.get("unrealized_pnl_pct", 0)

    # Only evaluate on 4H candle boundaries (0, 4, 8, 12, 16, 20 UTC)
    if config["evaluate_on_4h"]:
        now = datetime.utcnow()
        if now.hour % 4 != 0 or now.minute > 1:
            return None  # Not a 4H boundary

    # Time-based exit: held too long with poor performance
    if age_days >= config["max_hold_days"] and pnl_pct < config["min_expected_profit_pct"]:
        return {
            "action": "time_exit",
            "position_id": str(position["_id"]),
            "symbol": position["symbol"],
            "direction": position["direction"],
            "reason": f"Held {age_days:.1f} days with only {pnl_pct:.1f}% profit "
                      f"(minimum {config['min_expected_profit_pct']}% expected)",
            "age_days": round(age_days, 1),
            "pnl_pct": round(pnl_pct, 2),
        }

    # Stale position check: no meaningful profit movement
    if age_hours >= config["stale_position_hours"]:
        mfe = position.get("max_favorable_excursion", 0)
        if mfe < position.get("size_usd", 0) * 0.01:  # MFE < 1% of size
            return {
                "action": "stale_position_warning",
                "position_id": str(position["_id"]),
                "symbol": position["symbol"],
                "reason": f"Position stale: {age_hours:.0f}h with MFE ${mfe:.2f}",
            }

    return None


# ═══════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATOR — Called by perp-cron.py every minute
# ═══════════════════════════════════════════════════════════════════════

def run_position_manager(wallet: str, prices: Dict[str, float]) -> List[Dict]:
    """Run all position management checks for an account.

    Called every minute by the cron. Checks all open positions for:
    - Pyramid opportunities
    - Funding drag
    - Time-based exits
    - Satellite opportunities
    - Position flips

    Also checks re-entry queue for stopped-out positions.

    Returns list of actions taken.
    """
    account = perp_accounts.find_one({"wallet": wallet})
    if not account:
        return []

    if account.get("kill_switch") or account.get("trading_paused"):
        return []

    # Must have auto-trading enabled
    if not account.get("auto_trading_enabled"):
        return []

    open_positions = list(perp_positions.find({
        "account_id": wallet,
        "status": "open",
    }))

    if not open_positions and not perp_reentry_queue.count_documents({"wallet": wallet, "status": "waiting"}):
        return []

    actions = []

    # Process each open position
    for pos in open_positions:
        symbol = pos["symbol"]
        if symbol not in prices:
            continue

        mark_price = prices[symbol]
        price_series = get_price_series(symbol, 60)

        # 1. Check pyramiding
        try:
            pyramid = check_pyramid_opportunity(pos, mark_price, price_series)
            if pyramid:
                result = execute_pyramid(pyramid, mark_price)
                if result:
                    actions.append(result)
        except Exception as e:
            print(f"[position-mgr] Pyramid check error: {e}")

        # 2. Check funding drag
        try:
            funding_action = check_funding_actions(pos, mark_price)
            if funding_action and funding_action["action"] == "close_funding_drag":
                try:
                    close_position(
                        funding_action["position_id"], mark_price,
                        "manual", funding_action["reason"]
                    )
                    actions.append(funding_action)
                except Exception as e:
                    print(f"[position-mgr] Funding close error: {e}")
        except Exception as e:
            print(f"[position-mgr] Funding check error: {e}")

        # 3. Check time-based management
        try:
            time_action = check_time_based_actions(pos, mark_price)
            if time_action:
                if time_action["action"] == "time_exit":
                    try:
                        close_position(
                            time_action["position_id"], mark_price,
                            "manual", time_action["reason"]
                        )
                        actions.append(time_action)
                    except Exception as e:
                        print(f"[position-mgr] Time exit error: {e}")
                else:
                    # Just log warnings
                    actions.append(time_action)
        except Exception as e:
            print(f"[position-mgr] Time check error: {e}")

        # 4. Check satellite opportunities (only for core positions)
        try:
            satellite = check_satellite_opportunity(pos, mark_price, price_series)
            if satellite:
                result = execute_satellite(satellite, mark_price)
                if result:
                    actions.append(result)
        except Exception as e:
            print(f"[position-mgr] Satellite check error: {e}")

        # 5. Check position flip
        try:
            flip = check_position_flip(pos, mark_price, price_series)
            if flip:
                result = execute_flip(flip, mark_price)
                if result:
                    actions.append(result)
        except Exception as e:
            print(f"[position-mgr] Flip check error: {e}")

    # 6. Check re-entry queue (independent of open positions)
    try:
        reentries = check_reentry_opportunities(wallet, prices)
        actions.extend(reentries)
    except Exception as e:
        print(f"[position-mgr] Re-entry check error: {e}")

    return actions


# ═══════════════════════════════════════════════════════════════════════
# API HELPERS
# ═══════════════════════════════════════════════════════════════════════

def get_position_management_status(wallet: str) -> Dict:
    """Get position management status for display."""
    open_positions = list(perp_positions.find({"account_id": wallet, "status": "open"}))

    # Funding analysis for all positions
    funding_analyses = []
    for pos in open_positions:
        analysis = analyze_funding_drag(pos)
        funding_analyses.append(analysis)

    # Management state
    mgmt_states = {}
    for pos in open_positions:
        pos_id = str(pos["_id"])
        mgmt = perp_position_mgmt.find_one({"position_id": pos_id})
        if mgmt:
            mgmt.pop("_id", None)
            mgmt_states[pos_id] = mgmt

    # Re-entry queue
    reentry_queue = list(perp_reentry_queue.find(
        {"wallet": wallet, "status": "waiting"},
        {"_id": 0}
    ))
    for r in reentry_queue:
        for key in ("queued_at", "cooldown_until", "expires_at"):
            if key in r and isinstance(r[key], datetime):
                r[key] = r[key].isoformat()

    # Recent flips
    recent_flips = list(perp_flip_log.find(
        {"wallet": wallet},
        {"_id": 0}
    ).sort("timestamp", -1).limit(10))
    for f in recent_flips:
        if isinstance(f.get("timestamp"), datetime):
            f["timestamp"] = f["timestamp"].isoformat()

    # Config
    configs = {
        "pyramid": PYRAMID_CONFIG,
        "reentry": REENTRY_CONFIG,
        "funding": FUNDING_CONFIG,
        "flip": FLIP_CONFIG,
        "satellite": SATELLITE_CONFIG,
        "time": TIME_CONFIG,
    }

    return {
        "funding_analysis": funding_analyses,
        "management_states": mgmt_states,
        "reentry_queue": reentry_queue,
        "recent_flips": recent_flips,
        "configs": configs,
        "position_count": len(open_positions),
    }


def update_position_manager_config(section: str, updates: Dict) -> Dict:
    """Update a config section. Returns the updated config."""
    config_map = {
        "pyramid": PYRAMID_CONFIG,
        "reentry": REENTRY_CONFIG,
        "funding": FUNDING_CONFIG,
        "flip": FLIP_CONFIG,
        "satellite": SATELLITE_CONFIG,
        "time": TIME_CONFIG,
    }

    if section not in config_map:
        raise ValueError(f"Unknown config section: {section}. Available: {list(config_map.keys())}")

    config = config_map[section]
    for key, value in updates.items():
        if key in config:
            config[key] = value

    return {section: config}


def mark_position_as_core(position_id: str) -> Dict:
    """Explicitly mark a position as a core position (enables satellites)."""
    perp_position_mgmt.update_one(
        {"position_id": position_id},
        {"$set": {
            "position_id": position_id,
            "position_type": "core",
            "pyramid_count": 0,
            "created_at": datetime.utcnow(),
        }},
        upsert=True,
    )
    return {"position_id": position_id, "type": "core"}

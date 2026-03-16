# ==========================================
# Pending Limit/Stop Order System
# ==========================================
# Supports 4 order types:
#   - limit_buy:  Triggers when price drops TO or BELOW trigger (buy the dip)
#   - limit_sell: Triggers when price rises TO or ABOVE trigger (sell the rip)
#   - buy_stop:   Triggers when price rises TO or ABOVE trigger (breakout long)
#   - sell_stop:  Triggers when price drops TO or BELOW trigger (breakdown short)
#
# Orders expire after expiry_hours (default 24h). The cron checks pending
# orders every minute and executes them via open_position() when triggered.
# ==========================================

import os
import sys
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from bson import ObjectId

sys.path.insert(0, os.path.dirname(__file__))
from database import db
from perp_engine import open_position, get_open_positions, MAX_OPEN_POSITIONS, MARKETS

# ── Collection ───────────────────────────────────────────────────────────

perp_pending_orders = db["perp_pending_orders"]

# Indexes (idempotent)
perp_pending_orders.create_index([("account_id", 1), ("status", 1)])
perp_pending_orders.create_index([("symbol", 1), ("status", 1)])

# ── Constants ────────────────────────────────────────────────────────────

VALID_ORDER_TYPES = ("limit_buy", "limit_sell", "buy_stop", "sell_stop")
VALID_STATUSES = ("pending", "filled", "cancelled", "expired")
DEFAULT_EXPIRY_HOURS = 24
MAX_PENDING_ORDERS = 10  # Max pending orders per wallet


# ── Place Order ──────────────────────────────────────────────────────────

def place_pending_order(wallet: str, symbol: str, order_type: str,
                        trigger_price: float, size_usd: float,
                        leverage: int, stop_loss: float = None,
                        take_profit: float = None,
                        trailing_stop_pct: float = None,
                        entry_reason: str = "",
                        expiry_hours: int = DEFAULT_EXPIRY_HOURS) -> Dict:
    """Place a new pending order that waits for price to hit trigger."""
    # Validate order type
    if order_type not in VALID_ORDER_TYPES:
        raise ValueError(
            f"Invalid order_type '{order_type}'. "
            f"Must be one of: {', '.join(VALID_ORDER_TYPES)}"
        )

    # Validate market
    if symbol not in MARKETS:
        raise ValueError(
            f"Unsupported market: {symbol}. "
            f"Available: {list(MARKETS.keys())}"
        )

    # Validate numeric inputs
    if trigger_price <= 0:
        raise ValueError("trigger_price must be positive")
    if size_usd <= 0:
        raise ValueError("size_usd must be positive")
    if leverage < 2:
        raise ValueError("leverage must be at least 2")

    # Check pending order limit
    active_count = get_pending_order_count(wallet)
    if active_count >= MAX_PENDING_ORDERS:
        raise ValueError(
            f"Max {MAX_PENDING_ORDERS} pending orders allowed. "
            f"Cancel some first."
        )

    # Determine direction from order type
    direction = "long" if order_type in ("limit_buy", "buy_stop") else "short"

    # Validate SL/TP relative to trigger and direction
    if stop_loss is not None:
        if direction == "long" and stop_loss >= trigger_price:
            raise ValueError(
                f"Long stop loss (${stop_loss}) must be below "
                f"trigger price (${trigger_price})"
            )
        if direction == "short" and stop_loss <= trigger_price:
            raise ValueError(
                f"Short stop loss (${stop_loss}) must be above "
                f"trigger price (${trigger_price})"
            )

    if take_profit is not None:
        if direction == "long" and take_profit <= trigger_price:
            raise ValueError(
                f"Long take profit (${take_profit}) must be above "
                f"trigger price (${trigger_price})"
            )
        if direction == "short" and take_profit >= trigger_price:
            raise ValueError(
                f"Short take profit (${take_profit}) must be below "
                f"trigger price (${trigger_price})"
            )

    now = datetime.utcnow()
    order = {
        "account_id": wallet,
        "symbol": symbol,
        "order_type": order_type,
        "direction": direction,
        "trigger_price": trigger_price,
        "size_usd": size_usd,
        "leverage": leverage,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "trailing_stop_pct": trailing_stop_pct,
        "entry_reason": entry_reason,
        "status": "pending",
        "created_at": now,
        "expires_at": now + timedelta(hours=expiry_hours),
        "filled_at": None,
        "cancelled_at": None,
        "cancel_reason": None,
        "filled_position_id": None,
    }

    result = perp_pending_orders.insert_one(order)
    order["_id"] = str(result.inserted_id)
    return _format_order(order)


# ── Check & Execute ──────────────────────────────────────────────────────

def check_and_execute_pending_orders(symbol: str, current_price: float,
                                      high_price: float = None,
                                      low_price: float = None) -> List[Dict]:
    """Check all pending orders for a symbol against current price and execute if triggered.

    Trigger logic:
    - limit_buy:  current_price <= trigger_price (price dropped to buy level)
    - limit_sell: current_price >= trigger_price (price rose to sell level)
    - buy_stop:   current_price >= trigger_price (breakout above level)
    - sell_stop:  current_price <= trigger_price (breakdown below level)

    Also checks high_price/low_price for wick catching between cron ticks.

    When triggered:
    1. Calls open_position() from perp_engine
    2. Updates order status to "filled" with filled_at timestamp
    3. Returns list of filled orders
    """
    pending = list(perp_pending_orders.find({
        "symbol": symbol,
        "status": "pending",
    }))

    if not pending:
        return []

    filled = []

    for order in pending:
        order_type = order["order_type"]
        trigger = order["trigger_price"]
        triggered = False

        # Check current price
        if order_type == "limit_buy" and current_price <= trigger:
            triggered = True
        elif order_type == "limit_sell" and current_price >= trigger:
            triggered = True
        elif order_type == "buy_stop" and current_price >= trigger:
            triggered = True
        elif order_type == "sell_stop" and current_price <= trigger:
            triggered = True

        # Check high/low for wick catching (price may have passed through
        # the trigger between cron ticks)
        if not triggered and high_price is not None:
            if order_type == "limit_sell" and high_price >= trigger:
                triggered = True
            elif order_type == "buy_stop" and high_price >= trigger:
                triggered = True

        if not triggered and low_price is not None:
            if order_type == "limit_buy" and low_price <= trigger:
                triggered = True
            elif order_type == "sell_stop" and low_price <= trigger:
                triggered = True

        if not triggered:
            continue

        # Attempt to execute the order via open_position()
        try:
            position = open_position(
                wallet=order["account_id"],
                symbol=order["symbol"],
                direction=order["direction"],
                leverage=order["leverage"],
                size_usd=order["size_usd"],
                entry_price=current_price,
                stop_loss=order.get("stop_loss"),
                take_profit=order.get("take_profit"),
                trailing_stop_pct=order.get("trailing_stop_pct"),
                entry_reason=order.get("entry_reason", "") or f"pending_{order_type}",
            )

            # Mark order as filled
            now = datetime.utcnow()
            perp_pending_orders.update_one(
                {"_id": order["_id"]},
                {"$set": {
                    "status": "filled",
                    "filled_at": now,
                    "filled_position_id": position.get("_id"),
                    "filled_price": current_price,
                }}
            )

            order["status"] = "filled"
            order["filled_at"] = now
            order["filled_position_id"] = position.get("_id")
            order["filled_price"] = current_price
            filled.append(_format_order(order))

            print(
                f"[pending-orders] FILLED {order_type} {symbol} "
                f"@ ${current_price:.4f} (trigger ${trigger:.4f}) "
                f"for {order['account_id'][:8]}..."
            )

        except Exception as e:
            # Order couldn't be executed (e.g. max positions, insufficient
            # balance). Log but don't cancel — user may free up capacity.
            print(
                f"[pending-orders] Failed to execute {order_type} {symbol} "
                f"for {order['account_id'][:8]}: {e}"
            )

    return filled


# ── Cancel ───────────────────────────────────────────────────────────────

def cancel_pending_order(order_id: str, reason: str = "manual") -> Dict:
    """Cancel a pending order."""
    order = perp_pending_orders.find_one({
        "_id": ObjectId(order_id),
        "status": "pending",
    })
    if not order:
        raise ValueError("Pending order not found or already cancelled/filled")

    now = datetime.utcnow()
    perp_pending_orders.update_one(
        {"_id": ObjectId(order_id)},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now,
            "cancel_reason": reason,
        }}
    )

    order["status"] = "cancelled"
    order["cancelled_at"] = now
    order["cancel_reason"] = reason
    return _format_order(order)


def cancel_all_pending_orders(wallet: str, symbol: str = None) -> Dict:
    """Cancel all pending orders for a wallet, optionally filtered by symbol."""
    query = {"account_id": wallet, "status": "pending"}
    if symbol:
        query["symbol"] = symbol

    now = datetime.utcnow()
    result = perp_pending_orders.update_many(
        query,
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now,
            "cancel_reason": "cancel_all",
        }}
    )

    return {
        "cancelled": result.modified_count,
        "wallet": wallet,
        "symbol": symbol,
    }


# ── Query ────────────────────────────────────────────────────────────────

def get_pending_orders(wallet: str, symbol: str = None,
                       status: str = "pending") -> List[Dict]:
    """Get pending orders for a wallet."""
    query = {"account_id": wallet}
    if status:
        query["status"] = status
    if symbol:
        query["symbol"] = symbol

    orders = list(
        perp_pending_orders.find(query).sort("created_at", -1)
    )
    return [_format_order(o) for o in orders]


def get_pending_order_count(wallet: str) -> int:
    """Count active pending orders for position limit checks."""
    return perp_pending_orders.count_documents({
        "account_id": wallet,
        "status": "pending",
    })


# ── Expiry ───────────────────────────────────────────────────────────────

def expire_stale_orders() -> int:
    """Mark expired orders (past expires_at). Called by cron. Returns count expired."""
    now = datetime.utcnow()
    result = perp_pending_orders.update_many(
        {
            "status": "pending",
            "expires_at": {"$lte": now},
        },
        {"$set": {
            "status": "expired",
            "cancelled_at": now,
            "cancel_reason": "expired",
        }}
    )
    return result.modified_count


# ── Formatting ───────────────────────────────────────────────────────────

def _format_order(order: Dict) -> Dict:
    """Format order for API response."""
    o = dict(order)
    o["_id"] = str(o["_id"]) if "_id" in o else None
    for key in ("created_at", "expires_at", "filled_at", "cancelled_at"):
        if key in o and isinstance(o[key], datetime):
            o[key] = o[key].isoformat()
    return o

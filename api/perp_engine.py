# ==========================================
# Perpetual Trading Engine (Paper + Live)
# ==========================================
# Supports two modes:
#   - "paper": Simulated trading with $10K virtual balance (default)
#   - "live":  Real trading via Drift Protocol on Solana
#
# Paper fee model mirrors Jupiter Perps:
#   - Open/close: 0.06% of position size
#   - Borrow fee: 0.01%/hr base (simplified from utilization-based)
#   - Slippage: 0.05-0.15% based on size
#
# Live mode:
#   - Routes orders to Drift Protocol via perp_exchange.py
#   - Real fees/slippage handled by exchange
#   - Local DB still tracks positions for monitoring, metrics, alerts
#   - Safety: kill switch, max exposure limits, position reconciliation
#
# Liquidation (paper):
#   Long:  liq = entry * (1 - 1/leverage + mm)
#   Short: liq = entry * (1 + 1/leverage - mm)
#   Maintenance margin: min(5%, 50%/leverage) — scales with leverage
#   to prevent liq price being above entry at high leverage
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from bson import ObjectId

sys.path.insert(0, os.path.dirname(__file__))
from database import db, is_admin, ADMIN_WALLETS

# ── Collections ──────────────────────────────────────────────────────────

perp_accounts = db["perp_accounts"]
perp_positions = db["perp_positions"]
perp_orders = db["perp_orders"]
perp_trades = db["perp_trades"]
perp_equity = db["perp_equity"]
perp_funding = db["perp_funding"]

# Indexes (idempotent)
perp_accounts.create_index("wallet", unique=True)
perp_positions.create_index([("account_id", 1), ("status", 1)])
perp_positions.create_index([("status", 1), ("symbol", 1)])
perp_orders.create_index([("account_id", 1), ("created_at", -1)])
perp_trades.create_index([("account_id", 1), ("exit_time", -1)])
perp_trades.create_index([("account_id", 1), ("symbol", 1)])
perp_equity.create_index([("account_id", 1), ("timestamp", -1)])
perp_funding.create_index([("position_id", 1), ("timestamp", -1)])

# ── Constants ────────────────────────────────────────────────────────────

INITIAL_BALANCE = 10_000.0       # $10K USDC starting balance
OPEN_CLOSE_FEE_PCT = 0.0006     # 0.06% (mirrors Jupiter)
BORROW_FEE_PCT_HR = 0.0001      # 0.01%/hr base borrow fee
MAINTENANCE_MARGIN_PCT = 0.05   # 5% maintenance margin
MAX_LEVERAGE = 50                # Max 50x
MIN_LEVERAGE = 2                 # Min 2x
MAX_OPEN_POSITIONS = 5           # Max concurrent positions
MAX_POSITION_PCT = 0.50          # Max 50% of equity per position
DAILY_LOSS_LIMIT_PCT = 0.20     # 20% daily loss → pause

# ── Live Trading Safety Limits ─────────────────────────────────────────
LIVE_MAX_TOTAL_EXPOSURE = 50_000.0   # Max total notional across all positions
LIVE_MAX_SINGLE_POSITION = 10_000.0  # Max single position size
LIVE_MAX_LEVERAGE = 20               # Cap leverage for live (conservative)
LIVE_MAX_OPEN_POSITIONS = 3          # Fewer concurrent positions for live

# Supported markets
MARKETS = {
    "SOL-PERP":  {"base": "solana",   "symbol": "SOL",  "max_leverage": 50, "tick": 0.01},
    "BTC-PERP":  {"base": "bitcoin",  "symbol": "BTC",  "max_leverage": 50, "tick": 0.1},
    "ETH-PERP":  {"base": "ethereum", "symbol": "ETH",  "max_leverage": 50, "tick": 0.01},
    "DOGE-PERP": {"base": "dogecoin", "symbol": "DOGE", "max_leverage": 20, "tick": 0.00001},
    "AVAX-PERP": {"base": "avalanche-2", "symbol": "AVAX", "max_leverage": 20, "tick": 0.01},
    "LINK-PERP": {"base": "chainlink", "symbol": "LINK", "max_leverage": 20, "tick": 0.001},
    "SUI-PERP":  {"base": "sui",      "symbol": "SUI",  "max_leverage": 20, "tick": 0.001},
    "JUP-PERP":  {"base": "jupiter-exchange-solana", "symbol": "JUP", "max_leverage": 10, "tick": 0.0001},
    "WIF-PERP":  {"base": "dogwifcoin", "symbol": "WIF", "max_leverage": 10, "tick": 0.0001},
    "BONK-PERP": {"base": "bonk",     "symbol": "BONK", "max_leverage": 10, "tick": 0.00000001},
}

# CoinGecko IDs for batch price fetch
COINGECKO_IDS = ",".join(m["base"] for m in MARKETS.values())


# ── Account Management ───────────────────────────────────────────────────

def get_or_create_account(wallet: str) -> Dict:
    """Get existing account or create one with $10K paper balance."""
    account = perp_accounts.find_one({"wallet": wallet})
    if account:
        # Migration: ensure trading_mode field exists
        if "trading_mode" not in account:
            perp_accounts.update_one(
                {"wallet": wallet},
                {"$set": {"trading_mode": "paper", "kill_switch": False}}
            )
            account["trading_mode"] = "paper"
            account["kill_switch"] = False
        return _format_account(account)

    account = {
        "wallet": wallet,
        "balance": INITIAL_BALANCE,
        "equity": INITIAL_BALANCE,
        "unrealized_pnl": 0.0,
        "realized_pnl": 0.0,
        "total_funding_paid": 0.0,
        "total_fees_paid": 0.0,
        "total_trades": 0,
        "winning_trades": 0,
        "losing_trades": 0,
        "max_drawdown": 0.0,
        "peak_equity": INITIAL_BALANCE,
        "daily_pnl": 0.0,
        "daily_pnl_reset": datetime.utcnow(),
        "trading_paused": False,
        "trading_mode": "paper",       # "paper" or "live"
        "kill_switch": False,           # Emergency stop all trading
        "live_max_exposure": LIVE_MAX_TOTAL_EXPOSURE,
        "live_max_position": LIVE_MAX_SINGLE_POSITION,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    perp_accounts.insert_one(account)
    return _format_account(account)


def set_trading_mode(wallet: str, mode: str) -> Dict:
    """Switch between 'paper' and 'live' trading mode."""
    if mode not in ("paper", "live"):
        raise ValueError("Mode must be 'paper' or 'live'")

    account = get_or_create_account(wallet)

    # Safety: check for open positions before switching modes
    open_count = perp_positions.count_documents({"account_id": wallet, "status": "open"})
    if open_count > 0:
        raise ValueError(
            f"Cannot switch modes with {open_count} open positions. "
            "Close all positions first."
        )

    if mode == "live":
        # Verify Drift is configured
        from perp_exchange import is_live_ready
        status = is_live_ready()
        if not status["ready"]:
            raise ValueError(
                f"Live trading not ready: {', '.join(status['issues'])}"
            )

    perp_accounts.update_one(
        {"wallet": wallet},
        {"$set": {"trading_mode": mode, "updated_at": datetime.utcnow()}}
    )

    return get_or_create_account(wallet)


def set_kill_switch(wallet: str, active: bool) -> Dict:
    """Activate or deactivate the kill switch.
    When active: closes all live positions immediately and pauses trading.
    """
    account = get_or_create_account(wallet)

    if active and account.get("trading_mode") == "live":
        # Close all exchange positions immediately
        try:
            from perp_exchange import emergency_close_all
            close_result = emergency_close_all()
        except Exception as e:
            close_result = {"error": str(e)}

        # Also close all local DB positions
        open_positions = list(perp_positions.find({"account_id": wallet, "status": "open"}))
        for pos in open_positions:
            try:
                close_position(str(pos["_id"]), pos.get("mark_price", pos["entry_price"]),
                              "kill_switch", "Emergency kill switch activated")
            except Exception:
                pass

        perp_accounts.update_one(
            {"wallet": wallet},
            {"$set": {
                "kill_switch": True,
                "trading_paused": True,
                "updated_at": datetime.utcnow(),
            }}
        )

        return {**get_or_create_account(wallet), "exchange_close_result": close_result}

    perp_accounts.update_one(
        {"wallet": wallet},
        {"$set": {
            "kill_switch": active,
            "trading_paused": active,
            "updated_at": datetime.utcnow(),
        }}
    )
    return get_or_create_account(wallet)


def reset_account(wallet: str) -> Dict:
    """Reset paper account to initial state."""
    perp_positions.delete_many({"account_id": wallet})
    perp_orders.delete_many({"account_id": wallet})
    perp_trades.delete_many({"account_id": wallet})
    perp_equity.delete_many({"account_id": wallet})
    perp_funding.delete_many({"account_id": wallet})
    perp_accounts.delete_one({"wallet": wallet})
    return get_or_create_account(wallet)


def _format_account(acc: Dict) -> Dict:
    """Format account for API response."""
    a = dict(acc)
    a.pop("_id", None)
    for key in ("created_at", "updated_at", "daily_pnl_reset"):
        if key in a and isinstance(a[key], datetime):
            a[key] = a[key].isoformat()
    return a


# ── Fee & Slippage Simulation ────────────────────────────────────────────

def calculate_fees(size_usd: float) -> float:
    """Opening or closing fee: 0.06% of notional size."""
    return size_usd * OPEN_CLOSE_FEE_PCT


def simulate_slippage(size_usd: float, price: float) -> float:
    """Simulate slippage based on position size. Returns adjusted price."""
    if size_usd < 1000:
        slip = 0.0005  # 0.05%
    elif size_usd < 5000:
        slip = 0.001   # 0.1%
    else:
        slip = 0.0015  # 0.15%
    return slip


def calculate_borrow_fee(size_usd: float, hours: float) -> float:
    """Hourly borrow fee (simplified — real Jupiter uses utilization)."""
    return size_usd * BORROW_FEE_PCT_HR * hours


# ── Liquidation ──────────────────────────────────────────────────────────

def calculate_maintenance_margin(leverage: int) -> float:
    """Scale maintenance margin with leverage like real exchanges.
    Higher leverage gets lower maintenance margin to prevent
    liquidation price being above entry (which happens when
    maintenance_margin > 1/leverage, i.e. leverage > 20 at 5%).
    """
    return min(MAINTENANCE_MARGIN_PCT, 0.5 / leverage)


def calculate_liquidation_price(entry_price: float, leverage: int,
                                 direction: str) -> float:
    """Calculate liquidation price for a position."""
    mm = calculate_maintenance_margin(leverage)
    if direction == "long":
        return entry_price * (1 - 1 / leverage + mm)
    else:
        return entry_price * (1 + 1 / leverage - mm)


def check_liquidation(position: Dict, mark_price: float) -> bool:
    """Check if position should be liquidated at current price."""
    liq_price = position.get("liquidation_price", 0)
    if position["direction"] == "long":
        return mark_price <= liq_price
    else:
        return mark_price >= liq_price


# ── P&L Calculation ─────────────────────────────────────────────────────

def calculate_pnl(entry_price: float, mark_price: float,
                  size_usd: float, direction: str) -> Tuple[float, float]:
    """Calculate unrealized P&L and P&L percentage."""
    if direction == "long":
        pnl_pct = (mark_price - entry_price) / entry_price
    else:
        pnl_pct = (entry_price - mark_price) / entry_price

    pnl_usd = size_usd * pnl_pct
    return pnl_usd, pnl_pct * 100


# ── Position Management ─────────────────────────────────────────────────

def open_position(wallet: str, symbol: str, direction: str, leverage: int,
                  size_usd: float, entry_price: float,
                  stop_loss: float = None, take_profit: float = None,
                  trailing_stop_pct: float = None,
                  entry_reason: str = "") -> Dict:
    """Open a new position (paper or live depending on account mode)."""
    account = get_or_create_account(wallet)
    is_live = account.get("trading_mode") == "live"

    # Validations
    if account.get("kill_switch"):
        raise ValueError("Kill switch is active. Deactivate it before trading.")
    if account.get("trading_paused"):
        raise ValueError("Trading paused — daily loss limit reached. Reset or wait until tomorrow.")

    market = MARKETS.get(symbol)
    if not market:
        raise ValueError(f"Unsupported market: {symbol}. Available: {list(MARKETS.keys())}")

    if direction not in ("long", "short"):
        raise ValueError("Direction must be 'long' or 'short'")

    # Apply different limits for live vs paper
    max_lev = LIVE_MAX_LEVERAGE if is_live else market["max_leverage"]
    max_positions = LIVE_MAX_OPEN_POSITIONS if is_live else MAX_OPEN_POSITIONS
    leverage = max(MIN_LEVERAGE, min(leverage, max_lev))

    open_count = perp_positions.count_documents({"account_id": wallet, "status": "open"})
    if open_count >= max_positions:
        raise ValueError(f"Max {max_positions} open positions allowed" +
                         (" (live mode limit)" if is_live else ""))

    equity = account["equity"]
    max_size = equity * MAX_POSITION_PCT
    if is_live:
        max_size = min(max_size, account.get("live_max_position", LIVE_MAX_SINGLE_POSITION))
    if size_usd > max_size:
        raise ValueError(f"Max position size is ${max_size:.2f}" +
                         (" (live safety limit)" if is_live else ""))

    margin = size_usd / leverage
    if not is_live and margin > account["balance"]:
        raise ValueError(f"Insufficient balance. Need ${margin:.2f} margin, have ${account['balance']:.2f}")

    # Validate SL/TP relative to entry and direction
    if stop_loss is not None:
        if direction == "long" and stop_loss >= entry_price:
            raise ValueError(f"Long stop loss (${stop_loss}) must be below entry (${entry_price})")
        if direction == "short" and stop_loss <= entry_price:
            raise ValueError(f"Short stop loss (${stop_loss}) must be above entry (${entry_price})")

    if take_profit is not None:
        if direction == "long" and take_profit <= entry_price:
            raise ValueError(f"Long take profit (${take_profit}) must be above entry (${entry_price})")
        if direction == "short" and take_profit >= entry_price:
            raise ValueError(f"Short take profit (${take_profit}) must be below entry (${entry_price})")

    # ── LIVE MODE: Execute on Drift ─────────────────────────────
    exchange_oid = None
    if is_live:
        from perp_exchange import open_market_position, validate_before_trade, place_tp_sl_orders

        # Pre-trade safety check
        safety = validate_before_trade(
            symbol, size_usd,
            max_total_exposure=account.get("live_max_exposure", LIVE_MAX_TOTAL_EXPOSURE),
            max_single_position=account.get("live_max_position", LIVE_MAX_SINGLE_POSITION),
        )
        if not safety["safe"]:
            raise ValueError(f"Live safety check failed: {safety['reason']}")

        # Execute on exchange
        exchange_result = open_market_position(
            symbol=symbol,
            direction=direction,
            size_usd=size_usd,
            current_price=entry_price,
            leverage=leverage,
        )

        if exchange_result["status"] not in ("filled", "resting"):
            raise RuntimeError(f"Exchange order failed: {exchange_result}")

        # Use real fill price from exchange
        fill_price = exchange_result["filled_price"]
        quantity = exchange_result["filled_size"]
        exchange_oid = exchange_result.get("exchange_oid")
        open_fee = 0  # Exchange handles fees
        slippage_pct = 0

        # Place TP/SL on exchange
        if stop_loss or take_profit:
            try:
                place_tp_sl_orders(symbol, direction, quantity, stop_loss, take_profit)
            except Exception as e:
                print(f"[perp-engine] Warning: TP/SL placement failed: {e}")

    else:
        # ── PAPER MODE: Simulate slippage and fees ────────────────
        slippage_pct = simulate_slippage(size_usd, entry_price)
        if direction == "long":
            fill_price = entry_price * (1 + slippage_pct)
        else:
            fill_price = entry_price * (1 - slippage_pct)
        open_fee = calculate_fees(size_usd)
        quantity = size_usd / fill_price

    # Calculate derived values
    liq_price = calculate_liquidation_price(fill_price, leverage, direction)

    # Trailing stop setup — trail is NOT active at entry.
    # It activates only after price moves favorably past the activation
    # threshold (trailing_stop_activation, stored as a price level).
    # Until then, the fixed SL protects the downside.
    trailing_stop_distance = None
    trailing_stop_price = None
    trailing_stop_activation = None
    if trailing_stop_pct and trailing_stop_pct > 0:
        trailing_stop_distance = trailing_stop_pct
        # Don't set trailing_stop_price yet — it starts as None
        # and only gets set once the activation price is reached.
        # Activation default: 1x ATR favorable move from entry.
        # Caller can override via trailing_stop_activation_price param.
        # For now, we store the activation level so the cron can check it.
        if direction == "long":
            trailing_stop_activation = fill_price * (1 + trailing_stop_pct / 100)
        else:
            trailing_stop_activation = fill_price * (1 - trailing_stop_pct / 100)

    position = {
        "account_id": wallet,
        "symbol": symbol,
        "direction": direction,
        "leverage": leverage,
        "size_usd": size_usd,
        "quantity": quantity,
        "entry_price": fill_price,
        "mark_price": fill_price,
        "liquidation_price": liq_price,
        "margin": margin,
        "maintenance_margin": size_usd * calculate_maintenance_margin(leverage),
        "unrealized_pnl": 0.0,
        "unrealized_pnl_pct": 0.0,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "trailing_stop_distance": trailing_stop_distance,
        "trailing_stop_price": trailing_stop_price,
        "trailing_stop_activation": trailing_stop_activation,
        "cumulative_funding": 0.0,
        "total_fees": open_fee,
        "slippage_cost": abs(fill_price - entry_price) * quantity,
        "max_favorable_excursion": 0.0,
        "max_adverse_excursion": 0.0,
        "last_borrow_charge": datetime.utcnow(),
        "entry_reason": entry_reason,
        "trading_mode": "live" if is_live else "paper",
        "exchange_oid": exchange_oid,
        "status": "open",
        "opened_at": datetime.utcnow(),
        "last_updated": datetime.utcnow(),
    }

    result = perp_positions.insert_one(position)
    position_id = str(result.inserted_id)

    # Deduct margin + fees from balance
    perp_accounts.update_one(
        {"wallet": wallet},
        {
            "$inc": {
                "balance": -(margin + open_fee),
                "total_fees_paid": open_fee,
            },
            "$set": {"updated_at": datetime.utcnow()},
        }
    )

    # Record order
    order = {
        "account_id": wallet,
        "position_id": position_id,
        "symbol": symbol,
        "side": "buy" if direction == "long" else "sell",
        "order_type": "market",
        "direction": direction,
        "leverage": leverage,
        "quantity": quantity,
        "size_usd": size_usd,
        "price": entry_price,
        "filled_price": fill_price,
        "slippage_bps": round(slippage_pct * 10000),
        "fees": open_fee,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "trailing_stop": trailing_stop_pct,
        "status": "filled",
        "created_at": datetime.utcnow(),
        "filled_at": datetime.utcnow(),
    }
    perp_orders.insert_one(order)

    position["_id"] = position_id
    return _format_position(position)


def close_position(position_id: str, exit_price: float,
                   exit_type: str = "manual",
                   exit_reason: str = "") -> Dict:
    """Close an open position and record the trade."""
    pos = perp_positions.find_one({"_id": ObjectId(position_id), "status": "open"})
    if not pos:
        raise ValueError("Position not found or already closed")

    wallet = pos["account_id"]
    size_usd = pos["size_usd"]
    direction = pos["direction"]
    is_live = pos.get("trading_mode") == "live"

    # ── LIVE MODE: Close on Drift ─────────────────────────────────
    if is_live and exit_type != "kill_switch":
        from perp_exchange import close_market_position

        exchange_result = close_market_position(
            symbol=pos["symbol"],
            size=pos["quantity"],
            current_price=exit_price,
        )

        if exchange_result["status"] == "filled":
            fill_price = exchange_result["filled_price"]
        else:
            # Fallback to requested price if exchange response unclear
            fill_price = exit_price
        close_fee = 0  # Exchange handles fees
        slippage_pct = 0
    else:
        # ── PAPER MODE: Simulate slippage ─────────────────────────
        slippage_pct = simulate_slippage(size_usd, exit_price)
        if direction == "long":
            fill_price = exit_price * (1 - slippage_pct)
        else:
            fill_price = exit_price * (1 + slippage_pct)
        close_fee = calculate_fees(size_usd)

    # Calculate final P&L
    pnl_usd, pnl_pct = calculate_pnl(pos["entry_price"], fill_price, size_usd, direction)
    total_fees = pos.get("total_fees", 0) + close_fee
    cumulative_funding = pos.get("cumulative_funding", 0)
    net_pnl = pnl_usd - total_fees - cumulative_funding

    # Record closed trade
    now = datetime.utcnow()
    opened_at = pos.get("opened_at", now)
    holding_ms = int((now - opened_at).total_seconds() * 1000) if isinstance(opened_at, datetime) else 0

    trade = {
        "account_id": wallet,
        "position_id": position_id,
        "symbol": pos["symbol"],
        "direction": direction,
        "leverage": pos["leverage"],
        "entry_price": pos["entry_price"],
        "exit_price": fill_price,
        "quantity": pos["quantity"],
        "size_usd": size_usd,
        "entry_time": opened_at,
        "exit_time": now,
        "holding_period_ms": holding_ms,
        "exit_type": exit_type,
        "realized_pnl": round(net_pnl, 4),
        "realized_pnl_pct": round(pnl_pct, 4),
        "total_funding_paid": cumulative_funding,
        "total_fees": total_fees,
        "slippage_cost": pos.get("slippage_cost", 0) + abs(fill_price - exit_price) * pos["quantity"],
        "max_favorable_excursion": pos.get("max_favorable_excursion", 0),
        "max_adverse_excursion": pos.get("max_adverse_excursion", 0),
        "entry_reason": pos.get("entry_reason", ""),
        "exit_reason": exit_reason,
    }
    perp_trades.insert_one(trade)

    # Update position status
    perp_positions.update_one(
        {"_id": ObjectId(position_id)},
        {"$set": {
            "status": "closed",
            "mark_price": fill_price,
            "unrealized_pnl": 0,
            "unrealized_pnl_pct": 0,
            "last_updated": now,
        }}
    )

    # Return margin + P&L to balance
    margin_return = pos["margin"] + pnl_usd - close_fee
    is_win = net_pnl > 0

    perp_accounts.update_one(
        {"wallet": wallet},
        {
            "$inc": {
                "balance": margin_return,
                "realized_pnl": net_pnl,
                "total_fees_paid": close_fee,
                "total_trades": 1,
                "winning_trades": 1 if is_win else 0,
                "losing_trades": 0 if is_win else 1,
                "daily_pnl": net_pnl,
            },
            "$set": {"updated_at": now},
        }
    )

    # Record closing order
    perp_orders.insert_one({
        "account_id": wallet,
        "position_id": position_id,
        "symbol": pos["symbol"],
        "side": "sell" if direction == "long" else "buy",
        "order_type": exit_type,
        "direction": direction,
        "leverage": pos["leverage"],
        "quantity": pos["quantity"],
        "size_usd": size_usd,
        "price": exit_price,
        "filled_price": fill_price,
        "slippage_bps": round(slippage_pct * 10000),
        "fees": close_fee,
        "status": "filled",
        "created_at": now,
        "filled_at": now,
    })

    return _format_trade(trade)


def partial_close_position(position_id: str, exit_price: float,
                          close_pct: float = 50.0,
                          exit_reason: str = "partial_tp") -> Dict:
    """Close a percentage of an open position and leave the rest running.

    Args:
        position_id: The position to partially close
        exit_price: Current market price for exit
        close_pct: Percentage to close (1-99). E.g. 50 = close half.
        exit_reason: Reason for partial close

    Returns the trade record for the closed portion. The remaining position
    stays open with reduced size/quantity/margin.
    """
    if close_pct <= 0 or close_pct >= 100:
        raise ValueError("close_pct must be between 1 and 99. Use close_position for 100%.")

    pos = perp_positions.find_one({"_id": ObjectId(position_id), "status": "open"})
    if not pos:
        raise ValueError("Position not found or already closed")

    wallet = pos["account_id"]
    direction = pos["direction"]
    size_usd = pos["size_usd"]
    quantity = pos["quantity"]
    close_fraction = close_pct / 100.0

    # Calculate the portion being closed
    close_size = round(size_usd * close_fraction, 4)
    close_qty = round(quantity * close_fraction, 8)
    remain_size = round(size_usd - close_size, 4)
    remain_qty = round(quantity - close_qty, 8)

    if remain_size < 10:  # Too small to keep open
        return close_position(position_id, exit_price, "take_profit", exit_reason)

    # Simulate slippage on the closed portion
    slippage_pct = simulate_slippage(close_size, exit_price)
    if direction == "long":
        fill_price = exit_price * (1 - slippage_pct)
    else:
        fill_price = exit_price * (1 + slippage_pct)
    close_fee = calculate_fees(close_size)

    # Calculate P&L on closed portion
    pnl_usd, pnl_pct = calculate_pnl(pos["entry_price"], fill_price, close_size, direction)
    portion_fees = pos.get("total_fees", 0) * close_fraction
    portion_funding = pos.get("cumulative_funding", 0) * close_fraction
    net_pnl = pnl_usd - close_fee - portion_funding

    now = datetime.utcnow()
    opened_at = pos.get("opened_at", now)
    holding_ms = int((now - opened_at).total_seconds() * 1000) if isinstance(opened_at, datetime) else 0

    # Record the partial close as a trade
    trade = {
        "account_id": wallet,
        "position_id": position_id,
        "symbol": pos["symbol"],
        "direction": direction,
        "leverage": pos["leverage"],
        "entry_price": pos["entry_price"],
        "exit_price": fill_price,
        "quantity": close_qty,
        "size_usd": close_size,
        "entry_time": opened_at,
        "exit_time": now,
        "holding_period_ms": holding_ms,
        "exit_type": "partial_close",
        "realized_pnl": round(net_pnl, 4),
        "realized_pnl_pct": round(pnl_pct, 4),
        "total_funding_paid": portion_funding,
        "total_fees": portion_fees + close_fee,
        "slippage_cost": abs(fill_price - exit_price) * close_qty,
        "max_favorable_excursion": pos.get("max_favorable_excursion", 0),
        "max_adverse_excursion": pos.get("max_adverse_excursion", 0),
        "entry_reason": pos.get("entry_reason", ""),
        "exit_reason": exit_reason,
    }
    perp_trades.insert_one(trade)

    # Update the remaining position (reduced size, keep same entry/SL/TP)
    remain_margin = round(pos.get("margin", 0) * (1 - close_fraction), 4)
    perp_positions.update_one(
        {"_id": ObjectId(position_id)},
        {"$set": {
            "size_usd": remain_size,
            "quantity": remain_qty,
            "margin": remain_margin,
            "maintenance_margin": remain_size * calculate_maintenance_margin(pos["leverage"]),
            "total_fees": pos.get("total_fees", 0) * (1 - close_fraction),
            "cumulative_funding": pos.get("cumulative_funding", 0) * (1 - close_fraction),
            "last_updated": now,
        }}
    )

    # Credit account: margin released + PnL
    margin_released = pos.get("margin", 0) * close_fraction
    credit = margin_released + net_pnl
    is_win = net_pnl > 0
    perp_accounts.update_one(
        {"wallet": wallet},
        {
            "$inc": {
                "balance": round(credit, 4),
                "realized_pnl": net_pnl,
                "total_fees_paid": close_fee,
                "total_trades": 1,
                "winning_trades": 1 if is_win else 0,
                "losing_trades": 0 if is_win else 1,
                "daily_pnl": net_pnl,
            },
            "$set": {"updated_at": now},
        }
    )

    # Log the order
    perp_orders.insert_one({
        "account_id": wallet,
        "position_id": position_id,
        "symbol": pos["symbol"],
        "side": "sell" if direction == "long" else "buy",
        "order_type": "partial_close",
        "direction": direction,
        "leverage": pos["leverage"],
        "size_usd": close_size,
        "quantity": close_qty,
        "price": exit_price,
        "filled_price": fill_price,
        "fees": close_fee,
        "status": "filled",
        "created_at": now,
        "filled_at": now,
    })

    return _format_trade(trade)


def modify_position(position_id: str, stop_loss: float = None,
                    take_profit: float = None,
                    trailing_stop_pct: float = None) -> Dict:
    """Modify SL/TP/trailing stop on an open position."""
    pos = perp_positions.find_one({"_id": ObjectId(position_id), "status": "open"})
    if not pos:
        raise ValueError("Position not found or already closed")

    direction = pos["direction"]
    entry = pos["entry_price"]

    # Validate SL/TP relative to entry and direction
    if stop_loss is not None:
        if direction == "long" and stop_loss >= entry:
            raise ValueError(f"Long stop loss (${stop_loss}) must be below entry (${entry})")
        if direction == "short" and stop_loss <= entry:
            raise ValueError(f"Short stop loss (${stop_loss}) must be above entry (${entry})")

    if take_profit is not None:
        if direction == "long" and take_profit <= entry:
            raise ValueError(f"Long take profit (${take_profit}) must be above entry (${entry})")
        if direction == "short" and take_profit >= entry:
            raise ValueError(f"Short take profit (${take_profit}) must be below entry (${entry})")

    update = {"last_updated": datetime.utcnow()}
    if stop_loss is not None:
        update["stop_loss"] = stop_loss
    if take_profit is not None:
        update["take_profit"] = take_profit
    if trailing_stop_pct is not None:
        update["trailing_stop_distance"] = trailing_stop_pct
        mark = pos.get("mark_price", pos["entry_price"])
        if pos["direction"] == "long":
            update["trailing_stop_price"] = mark * (1 - trailing_stop_pct / 100)
        else:
            update["trailing_stop_price"] = mark * (1 + trailing_stop_pct / 100)

    perp_positions.update_one({"_id": ObjectId(position_id)}, {"$set": update})

    pos.update(update)
    return _format_position(pos)


# ── Position Update (called by cron) ────────────────────────────────────

def update_position_price(position: Dict, mark_price: float) -> Dict:
    """Update a position with the latest mark price. Returns action taken."""
    pos_id = position["_id"]
    direction = position["direction"]
    entry = position["entry_price"]
    size_usd = position["size_usd"]
    wallet = position["account_id"]

    # Calculate P&L
    pnl_usd, pnl_pct = calculate_pnl(entry, mark_price, size_usd, direction)

    # Update MFE/MAE
    mfe = position.get("max_favorable_excursion", 0)
    mae = position.get("max_adverse_excursion", 0)
    if pnl_usd > mfe:
        mfe = pnl_usd
    if pnl_usd < mae:
        mae = pnl_usd

    # Borrow fee (charge hourly)
    last_charge = position.get("last_borrow_charge", datetime.utcnow())
    if isinstance(last_charge, str):
        last_charge = datetime.fromisoformat(last_charge)
    hours_since = (datetime.utcnow() - last_charge).total_seconds() / 3600
    borrow_fee = 0.0
    new_last_charge = last_charge
    if hours_since >= 1.0:
        whole_hours = int(hours_since)
        borrow_fee = calculate_borrow_fee(size_usd, whole_hours)
        new_last_charge = datetime.utcnow()

    cumulative_funding = position.get("cumulative_funding", 0) + borrow_fee

    update = {
        "mark_price": mark_price,
        "unrealized_pnl": round(pnl_usd, 4),
        "unrealized_pnl_pct": round(pnl_pct, 4),
        "max_favorable_excursion": round(mfe, 4),
        "max_adverse_excursion": round(mae, 4),
        "cumulative_funding": round(cumulative_funding, 4),
        "last_updated": datetime.utcnow(),
    }
    if borrow_fee > 0:
        update["last_borrow_charge"] = new_last_charge
        update["total_fees"] = position.get("total_fees", 0) + borrow_fee

        # Record funding event
        perp_funding.insert_one({
            "position_id": str(pos_id),
            "account_id": wallet,
            "symbol": position["symbol"],
            "timestamp": datetime.utcnow(),
            "funding_rate": BORROW_FEE_PCT_HR,
            "payment_amount": borrow_fee,
            "direction": "paid",
        })

        # Deduct from account balance
        perp_accounts.update_one(
            {"wallet": wallet},
            {"$inc": {"total_funding_paid": borrow_fee, "balance": -borrow_fee}}
        )

    # Update trailing stop — only activates after price reaches activation level
    trailing_dist = position.get("trailing_stop_distance")
    trailing_price = position.get("trailing_stop_price")
    activation_price = position.get("trailing_stop_activation")
    if trailing_dist and trailing_dist > 0:
        # Check if trailing is activated yet
        activated = trailing_price is not None  # Already activated previously
        if not activated and activation_price:
            if direction == "long" and mark_price >= activation_price:
                activated = True
            elif direction == "short" and mark_price <= activation_price:
                activated = True

        if activated:
            if direction == "long":
                new_trail = mark_price * (1 - trailing_dist / 100)
                if trailing_price is None or new_trail > trailing_price:
                    update["trailing_stop_price"] = new_trail
                    trailing_price = new_trail
            else:
                new_trail = mark_price * (1 + trailing_dist / 100)
                if trailing_price is None or new_trail < trailing_price:
                    update["trailing_stop_price"] = new_trail
                    trailing_price = new_trail

    perp_positions.update_one({"_id": pos_id}, {"$set": update})

    # Check triggers — each checked independently (not elif)
    # so a set-but-not-triggered SL doesn't block TP evaluation
    action = None

    # 1. Liquidation (highest priority)
    if check_liquidation(position, mark_price):
        action = "liquidation"

    # 2. Stop loss
    if not action and position.get("stop_loss"):
        sl = position["stop_loss"]
        if direction == "long" and mark_price <= sl:
            action = "stop_loss"
        elif direction == "short" and mark_price >= sl:
            action = "stop_loss"

    # 3. Take profit
    if not action and position.get("take_profit"):
        tp = position["take_profit"]
        if direction == "long" and mark_price >= tp:
            action = "take_profit"
        elif direction == "short" and mark_price <= tp:
            action = "take_profit"

    # 4. Trailing stop
    if not action and trailing_price:
        if direction == "long" and mark_price <= trailing_price:
            action = "trailing_stop"
        elif direction == "short" and mark_price >= trailing_price:
            action = "trailing_stop"

    return {"action": action, "pnl_usd": pnl_usd, "pnl_pct": pnl_pct, "borrow_fee": borrow_fee}


# ── Equity & Metrics ────────────────────────────────────────────────────

def snapshot_equity(wallet: str) -> Dict:
    """Take an equity snapshot for the account."""
    account = perp_accounts.find_one({"wallet": wallet})
    if not account:
        return {}

    # Sum unrealized P&L from open positions
    open_positions = list(perp_positions.find({"account_id": wallet, "status": "open"}))
    total_unrealized = sum(p.get("unrealized_pnl", 0) for p in open_positions)
    total_margin = sum(p.get("margin", 0) for p in open_positions)

    equity = account["balance"] + total_margin + total_unrealized
    peak = max(account.get("peak_equity", INITIAL_BALANCE), equity)
    drawdown = (peak - equity) / peak if peak > 0 else 0
    max_dd = max(account.get("max_drawdown", 0), drawdown)

    # Update account
    perp_accounts.update_one(
        {"wallet": wallet},
        {"$set": {
            "equity": round(equity, 4),
            "unrealized_pnl": round(total_unrealized, 4),
            "peak_equity": round(peak, 4),
            "max_drawdown": round(max_dd, 6),
            "updated_at": datetime.utcnow(),
        }}
    )

    # Check daily loss limit
    daily_pnl = account.get("daily_pnl", 0)
    daily_reset = account.get("daily_pnl_reset", datetime.utcnow())
    if isinstance(daily_reset, str):
        daily_reset = datetime.fromisoformat(daily_reset)

    if (datetime.utcnow() - daily_reset).total_seconds() > 86400:
        perp_accounts.update_one(
            {"wallet": wallet},
            {"$set": {"daily_pnl": 0, "daily_pnl_reset": datetime.utcnow(), "trading_paused": False}}
        )
    elif daily_pnl < -(equity * DAILY_LOSS_LIMIT_PCT):
        perp_accounts.update_one(
            {"wallet": wallet},
            {"$set": {"trading_paused": True}}
        )

    snapshot = {
        "account_id": wallet,
        "timestamp": datetime.utcnow(),
        "balance": account["balance"],
        "equity": round(equity, 4),
        "unrealized_pnl": round(total_unrealized, 4),
        "realized_pnl_cumulative": account.get("realized_pnl", 0),
        "open_position_count": len(open_positions),
        "drawdown_from_peak": round(drawdown, 6),
    }
    perp_equity.insert_one(snapshot)

    return snapshot


def calculate_metrics(wallet: str) -> Dict:
    """Calculate professional trading metrics from closed trades."""
    trades = list(perp_trades.find({"account_id": wallet}).sort("exit_time", 1))
    account = perp_accounts.find_one({"wallet": wallet})

    if not trades or not account:
        return {
            "total_trades": 0, "winning_trades": 0, "losing_trades": 0,
            "win_rate": 0, "profit_factor": 0, "avg_rr_ratio": 0,
            "sharpe_ratio": 0, "sortino_ratio": 0, "max_drawdown": 0,
            "expectancy": 0, "kelly_criterion": 0, "avg_holding_period": "0h",
            "total_pnl": 0, "total_fees": 0, "total_funding": 0,
            "best_trade": 0, "worst_trade": 0, "avg_win": 0, "avg_loss": 0,
            "consecutive_wins": 0, "consecutive_losses": 0,
        }

    pnls = [t["realized_pnl"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    total = len(pnls)
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = win_count / total if total > 0 else 0

    avg_win = sum(wins) / win_count if win_count > 0 else 0
    avg_loss = abs(sum(losses) / loss_count) if loss_count > 0 else 0
    profit_factor = sum(wins) / abs(sum(losses)) if losses and sum(losses) != 0 else float('inf') if wins else 0
    avg_rr = avg_win / avg_loss if avg_loss > 0 else float('inf') if avg_win > 0 else 0

    expectancy = (win_rate * avg_win) - ((1 - win_rate) * avg_loss)
    kelly = (win_rate - ((1 - win_rate) / avg_rr)) if avg_rr > 0 and avg_rr != float('inf') else 0
    kelly = max(0, min(kelly / 2, 0.05))  # Half Kelly, capped at 5%

    # Sharpe & Sortino from daily returns (approximate from trade returns)
    if len(pnls) >= 2:
        returns = [p / INITIAL_BALANCE for p in pnls]
        mean_r = sum(returns) / len(returns)
        variance = sum((r - mean_r) ** 2 for r in returns) / len(returns)
        std_r = math.sqrt(variance) if variance > 0 else 0.0001

        downside_returns = [r for r in returns if r < 0]
        down_var = sum(r ** 2 for r in downside_returns) / len(downside_returns) if downside_returns else 0.0001
        down_std = math.sqrt(down_var)

        sharpe = (mean_r / std_r) * math.sqrt(365) if std_r > 0 else 0
        sortino = (mean_r / down_std) * math.sqrt(365) if down_std > 0 else 0
    else:
        sharpe = 0
        sortino = 0

    # Consecutive wins/losses
    max_consec_w = max_consec_l = cur_w = cur_l = 0
    for p in pnls:
        if p > 0:
            cur_w += 1
            cur_l = 0
            max_consec_w = max(max_consec_w, cur_w)
        else:
            cur_l += 1
            cur_w = 0
            max_consec_l = max(max_consec_l, cur_l)

    # Average holding period
    holding_ms = [t.get("holding_period_ms", 0) for t in trades]
    avg_hold_ms = sum(holding_ms) / len(holding_ms) if holding_ms else 0
    avg_hold_hrs = avg_hold_ms / 3_600_000

    if avg_hold_hrs < 1:
        avg_hold_str = f"{int(avg_hold_hrs * 60)}m"
    elif avg_hold_hrs < 24:
        avg_hold_str = f"{avg_hold_hrs:.1f}h"
    else:
        avg_hold_str = f"{avg_hold_hrs / 24:.1f}d"

    return {
        "total_trades": total,
        "winning_trades": win_count,
        "losing_trades": loss_count,
        "win_rate": round(win_rate * 100, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor != float('inf') else 999,
        "avg_rr_ratio": round(avg_rr, 2) if avg_rr != float('inf') else 999,
        "sharpe_ratio": round(sharpe, 2),
        "sortino_ratio": round(sortino, 2),
        "max_drawdown": round(account.get("max_drawdown", 0) * 100, 2),
        "expectancy": round(expectancy, 2),
        "kelly_criterion": round(kelly * 100, 2),
        "avg_holding_period": avg_hold_str,
        "total_pnl": round(sum(pnls), 2),
        "total_fees": round(sum(t.get("total_fees", 0) for t in trades), 2),
        "total_funding": round(sum(t.get("total_funding_paid", 0) for t in trades), 2),
        "best_trade": round(max(pnls), 2),
        "worst_trade": round(min(pnls), 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "consecutive_wins": max_consec_w,
        "consecutive_losses": max_consec_l,
    }


# ── Pending Orders ─────────────────────────────────────────────────────

perp_pending_orders = db["perp_pending_orders"]
perp_pending_orders.create_index([("account_id", 1), ("status", 1)])
perp_pending_orders.create_index([("symbol", 1), ("status", 1)])


def create_pending_order(wallet: str, symbol: str, direction: str, leverage: int,
                         size_usd: float, order_type: str, trigger_price: float,
                         stop_loss: float = None, take_profit: float = None,
                         trailing_stop_pct: float = None,
                         entry_reason: str = "",
                         expiry_hours: float = 24) -> Dict:
    """Create a pending limit/stop order that triggers at a price level."""
    account = get_or_create_account(wallet)
    if account.get("kill_switch"):
        raise ValueError("Kill switch is active")
    if account.get("trading_paused"):
        raise ValueError("Trading paused")

    market = MARKETS.get(symbol)
    if not market:
        raise ValueError(f"Unsupported market: {symbol}")
    if direction not in ("long", "short"):
        raise ValueError("Direction must be 'long' or 'short'")
    if order_type not in ("limit", "stop"):
        raise ValueError("Order type must be 'limit' or 'stop'")

    max_lev = market["max_leverage"]
    leverage = max(MIN_LEVERAGE, min(leverage, max_lev))

    # Count existing pending orders
    pending_count = perp_pending_orders.count_documents({
        "account_id": wallet, "status": "pending"
    })
    if pending_count >= 10:
        raise ValueError("Max 10 pending orders allowed")

    order = {
        "account_id": wallet,
        "symbol": symbol,
        "direction": direction,
        "leverage": leverage,
        "size_usd": size_usd,
        "order_type": order_type,
        "trigger_price": trigger_price,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "trailing_stop_pct": trailing_stop_pct,
        "entry_reason": entry_reason,
        "status": "pending",
        "expires_at": datetime.utcnow() + timedelta(hours=expiry_hours),
        "created_at": datetime.utcnow(),
    }
    result = perp_pending_orders.insert_one(order)
    order["_id"] = str(result.inserted_id)
    return _format_pending_order(order)


def cancel_pending_order(order_id: str, wallet: str) -> Dict:
    """Cancel a pending order."""
    order = perp_pending_orders.find_one({
        "_id": ObjectId(order_id), "account_id": wallet, "status": "pending"
    })
    if not order:
        raise ValueError("Pending order not found")
    perp_pending_orders.update_one(
        {"_id": ObjectId(order_id)},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.utcnow()}}
    )
    order["status"] = "cancelled"
    return _format_pending_order(order)


def check_pending_orders(wallet: str, prices: Dict[str, float]) -> List[Dict]:
    """Check if any pending orders should be triggered. Called by cron."""
    now = datetime.utcnow()
    pending = list(perp_pending_orders.find({
        "account_id": wallet, "status": "pending"
    }))

    triggered = []
    for order in pending:
        oid = order["_id"]
        symbol = order["symbol"]

        # Check expiry
        if order.get("expires_at") and now >= order["expires_at"]:
            perp_pending_orders.update_one(
                {"_id": oid}, {"$set": {"status": "expired"}}
            )
            continue

        if symbol not in prices:
            continue

        mark = prices[symbol]
        trigger = order["trigger_price"]
        order_type = order["order_type"]
        direction = order["direction"]
        should_trigger = False

        if order_type == "limit":
            # Limit buy triggers when price drops to/below trigger
            if direction == "long" and mark <= trigger:
                should_trigger = True
            # Limit sell triggers when price rises to/above trigger
            elif direction == "short" and mark >= trigger:
                should_trigger = True
        elif order_type == "stop":
            # Stop buy triggers when price rises to/above trigger
            if direction == "long" and mark >= trigger:
                should_trigger = True
            # Stop sell triggers when price drops to/below trigger
            elif direction == "short" and mark <= trigger:
                should_trigger = True

        if should_trigger:
            try:
                position = open_position(
                    wallet=wallet, symbol=symbol,
                    direction=direction, leverage=order["leverage"],
                    size_usd=order["size_usd"], entry_price=mark,
                    stop_loss=order.get("stop_loss"),
                    take_profit=order.get("take_profit"),
                    trailing_stop_pct=order.get("trailing_stop_pct"),
                    entry_reason=order.get("entry_reason", f"[pending_{order_type}]"),
                )
                perp_pending_orders.update_one(
                    {"_id": oid},
                    {"$set": {"status": "filled", "filled_at": now, "filled_price": mark}}
                )
                triggered.append({"order_id": str(oid), "position": position})
            except Exception as e:
                perp_pending_orders.update_one(
                    {"_id": oid},
                    {"$set": {"status": "failed", "error": str(e)}}
                )
    return triggered


def get_pending_orders(wallet: str) -> List[Dict]:
    """Get all pending orders for a wallet."""
    orders = list(perp_pending_orders.find(
        {"account_id": wallet, "status": "pending"}
    ).sort("created_at", -1))
    return [_format_pending_order(o) for o in orders]


def _format_pending_order(order: Dict) -> Dict:
    """Format pending order for API response."""
    o = dict(order)
    o["_id"] = str(o["_id"]) if "_id" in o else None
    for key in ("created_at", "expires_at", "filled_at", "cancelled_at"):
        if key in o and isinstance(o[key], datetime):
            o[key] = o[key].isoformat()
    return o


# ── Pyramiding (Adding to Winners) ────────────────────────────────────

def pyramid_position(wallet: str, position_id: str, add_size_usd: float,
                     entry_price: float) -> Dict:
    """Add to an existing winning position (pyramid).
    Opens a new linked position in the same market/direction.
    Tracks the pyramid chain via parent_position_id.
    """
    parent = perp_positions.find_one({"_id": ObjectId(position_id), "status": "open"})
    if not parent:
        raise ValueError("Position not found or already closed")

    # Only pyramid into winners
    if parent.get("unrealized_pnl", 0) <= 0:
        raise ValueError("Can only pyramid into winning positions (positive P&L required)")

    wallet = parent["account_id"]
    symbol = parent["symbol"]
    direction = parent["direction"]
    leverage = parent["leverage"]

    # Max 3 pyramid levels
    pyramid_level = parent.get("pyramid_level", 1)
    if pyramid_level >= 3:
        raise ValueError("Max 3 pyramid levels reached")

    # Pyramid size should decrease (50% of previous level)
    max_pyramid_size = parent["size_usd"] * 0.5
    if add_size_usd > max_pyramid_size:
        raise ValueError(f"Pyramid size must be <= 50% of parent (${max_pyramid_size:.2f})")

    # Calculate tighter SL for pyramid — trail the original SL up
    # Use parent's entry or current trailing stop, whichever is more favorable
    parent_sl = parent.get("stop_loss")
    parent_tp = parent.get("take_profit")
    parent_trail = parent.get("trailing_stop_pct")

    position = open_position(
        wallet=wallet, symbol=symbol, direction=direction,
        leverage=leverage, size_usd=add_size_usd,
        entry_price=entry_price,
        stop_loss=parent_sl, take_profit=parent_tp,
        trailing_stop_pct=parent_trail,
        entry_reason=f"[pyramid_L{pyramid_level + 1}] adding to {position_id[:8]}",
    )

    # Mark new position as pyramid
    perp_positions.update_one(
        {"_id": ObjectId(position["_id"])},
        {"$set": {
            "parent_position_id": position_id,
            "pyramid_level": pyramid_level + 1,
            "position_type": "satellite",
        }}
    )

    # Update parent pyramid level
    perp_positions.update_one(
        {"_id": ObjectId(position_id)},
        {"$set": {
            "pyramid_level": pyramid_level,
            "position_type": parent.get("position_type", "core"),
        }}
    )

    position["pyramid_level"] = pyramid_level + 1
    position["parent_position_id"] = position_id
    return position


# ── Position Flipping (Cut and Reverse) ────────────────────────────────

def flip_position(position_id: str, exit_price: float,
                  new_size_usd: float = None) -> Dict:
    """Close a position and immediately open one in the opposite direction.
    If new_size_usd is None, uses the same size as the closed position.
    """
    pos = perp_positions.find_one({"_id": ObjectId(position_id), "status": "open"})
    if not pos:
        raise ValueError("Position not found or already closed")

    wallet = pos["account_id"]
    symbol = pos["symbol"]
    old_direction = pos["direction"]
    new_direction = "short" if old_direction == "long" else "long"
    leverage = pos["leverage"]
    size = new_size_usd or pos["size_usd"]

    # Close the existing position
    trade = close_position(position_id, exit_price, "manual",
                          f"Position flip to {new_direction}")

    # Open in opposite direction with same SL/TP structure
    # Mirror the SL/TP around entry
    old_sl_dist = None
    old_tp_dist = None
    if pos.get("stop_loss"):
        old_sl_dist = abs(pos["entry_price"] - pos["stop_loss"])
    if pos.get("take_profit"):
        old_tp_dist = abs(pos["entry_price"] - pos["take_profit"])

    new_sl = None
    new_tp = None
    if old_sl_dist:
        new_sl = exit_price + old_sl_dist if new_direction == "short" else exit_price - old_sl_dist
    if old_tp_dist:
        new_tp = exit_price - old_tp_dist if new_direction == "short" else exit_price + old_tp_dist

    new_pos = open_position(
        wallet=wallet, symbol=symbol, direction=new_direction,
        leverage=leverage, size_usd=size, entry_price=exit_price,
        stop_loss=new_sl, take_profit=new_tp,
        trailing_stop_pct=pos.get("trailing_stop_distance"),
        entry_reason=f"[flip] reversed from {old_direction}",
    )

    return {
        "closed_trade": trade,
        "new_position": new_pos,
    }


# ── Core + Satellite Position Tracking ─────────────────────────────────

def set_position_type(position_id: str, position_type: str) -> Dict:
    """Tag a position as 'core' or 'satellite'."""
    if position_type not in ("core", "satellite"):
        raise ValueError("Position type must be 'core' or 'satellite'")

    pos = perp_positions.find_one({"_id": ObjectId(position_id), "status": "open"})
    if not pos:
        raise ValueError("Position not found or already closed")

    perp_positions.update_one(
        {"_id": ObjectId(position_id)},
        {"$set": {"position_type": position_type, "last_updated": datetime.utcnow()}}
    )
    pos["position_type"] = position_type
    return _format_position(pos)


def get_position_summary(wallet: str) -> Dict:
    """Get summary of positions broken down by core/satellite."""
    positions = list(perp_positions.find({"account_id": wallet, "status": "open"}))

    core = [p for p in positions if p.get("position_type", "core") == "core"]
    satellite = [p for p in positions if p.get("position_type") == "satellite"]

    core_pnl = sum(p.get("unrealized_pnl", 0) for p in core)
    sat_pnl = sum(p.get("unrealized_pnl", 0) for p in satellite)
    core_size = sum(p.get("size_usd", 0) for p in core)
    sat_size = sum(p.get("size_usd", 0) for p in satellite)

    return {
        "core": {
            "count": len(core),
            "total_size_usd": round(core_size, 2),
            "unrealized_pnl": round(core_pnl, 2),
            "positions": [_format_position(p) for p in core],
        },
        "satellite": {
            "count": len(satellite),
            "total_size_usd": round(sat_size, 2),
            "unrealized_pnl": round(sat_pnl, 2),
            "positions": [_format_position(p) for p in satellite],
        },
    }


# ── Funding Rate Management ────────────────────────────────────────────

def get_funding_summary(wallet: str) -> Dict:
    """Get funding rate summary for all open positions."""
    positions = list(perp_positions.find({"account_id": wallet, "status": "open"}))

    total_funding = 0.0
    position_funding = []
    for pos in positions:
        funding = pos.get("cumulative_funding", 0)
        hours_open = 0
        if isinstance(pos.get("opened_at"), datetime):
            hours_open = (datetime.utcnow() - pos["opened_at"]).total_seconds() / 3600

        hourly_rate = BORROW_FEE_PCT_HR * pos["size_usd"]
        daily_cost = hourly_rate * 24
        total_funding += funding

        position_funding.append({
            "position_id": str(pos["_id"]),
            "symbol": pos["symbol"],
            "direction": pos["direction"],
            "size_usd": pos["size_usd"],
            "cumulative_funding": round(funding, 4),
            "hours_open": round(hours_open, 1),
            "hourly_cost": round(hourly_rate, 4),
            "daily_cost": round(daily_cost, 4),
            "funding_pct_of_pnl": round(
                (funding / abs(pos.get("unrealized_pnl", 0.01))) * 100, 1
            ) if pos.get("unrealized_pnl", 0) != 0 else 0,
        })

    return {
        "total_funding_paid": round(total_funding, 4),
        "positions": position_funding,
        "borrow_rate_per_hour": BORROW_FEE_PCT_HR,
    }


# ── Re-entry After Trailing Stop ──────────────────────────────────────

def get_reentry_candidates(wallet: str, prices: Dict[str, float],
                           lookback_hours: int = 4) -> List[Dict]:
    """Find recent trailing stop exits that may be re-entry candidates.
    Returns trades that exited via trailing stop where price has since
    pulled back (creating a potential re-entry opportunity).
    """
    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)
    trail_exits = list(perp_trades.find({
        "account_id": wallet,
        "exit_type": "trailing_stop",
        "exit_time": {"$gte": cutoff},
        "realized_pnl": {"$gt": 0},  # Only profitable trailing stop exits
    }).sort("exit_time", -1))

    candidates = []
    for trade in trail_exits:
        symbol = trade["symbol"]
        if symbol not in prices:
            continue

        current_price = prices[symbol]
        exit_price = trade["exit_price"]
        direction = trade["direction"]

        # Calculate pullback from exit
        if direction == "long":
            pullback_pct = ((exit_price - current_price) / exit_price) * 100
            # Re-entry if price pulled back 0.5-3% (not too much, not too little)
            is_candidate = 0.5 <= pullback_pct <= 3.0
        else:
            pullback_pct = ((current_price - exit_price) / exit_price) * 100
            is_candidate = 0.5 <= pullback_pct <= 3.0

        if is_candidate:
            candidates.append({
                "symbol": symbol,
                "direction": direction,
                "original_entry": trade["entry_price"],
                "exit_price": exit_price,
                "current_price": current_price,
                "pullback_pct": round(pullback_pct, 2),
                "original_pnl": trade["realized_pnl"],
                "original_strategy": trade.get("entry_reason", ""),
                "exit_time": trade["exit_time"].isoformat() if isinstance(trade["exit_time"], datetime) else trade["exit_time"],
                "suggested_size_usd": round(trade["size_usd"] * 0.75, 2),  # 75% of original
                "leverage": trade["leverage"],
            })

    return candidates


# ── Query Helpers ────────────────────────────────────────────────────────

def get_open_positions(wallet: str) -> List[Dict]:
    """Get all open positions for an account."""
    positions = list(perp_positions.find({"account_id": wallet, "status": "open"}).sort("opened_at", -1))
    return [_format_position(p) for p in positions]


def get_trade_history(wallet: str, limit: int = 50, symbol: str = None) -> List[Dict]:
    """Get closed trade history."""
    query = {"account_id": wallet}
    if symbol:
        query["symbol"] = symbol
    trades = list(perp_trades.find(query).sort("exit_time", -1).limit(limit))
    return [_format_trade(t) for t in trades]


def get_equity_curve(wallet: str, period: str = "all") -> List[Dict]:
    """Get equity snapshots for charting."""
    query = {"account_id": wallet}

    if period == "1d":
        query["timestamp"] = {"$gte": datetime.utcnow() - timedelta(days=1)}
    elif period == "1w":
        query["timestamp"] = {"$gte": datetime.utcnow() - timedelta(weeks=1)}
    elif period == "1m":
        query["timestamp"] = {"$gte": datetime.utcnow() - timedelta(days=30)}

    snapshots = list(perp_equity.find(query, {"_id": 0}).sort("timestamp", 1))
    for s in snapshots:
        if isinstance(s.get("timestamp"), datetime):
            s["timestamp"] = s["timestamp"].isoformat()
    return snapshots


def get_markets_info() -> List[Dict]:
    """Return available markets with config."""
    return [
        {
            "symbol": symbol,
            "base_asset": info["symbol"],
            "max_leverage": info["max_leverage"],
            "tick_size": info["tick"],
            "coingecko_id": info["base"],
        }
        for symbol, info in MARKETS.items()
    ]


# ── Formatting ───────────────────────────────────────────────────────────

def _format_position(pos: Dict) -> Dict:
    """Format position for API response."""
    p = dict(pos)
    p["_id"] = str(p["_id"]) if "_id" in p else None
    for key in ("opened_at", "last_updated", "last_borrow_charge"):
        if key in p and isinstance(p[key], datetime):
            p[key] = p[key].isoformat()
    return p


def _format_trade(trade: Dict) -> Dict:
    """Format trade for API response."""
    t = dict(trade)
    t.pop("_id", None)
    for key in ("entry_time", "exit_time"):
        if key in t and isinstance(t[key], datetime):
            t[key] = t[key].isoformat()
    return t

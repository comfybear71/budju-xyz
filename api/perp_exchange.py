# ==========================================
# Hyperliquid Exchange Adapter
# ==========================================
# Handles live perpetual futures trading via Hyperliquid API.
# Used when trading_mode is "live" — paper mode bypasses this entirely.
#
# Requirements:
#   pip install hyperliquid-python-sdk
#   Environment variables:
#     HYPERLIQUID_PRIVATE_KEY  — API wallet private key
#     HYPERLIQUID_ACCOUNT      — Main account public address
#     HYPERLIQUID_TESTNET       — "true" to use testnet (default: true)
# ==========================================

import os
import json
import time
from datetime import datetime
from typing import Optional, Dict, Any

# ── Config ────────────────────────────────────────────────────────────

HYPERLIQUID_PRIVATE_KEY = os.getenv("HYPERLIQUID_PRIVATE_KEY", "")
HYPERLIQUID_ACCOUNT = os.getenv("HYPERLIQUID_ACCOUNT", "")
HYPERLIQUID_TESTNET = os.getenv("HYPERLIQUID_TESTNET", "true").lower() == "true"

# Map our internal symbols to Hyperliquid coin names
SYMBOL_MAP = {
    "SOL-PERP": "SOL",
    "BTC-PERP": "BTC",
    "ETH-PERP": "ETH",
    "DOGE-PERP": "DOGE",
    "AVAX-PERP": "AVAX",
    "LINK-PERP": "LINK",
    "SUI-PERP": "SUI",
    "JUP-PERP": "JUP",
    "WIF-PERP": "WIF",
    "BONK-PERP": "BONK",
}

# Default slippage for market orders (0.5%)
DEFAULT_SLIPPAGE = 0.005

# ── Lazy SDK Initialization ──────────────────────────────────────────

_exchange_instance = None
_info_instance = None


def _get_sdk():
    """Lazily initialize the Hyperliquid SDK. Returns (info, exchange) tuple."""
    global _exchange_instance, _info_instance

    if _exchange_instance and _info_instance:
        return _info_instance, _exchange_instance

    if not HYPERLIQUID_PRIVATE_KEY:
        raise RuntimeError(
            "HYPERLIQUID_PRIVATE_KEY not set. "
            "Generate an API key at https://app.hyperliquid.xyz/API"
        )
    if not HYPERLIQUID_ACCOUNT:
        raise RuntimeError(
            "HYPERLIQUID_ACCOUNT not set. "
            "Set this to your main wallet address (not the API wallet)."
        )

    try:
        from hyperliquid.info import Info
        from hyperliquid.exchange import Exchange
        from hyperliquid.utils import constants
    except ImportError:
        raise RuntimeError(
            "hyperliquid-python-sdk not installed. Run: pip install hyperliquid-python-sdk"
        )

    base_url = constants.TESTNET_API_URL if HYPERLIQUID_TESTNET else constants.MAINNET_API_URL

    _info_instance = Info(base_url, skip_ws=True)
    _exchange_instance = Exchange(
        wallet=None,  # SDK handles wallet from private key
        base_url=base_url,
        account_address=HYPERLIQUID_ACCOUNT,
    )
    # Manually set the private key for signing
    _exchange_instance.wallet = _exchange_instance._wallet_from_key(HYPERLIQUID_PRIVATE_KEY)

    return _info_instance, _exchange_instance


def is_live_ready() -> Dict[str, Any]:
    """Check if live trading is properly configured and return status."""
    issues = []

    if not HYPERLIQUID_PRIVATE_KEY:
        issues.append("HYPERLIQUID_PRIVATE_KEY not set")
    if not HYPERLIQUID_ACCOUNT:
        issues.append("HYPERLIQUID_ACCOUNT not set")

    if not issues:
        try:
            info, _ = _get_sdk()
            state = info.user_state(HYPERLIQUID_ACCOUNT)
            balance = float(state.get("marginSummary", {}).get("accountValue", 0))
            withdrawable = float(state.get("withdrawable", 0))
            return {
                "ready": True,
                "testnet": HYPERLIQUID_TESTNET,
                "account": HYPERLIQUID_ACCOUNT,
                "balance": balance,
                "withdrawable": withdrawable,
                "issues": [],
            }
        except Exception as e:
            issues.append(f"SDK connection failed: {str(e)}")

    return {
        "ready": False,
        "testnet": HYPERLIQUID_TESTNET,
        "account": HYPERLIQUID_ACCOUNT[:8] + "..." if HYPERLIQUID_ACCOUNT else "",
        "balance": 0,
        "withdrawable": 0,
        "issues": issues,
    }


# ── Exchange Operations ──────────────────────────────────────────────


def set_leverage(symbol: str, leverage: int, is_cross: bool = False) -> Dict:
    """Set leverage for a market on Hyperliquid."""
    coin = SYMBOL_MAP.get(symbol)
    if not coin:
        raise ValueError(f"Unsupported symbol for live trading: {symbol}")

    _, exchange = _get_sdk()
    result = exchange.update_leverage(leverage, coin, is_cross=is_cross)
    return {"status": "ok", "result": result}


def open_market_position(
    symbol: str,
    direction: str,
    size_usd: float,
    current_price: float,
    leverage: int,
    slippage: float = DEFAULT_SLIPPAGE,
) -> Dict:
    """Open a market position on Hyperliquid.

    Returns dict with:
      - exchange_oid: order ID on Hyperliquid
      - filled_price: actual fill price
      - filled_size: actual fill size
      - fees: fees charged
    """
    coin = SYMBOL_MAP.get(symbol)
    if not coin:
        raise ValueError(f"Unsupported symbol for live trading: {symbol}")

    is_buy = direction == "long"
    size = size_usd / current_price

    # Set leverage before opening
    set_leverage(symbol, leverage, is_cross=False)

    info, exchange = _get_sdk()

    # Use market_open for market orders with slippage protection
    result = exchange.market_open(
        coin,
        is_buy,
        size,
        px=current_price,
        slippage=slippage,
    )

    if result.get("status") != "ok":
        raise RuntimeError(f"Hyperliquid order failed: {json.dumps(result)}")

    statuses = result.get("response", {}).get("data", {}).get("statuses", [])
    if not statuses:
        raise RuntimeError("Hyperliquid returned no order status")

    status = statuses[0]
    if "error" in status:
        raise RuntimeError(f"Hyperliquid order error: {status['error']}")

    # Extract fill details
    if "filled" in status:
        fill = status["filled"]
        return {
            "exchange_oid": fill.get("oid"),
            "filled_price": float(fill.get("avgPx", current_price)),
            "filled_size": float(fill.get("totalSz", size)),
            "status": "filled",
        }
    elif "resting" in status:
        # Order is resting (limit), shouldn't happen with market_open
        return {
            "exchange_oid": status["resting"].get("oid"),
            "filled_price": current_price,
            "filled_size": size,
            "status": "resting",
        }

    return {
        "exchange_oid": None,
        "filled_price": current_price,
        "filled_size": size,
        "status": "unknown",
    }


def close_market_position(
    symbol: str,
    size: Optional[float] = None,
    current_price: Optional[float] = None,
    slippage: float = DEFAULT_SLIPPAGE,
) -> Dict:
    """Close a position on Hyperliquid.

    If size is None, closes the entire position.

    Returns dict with:
      - filled_price: actual fill price
      - filled_size: actual fill size
      - status: "filled" or "error"
    """
    coin = SYMBOL_MAP.get(symbol)
    if not coin:
        raise ValueError(f"Unsupported symbol for live trading: {symbol}")

    _, exchange = _get_sdk()

    result = exchange.market_close(
        coin,
        sz=size,
        px=current_price,
        slippage=slippage,
    )

    if result.get("status") != "ok":
        raise RuntimeError(f"Hyperliquid close failed: {json.dumps(result)}")

    statuses = result.get("response", {}).get("data", {}).get("statuses", [])
    if not statuses:
        raise RuntimeError("Hyperliquid returned no close status")

    status = statuses[0]
    if "error" in status:
        raise RuntimeError(f"Hyperliquid close error: {status['error']}")

    if "filled" in status:
        fill = status["filled"]
        return {
            "filled_price": float(fill.get("avgPx", current_price or 0)),
            "filled_size": float(fill.get("totalSz", size or 0)),
            "status": "filled",
        }

    return {
        "filled_price": current_price or 0,
        "filled_size": size or 0,
        "status": "unknown",
    }


def place_tp_sl_orders(
    symbol: str,
    direction: str,
    size: float,
    stop_loss: Optional[float] = None,
    take_profit: Optional[float] = None,
) -> Dict:
    """Place TP/SL trigger orders on Hyperliquid for an open position."""
    coin = SYMBOL_MAP.get(symbol)
    if not coin:
        raise ValueError(f"Unsupported symbol for live trading: {symbol}")

    _, exchange = _get_sdk()
    results = {"stop_loss_oid": None, "take_profit_oid": None}

    # For a long, SL is a sell trigger below current price
    # For a short, SL is a buy trigger above current price
    is_buy_to_close = direction == "short"

    if stop_loss:
        sl_result = exchange.order(
            coin,
            is_buy_to_close,
            size,
            str(stop_loss),
            order_type={
                "trigger": {
                    "isMarket": True,
                    "triggerPx": str(stop_loss),
                    "tpsl": "sl",
                }
            },
            reduce_only=True,
        )
        if sl_result.get("status") == "ok":
            statuses = sl_result.get("response", {}).get("data", {}).get("statuses", [])
            if statuses and "resting" in statuses[0]:
                results["stop_loss_oid"] = statuses[0]["resting"]["oid"]

    if take_profit:
        tp_result = exchange.order(
            coin,
            is_buy_to_close,
            size,
            str(take_profit),
            order_type={
                "trigger": {
                    "isMarket": True,
                    "triggerPx": str(take_profit),
                    "tpsl": "tp",
                }
            },
            reduce_only=True,
        )
        if tp_result.get("status") == "ok":
            statuses = tp_result.get("response", {}).get("data", {}).get("statuses", [])
            if statuses and "resting" in statuses[0]:
                results["take_profit_oid"] = statuses[0]["resting"]["oid"]

    return results


def get_exchange_positions() -> list:
    """Get all open positions from Hyperliquid."""
    info, _ = _get_sdk()
    state = info.user_state(HYPERLIQUID_ACCOUNT)

    positions = []
    for asset_pos in state.get("assetPositions", []):
        pos = asset_pos.get("position", {})
        if float(pos.get("szi", 0)) != 0:
            positions.append({
                "coin": pos.get("coin"),
                "size": float(pos.get("szi", 0)),
                "entry_price": float(pos.get("entryPx", 0)),
                "mark_price": float(pos.get("positionValue", 0)) / abs(float(pos.get("szi", 1))) if float(pos.get("szi", 0)) != 0 else 0,
                "unrealized_pnl": float(pos.get("unrealizedPnl", 0)),
                "liquidation_price": float(pos.get("liquidationPx", 0)) if pos.get("liquidationPx") else None,
                "leverage": float(pos.get("leverage", {}).get("value", 1)),
                "margin_used": float(pos.get("marginUsed", 0)),
                "direction": "long" if float(pos.get("szi", 0)) > 0 else "short",
            })

    return positions


def get_exchange_balance() -> Dict:
    """Get account balance from Hyperliquid."""
    info, _ = _get_sdk()
    state = info.user_state(HYPERLIQUID_ACCOUNT)

    margin = state.get("marginSummary", {})
    return {
        "account_value": float(margin.get("accountValue", 0)),
        "total_margin_used": float(margin.get("totalMarginUsed", 0)),
        "total_ntl_pos": float(margin.get("totalNtlPos", 0)),
        "withdrawable": float(state.get("withdrawable", 0)),
    }


def emergency_close_all() -> Dict:
    """KILL SWITCH: Close ALL open positions on Hyperliquid immediately."""
    info, exchange = _get_sdk()
    state = info.user_state(HYPERLIQUID_ACCOUNT)

    closed = []
    errors = []

    for asset_pos in state.get("assetPositions", []):
        pos = asset_pos.get("position", {})
        size = float(pos.get("szi", 0))
        if size == 0:
            continue

        coin = pos.get("coin", "")
        try:
            result = exchange.market_close(coin)
            if result.get("status") == "ok":
                closed.append(coin)
            else:
                errors.append({"coin": coin, "error": json.dumps(result)})
        except Exception as e:
            errors.append({"coin": coin, "error": str(e)})

    return {
        "closed": closed,
        "errors": errors,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── Safety Checks ────────────────────────────────────────────────────

def validate_before_trade(
    symbol: str,
    size_usd: float,
    max_total_exposure: float = 50000,
    max_single_position: float = 10000,
) -> Dict:
    """Pre-trade safety validation for live trading.

    Returns {"safe": True} or {"safe": False, "reason": "..."}.
    """
    # Check symbol supported
    if symbol not in SYMBOL_MAP:
        return {"safe": False, "reason": f"Symbol {symbol} not supported on Hyperliquid"}

    # Check position size
    if size_usd < 10:
        return {"safe": False, "reason": "Minimum order size is $10 on Hyperliquid"}

    if size_usd > max_single_position:
        return {"safe": False, "reason": f"Position ${size_usd:.0f} exceeds max ${max_single_position:.0f}"}

    # Check total exposure
    try:
        balance = get_exchange_balance()
        current_exposure = balance.get("total_ntl_pos", 0)
        if current_exposure + size_usd > max_total_exposure:
            return {
                "safe": False,
                "reason": f"Total exposure would be ${current_exposure + size_usd:.0f}, exceeds max ${max_total_exposure:.0f}",
            }
    except Exception as e:
        return {"safe": False, "reason": f"Could not check balance: {str(e)}"}

    return {"safe": True}


def reconcile_positions(local_positions: list) -> Dict:
    """Compare local DB positions with Hyperliquid exchange positions.

    Returns discrepancies that need attention.
    """
    try:
        exchange_positions = get_exchange_positions()
    except Exception as e:
        return {"error": f"Could not fetch exchange positions: {str(e)}"}

    # Build lookup by coin
    exchange_by_coin = {p["coin"]: p for p in exchange_positions}

    discrepancies = []

    for local in local_positions:
        coin = SYMBOL_MAP.get(local.get("symbol", ""))
        if not coin:
            continue

        if coin in exchange_by_coin:
            ex_pos = exchange_by_coin[coin]
            # Check direction match
            if local.get("direction") != ex_pos["direction"]:
                discrepancies.append({
                    "type": "direction_mismatch",
                    "symbol": local["symbol"],
                    "local_direction": local.get("direction"),
                    "exchange_direction": ex_pos["direction"],
                })
            # Check size roughly matches (within 5%)
            local_qty = local.get("quantity", 0)
            ex_qty = abs(ex_pos["size"])
            if local_qty > 0 and abs(local_qty - ex_qty) / local_qty > 0.05:
                discrepancies.append({
                    "type": "size_mismatch",
                    "symbol": local["symbol"],
                    "local_size": local_qty,
                    "exchange_size": ex_qty,
                })
            del exchange_by_coin[coin]
        else:
            discrepancies.append({
                "type": "local_only",
                "symbol": local["symbol"],
                "message": "Position exists in DB but not on exchange",
            })

    # Check for exchange positions not in local DB
    for coin, ex_pos in exchange_by_coin.items():
        discrepancies.append({
            "type": "exchange_only",
            "coin": coin,
            "size": ex_pos["size"],
            "message": "Position exists on exchange but not in DB",
        })

    return {
        "synced": len(discrepancies) == 0,
        "discrepancies": discrepancies,
        "local_count": len(local_positions),
        "exchange_count": len(exchange_positions),
    }

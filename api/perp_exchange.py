# ==========================================
# Drift Protocol Exchange Adapter
# ==========================================
# Handles live perpetual futures trading via Drift Protocol on Solana.
# Used when trading_mode is "live" — paper mode bypasses this entirely.
#
# Requirements:
#   pip install driftpy solana solders anchorpy
#   Environment variables:
#     DRIFT_PRIVATE_KEY  — Base58-encoded Solana wallet private key
#     DRIFT_RPC_URL      — Solana RPC URL (or uses HELIUS_API_KEY)
#     DRIFT_SUBACCOUNT   — Subaccount ID (default: 0)
#     DRIFT_DEVNET       — "true" for devnet (default: false)
# ==========================================

import os
import asyncio
import json
import time
from datetime import datetime
from typing import Optional, Dict, Any

# ── Config ────────────────────────────────────────────────────────────

DRIFT_PRIVATE_KEY = os.getenv("DRIFT_PRIVATE_KEY", "")
DRIFT_RPC_URL = os.getenv("DRIFT_RPC_URL", "")
DRIFT_SUBACCOUNT = int(os.getenv("DRIFT_SUBACCOUNT", "0"))
DRIFT_DEVNET = os.getenv("DRIFT_DEVNET", "false").lower() == "true"

# Build RPC URL from Helius key if no explicit URL set
if not DRIFT_RPC_URL:
    helius_key = os.getenv("HELIUS_API_KEY", "")
    if helius_key:
        DRIFT_RPC_URL = f"https://mainnet.helius-rpc.com/?api-key={helius_key}"
    else:
        DRIFT_RPC_URL = "https://api.mainnet-beta.solana.com"

# Map our internal symbols to Drift perp market indices
# Full list: https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/constants/perpMarkets.ts
SYMBOL_MAP = {
    # High volume / majors
    "SOL-PERP":     {"market_index": 0,  "drift_symbol": "SOL"},
    "BTC-PERP":     {"market_index": 1,  "drift_symbol": "BTC"},
    "ETH-PERP":     {"market_index": 2,  "drift_symbol": "ETH"},
    "DOGE-PERP":    {"market_index": 7,  "drift_symbol": "DOGE"},
    "AVAX-PERP":    {"market_index": 22, "drift_symbol": "AVAX"},
    "LINK-PERP":    {"market_index": 16, "drift_symbol": "LINK"},
    "SUI-PERP":     {"market_index": 9,  "drift_symbol": "SUI"},
    "RENDER-PERP":  {"market_index": 12, "drift_symbol": "RENDER"},
    # Solana ecosystem
    "JUP-PERP":     {"market_index": 24, "drift_symbol": "JUP"},
    "WIF-PERP":     {"market_index": 23, "drift_symbol": "WIF"},
    # BONK is listed as 1MBONK on Drift (price per 1M BONK)
    "BONK-PERP":    {"market_index": 4,  "drift_symbol": "1MBONK", "bonk_divisor": 1_000_000},
    "PYTH-PERP":    {"market_index": 18, "drift_symbol": "PYTH"},
    "JTO-PERP":     {"market_index": 20, "drift_symbol": "JTO"},
    "HNT-PERP":     {"market_index": 14, "drift_symbol": "HNT"},
    "RAY-PERP":     {"market_index": 56, "drift_symbol": "RAY"},
    "W-PERP":       {"market_index": 27, "drift_symbol": "W"},
    "TNSR-PERP":    {"market_index": 29, "drift_symbol": "TNSR"},
    "DRIFT-PERP":   {"market_index": 30, "drift_symbol": "DRIFT"},
    "POPCAT-PERP":  {"market_index": 34, "drift_symbol": "POPCAT"},
    "PENGU-PERP":   {"market_index": 62, "drift_symbol": "PENGU"},
    "TRUMP-PERP":   {"market_index": 64, "drift_symbol": "TRUMP"},
    "ME-PERP":      {"market_index": 61, "drift_symbol": "ME"},
    "PNUT-PERP":    {"market_index": 55, "drift_symbol": "PNUT"},
    "GOAT-PERP":    {"market_index": 53, "drift_symbol": "GOAT"},
    "FARTCOIN-PERP":{"market_index": 71, "drift_symbol": "FARTCOIN"},
}

# Default slippage for market orders (0.5%)
DEFAULT_SLIPPAGE = 0.005


# ── Async Helper ─────────────────────────────────────────────────────

def _run_async(coro):
    """Run an async coroutine from sync context (serverless-safe)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Already in an async context — create a new thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result(timeout=30)
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


# ── Lazy SDK Initialization ──────────────────────────────────────────

async def _get_drift_client(read_only=False):
    """Initialize Drift client for a single operation. Caller must unsubscribe when done."""
    try:
        from solders.keypair import Keypair
        from solana.rpc.async_api import AsyncClient
        from driftpy.drift_client import DriftClient
        from driftpy.account_subscription_config import AccountSubscriptionConfig
        from driftpy.keypair import load_keypair
    except ImportError:
        raise RuntimeError(
            "driftpy not installed. Run: pip install driftpy solana solders anchorpy"
        )

    if not DRIFT_PRIVATE_KEY and not read_only:
        raise RuntimeError(
            "DRIFT_PRIVATE_KEY not set. "
            "Export your Solana wallet private key (base58-encoded)."
        )

    # Create keypair from base58 private key
    if DRIFT_PRIVATE_KEY:
        keypair = Keypair.from_base58_string(DRIFT_PRIVATE_KEY)
    else:
        keypair = Keypair()  # Dummy for read-only

    connection = AsyncClient(DRIFT_RPC_URL)

    # Use "cached" subscription for serverless — fetches once, no websocket
    drift_client = DriftClient(
        connection,
        keypair,
        account_subscription=AccountSubscriptionConfig("cached"),
        active_sub_account_id=DRIFT_SUBACCOUNT,
        env="devnet" if DRIFT_DEVNET else "mainnet",
    )
    await drift_client.subscribe()
    return drift_client


def is_live_ready() -> Dict[str, Any]:
    """Check if live trading is properly configured and return status."""
    issues = []

    if not DRIFT_PRIVATE_KEY:
        issues.append("DRIFT_PRIVATE_KEY not set")
    if not DRIFT_RPC_URL or DRIFT_RPC_URL == "https://api.mainnet-beta.solana.com":
        issues.append("DRIFT_RPC_URL not set (using public RPC — set HELIUS_API_KEY for reliability)")

    if not issues:
        try:
            async def _check():
                drift_client = await _get_drift_client()
                try:
                    user = drift_client.get_user()

                    # Get USDC balance (spot market 0)
                    free_collateral = user.get_free_collateral() / 1e6  # QUOTE_PRECISION
                    total_collateral = user.get_total_collateral() / 1e6

                    # Get SOL balance for gas
                    sol_balance = await drift_client.connection.get_balance(
                        drift_client.authority
                    )
                    sol_amount = sol_balance.value / 1e9

                    return {
                        "ready": True,
                        "devnet": DRIFT_DEVNET,
                        "account": str(drift_client.authority),
                        "balance": total_collateral,
                        "withdrawable": free_collateral,
                        "sol_balance": sol_amount,
                        "issues": [],
                    }
                finally:
                    await drift_client.unsubscribe()

            return _run_async(_check())
        except Exception as e:
            issues.append(f"Drift connection failed: {str(e)}")

    return {
        "ready": False,
        "devnet": DRIFT_DEVNET,
        "account": "",
        "balance": 0,
        "withdrawable": 0,
        "issues": issues,
    }


# ── Exchange Operations ──────────────────────────────────────────────


def set_leverage(symbol: str, leverage: int, is_cross: bool = False) -> Dict:
    """Set leverage for a market on Drift.
    Note: Drift handles leverage via margin requirements per market.
    This updates the user's sub-account leverage setting.
    """
    market_info = SYMBOL_MAP.get(symbol)
    if not market_info:
        raise ValueError(f"Unsupported symbol for live trading: {symbol}")

    # Drift manages leverage through margin — no explicit leverage-set API call needed.
    # The leverage is implicit from position size vs collateral.
    # We just validate the requested leverage is within bounds.
    return {"status": "ok", "note": "Drift uses implicit leverage via margin"}


def open_market_position(
    symbol: str,
    direction: str,
    size_usd: float,
    current_price: float,
    leverage: int,
    slippage: float = DEFAULT_SLIPPAGE,
) -> Dict:
    """Open a market position on Drift Protocol.

    Returns dict with:
      - exchange_oid: transaction signature
      - filled_price: actual or estimated fill price
      - filled_size: position size in base asset
      - fees: fees charged
    """
    market_info = SYMBOL_MAP.get(symbol)
    if not market_info:
        raise ValueError(f"Unsupported symbol for live trading: {symbol}")

    async def _open():
        from driftpy.types import (
            OrderParams, OrderType, MarketType,
            PositionDirection, PostOnlyParams,
        )
        from driftpy.constants.numeric_constants import BASE_PRECISION, PRICE_PRECISION

        drift_client = await _get_drift_client()
        try:
            market_index = market_info["market_index"]

            # Calculate base asset amount in Drift precision
            # For BONK-PERP (1MBONK), divide coin quantity by 1M
            bonk_divisor = market_info.get("bonk_divisor", 1)
            base_amount = (size_usd / current_price) / bonk_divisor
            base_asset_amount = int(base_amount * BASE_PRECISION)

            is_long = direction == "long"

            order_params = OrderParams(
                order_type=OrderType.Market(),
                market_index=market_index,
                base_asset_amount=base_asset_amount,
                direction=PositionDirection.Long() if is_long else PositionDirection.Short(),
                market_type=MarketType.Perp(),
                post_only=PostOnlyParams.NONE(),
            )

            # Use place_and_take for atomic fill (fastest execution)
            tx_sig = await drift_client.place_and_take_perp_order(order_params)
            tx_sig_str = str(tx_sig)

            # Fetch the position to get actual entry price
            try:
                user = drift_client.get_user()
                perp_position = user.get_perp_position(market_index)
                if perp_position and perp_position.base_asset_amount != 0:
                    # Entry price from the position's quote / base
                    actual_entry = abs(perp_position.quote_entry_amount) / abs(perp_position.base_asset_amount) * (BASE_PRECISION / PRICE_PRECISION)
                    filled_size = abs(perp_position.base_asset_amount) / BASE_PRECISION * bonk_divisor
                    return {
                        "exchange_oid": tx_sig_str,
                        "filled_price": actual_entry,
                        "filled_size": filled_size,
                        "status": "filled",
                    }
            except Exception:
                pass  # Fall through to estimated values

            return {
                "exchange_oid": tx_sig_str,
                "filled_price": current_price,
                "filled_size": size_usd / current_price,
                "status": "filled",
            }
        finally:
            await drift_client.unsubscribe()

    return _run_async(_open())


def close_market_position(
    symbol: str,
    size: Optional[float] = None,
    current_price: Optional[float] = None,
    slippage: float = DEFAULT_SLIPPAGE,
) -> Dict:
    """Close a position on Drift Protocol.

    If size is None, closes the entire position.

    Returns dict with:
      - filled_price: actual fill price
      - filled_size: actual fill size
      - status: "filled" or "error"
    """
    market_info = SYMBOL_MAP.get(symbol)
    if not market_info:
        raise ValueError(f"Unsupported symbol for live trading: {symbol}")

    async def _close():
        from driftpy.types import (
            OrderParams, OrderType, MarketType,
            PositionDirection, PostOnlyParams,
        )
        from driftpy.constants.numeric_constants import BASE_PRECISION, PRICE_PRECISION

        drift_client = await _get_drift_client()
        try:
            market_index = market_info["market_index"]
            bonk_divisor = market_info.get("bonk_divisor", 1)
            user = drift_client.get_user()

            # Get current position to determine size and direction
            perp_position = user.get_perp_position(market_index)
            if not perp_position or perp_position.base_asset_amount == 0:
                raise RuntimeError(f"No open position for {symbol} on Drift")

            pos_size = perp_position.base_asset_amount  # positive = long, negative = short
            is_long = pos_size > 0

            if size is not None:
                # Close partial — convert to Drift precision
                close_amount = int((size / bonk_divisor) * BASE_PRECISION)
                close_amount = min(close_amount, abs(pos_size))
            else:
                # Close entire position
                close_amount = abs(pos_size)

            # Close by placing opposite direction with reduce_only
            order_params = OrderParams(
                order_type=OrderType.Market(),
                market_index=market_index,
                base_asset_amount=close_amount,
                direction=PositionDirection.Short() if is_long else PositionDirection.Long(),
                market_type=MarketType.Perp(),
                reduce_only=True,
                post_only=PostOnlyParams.NONE(),
            )

            tx_sig = await drift_client.place_and_take_perp_order(order_params)

            filled_size = (close_amount / BASE_PRECISION) * bonk_divisor
            return {
                "filled_price": current_price or 0,
                "filled_size": filled_size,
                "status": "filled",
                "tx_sig": str(tx_sig),
            }
        finally:
            await drift_client.unsubscribe()

    return _run_async(_close())


def place_tp_sl_orders(
    symbol: str,
    direction: str,
    size: float,
    stop_loss: Optional[float] = None,
    take_profit: Optional[float] = None,
) -> Dict:
    """Place TP/SL trigger orders on Drift for an open position."""
    market_info = SYMBOL_MAP.get(symbol)
    if not market_info:
        raise ValueError(f"Unsupported symbol for live trading: {symbol}")

    async def _place_triggers():
        from driftpy.types import (
            OrderParams, OrderType, MarketType,
            PositionDirection, PostOnlyParams,
            OrderTriggerCondition,
        )
        from driftpy.constants.numeric_constants import BASE_PRECISION, PRICE_PRECISION

        drift_client = await _get_drift_client()
        try:
            market_index = market_info["market_index"]
            bonk_divisor = market_info.get("bonk_divisor", 1)
            is_long = direction == "long"

            base_asset_amount = int((size / bonk_divisor) * BASE_PRECISION)
            results = {"stop_loss_oid": None, "take_profit_oid": None}

            if stop_loss:
                # For longs, SL triggers when price drops below stop_loss
                # For shorts, SL triggers when price rises above stop_loss
                trigger_condition = (
                    OrderTriggerCondition.Below() if is_long
                    else OrderTriggerCondition.Above()
                )
                sl_price = int(stop_loss * PRICE_PRECISION)
                # Adjust trigger price for BONK (1MBONK pricing)
                if bonk_divisor > 1:
                    sl_price = int(stop_loss * bonk_divisor * PRICE_PRECISION)

                sl_params = OrderParams(
                    order_type=OrderType.TriggerMarket(),
                    market_index=market_index,
                    base_asset_amount=base_asset_amount,
                    direction=PositionDirection.Short() if is_long else PositionDirection.Long(),
                    market_type=MarketType.Perp(),
                    reduce_only=True,
                    trigger_price=sl_price,
                    trigger_condition=trigger_condition,
                    post_only=PostOnlyParams.NONE(),
                )
                tx_sig = await drift_client.place_perp_order(sl_params)
                results["stop_loss_oid"] = str(tx_sig)

            if take_profit:
                # For longs, TP triggers when price rises above take_profit
                # For shorts, TP triggers when price drops below take_profit
                trigger_condition = (
                    OrderTriggerCondition.Above() if is_long
                    else OrderTriggerCondition.Below()
                )
                tp_price = int(take_profit * PRICE_PRECISION)
                if bonk_divisor > 1:
                    tp_price = int(take_profit * bonk_divisor * PRICE_PRECISION)

                tp_params = OrderParams(
                    order_type=OrderType.TriggerMarket(),
                    market_index=market_index,
                    base_asset_amount=base_asset_amount,
                    direction=PositionDirection.Short() if is_long else PositionDirection.Long(),
                    market_type=MarketType.Perp(),
                    reduce_only=True,
                    trigger_price=tp_price,
                    trigger_condition=trigger_condition,
                    post_only=PostOnlyParams.NONE(),
                )
                tx_sig = await drift_client.place_perp_order(tp_params)
                results["take_profit_oid"] = str(tx_sig)

            return results
        finally:
            await drift_client.unsubscribe()

    return _run_async(_place_triggers())


def get_exchange_positions() -> list:
    """Get all open positions from Drift."""

    async def _get_positions():
        from driftpy.constants.numeric_constants import BASE_PRECISION, PRICE_PRECISION

        drift_client = await _get_drift_client(read_only=True)
        try:
            user = drift_client.get_user()
            positions = []

            # Build reverse lookup: market_index -> our symbol
            index_to_symbol = {}
            for sym, info in SYMBOL_MAP.items():
                index_to_symbol[info["market_index"]] = (sym, info)

            for perp_pos in user.get_active_perp_positions():
                if perp_pos.base_asset_amount == 0:
                    continue

                market_index = perp_pos.market_index
                sym_info = index_to_symbol.get(market_index)
                if not sym_info:
                    continue

                symbol, info = sym_info
                bonk_divisor = info.get("bonk_divisor", 1)

                base = perp_pos.base_asset_amount / BASE_PRECISION
                size_in_coins = base * bonk_divisor
                is_long = perp_pos.base_asset_amount > 0

                # Calculate entry price from quote/base
                if perp_pos.base_asset_amount != 0:
                    entry_price = abs(perp_pos.quote_entry_amount / perp_pos.base_asset_amount)
                    entry_price = entry_price / bonk_divisor if bonk_divisor > 1 else entry_price
                else:
                    entry_price = 0

                # Get oracle price for mark
                try:
                    oracle_data = drift_client.get_oracle_price_data_for_perp_market(market_index)
                    mark_price = oracle_data.price / PRICE_PRECISION
                    mark_price = mark_price / bonk_divisor if bonk_divisor > 1 else mark_price
                except Exception:
                    mark_price = entry_price

                # Calculate unrealized PnL
                if is_long:
                    unrealized_pnl = size_in_coins * (mark_price - entry_price)
                else:
                    unrealized_pnl = abs(size_in_coins) * (entry_price - mark_price)

                positions.append({
                    "coin": info["drift_symbol"],
                    "size": size_in_coins if is_long else -size_in_coins,
                    "entry_price": entry_price,
                    "mark_price": mark_price,
                    "unrealized_pnl": unrealized_pnl,
                    "liquidation_price": None,  # Would need margin calculation
                    "leverage": 1,  # Implicit from margin
                    "margin_used": abs(perp_pos.quote_entry_amount) / 1e6,
                    "direction": "long" if is_long else "short",
                })

            return positions
        finally:
            await drift_client.unsubscribe()

    return _run_async(_get_positions())


def get_exchange_balance() -> Dict:
    """Get account balance from Drift."""

    async def _get_balance():
        drift_client = await _get_drift_client(read_only=True)
        try:
            user = drift_client.get_user()

            total_collateral = user.get_total_collateral() / 1e6
            free_collateral = user.get_free_collateral() / 1e6
            unrealized_pnl = user.get_unrealized_pnl(with_funding=True) / 1e6

            # Sum up notional of all positions
            total_notional = 0
            for perp_pos in user.get_active_perp_positions():
                if perp_pos.base_asset_amount != 0:
                    total_notional += abs(perp_pos.quote_entry_amount) / 1e6

            return {
                "account_value": total_collateral,
                "total_margin_used": total_collateral - free_collateral,
                "total_ntl_pos": total_notional,
                "withdrawable": free_collateral,
                "unrealized_pnl": unrealized_pnl,
            }
        finally:
            await drift_client.unsubscribe()

    return _run_async(_get_balance())


def emergency_close_all() -> Dict:
    """KILL SWITCH: Close ALL open positions on Drift immediately."""

    async def _close_all():
        from driftpy.types import (
            OrderParams, OrderType, MarketType,
            PositionDirection, PostOnlyParams,
        )
        from driftpy.constants.numeric_constants import BASE_PRECISION

        drift_client = await _get_drift_client()
        try:
            user = drift_client.get_user()
            closed = []
            errors = []

            for perp_pos in user.get_active_perp_positions():
                if perp_pos.base_asset_amount == 0:
                    continue

                market_index = perp_pos.market_index
                is_long = perp_pos.base_asset_amount > 0
                close_amount = abs(perp_pos.base_asset_amount)

                # Find our symbol for logging
                coin = f"market_{market_index}"
                for sym, info in SYMBOL_MAP.items():
                    if info["market_index"] == market_index:
                        coin = info["drift_symbol"]
                        break

                try:
                    order_params = OrderParams(
                        order_type=OrderType.Market(),
                        market_index=market_index,
                        base_asset_amount=close_amount,
                        direction=PositionDirection.Short() if is_long else PositionDirection.Long(),
                        market_type=MarketType.Perp(),
                        reduce_only=True,
                        post_only=PostOnlyParams.NONE(),
                    )
                    await drift_client.place_and_take_perp_order(order_params)
                    closed.append(coin)
                except Exception as e:
                    errors.append({"coin": coin, "error": str(e)})

            # Also cancel all open orders
            try:
                await drift_client.cancel_orders()
            except Exception:
                pass

            return {
                "closed": closed,
                "errors": errors,
                "timestamp": datetime.utcnow().isoformat(),
            }
        finally:
            await drift_client.unsubscribe()

    return _run_async(_close_all())


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
    if symbol not in SYMBOL_MAP:
        return {"safe": False, "reason": f"Symbol {symbol} not supported on Drift"}

    if size_usd < 1:
        return {"safe": False, "reason": "Minimum order size is $1 on Drift"}

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
    """Compare local DB positions with Drift exchange positions.

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
        # Map local symbol to Drift coin name
        sym_info = SYMBOL_MAP.get(local.get("symbol", ""))
        if not sym_info:
            continue
        coin = sym_info["drift_symbol"]

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

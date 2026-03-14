# ==========================================
# Perpetual Paper Trading — Grid Strategy
# ==========================================
# Places buy and sell limit orders at regular intervals above and below
# the current price, capturing profit as price oscillates between levels.
#
# Grid levels are ATR-based (0.5x ATR spacing) so they adapt to volatility.
# Each grid order has a paired exit one grid spacing away.
#
# Risk controls:
#   - Conservative 2x leverage
#   - Small size per level (0.5% of equity)
#   - Catastrophic stop at 3x grid spacing
#   - Max 2 symbols running grids simultaneously
#   - Optional martingale (default OFF, hard-capped at level 5)
#   - Refreshes only once per hour to avoid order churn
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from database import db
from perp_engine import (
    MARKETS, INITIAL_BALANCE, MAX_OPEN_POSITIONS,
    open_position, perp_accounts, perp_positions,
    create_pending_order, cancel_all_pending_orders, get_pending_orders,
)
from perp_strategies import get_price_series, store_price, atr

# ── Collections ──────────────────────────────────────────────────────────

perp_grid_state = db["perp_grid_state"]
perp_grid_state.create_index([("account_id", 1)], unique=True)

# ── Constants ────────────────────────────────────────────────────────────

# Grid configuration
GRID_LEVELS = 5                   # 5 above + 5 below = 10 orders total
GRID_ATR_SPACING_MULT = 0.5      # Grid spacing = 0.5 * ATR
GRID_SIZE_PCT = 0.005             # 0.5% of equity per grid level
GRID_LEVERAGE = 2                 # Conservative leverage
GRID_SL_SPACING_MULT = 3         # Stop loss at 3x grid spacing from entry
GRID_EXPIRY_HOURS = 2            # Grid orders expire after 2 hours (refreshed hourly)
GRID_REFRESH_MINUTES = 60        # Only refresh grid once per hour
GRID_DRIFT_THRESHOLD = 3         # Rebalance if price drifts >3 spacings from center
MAX_GRID_SYMBOLS = 2             # Max 2 symbols running grids simultaneously
ATR_PERIOD = 14                  # ATR lookback period
MIN_CANDLES_FOR_GRID = 30        # Need at least 30 candles for ATR

# Candidate markets for grid trading (most liquid)
GRID_MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP"]

# Martingale settings (default OFF)
MARTINGALE_ENABLED = False
MARTINGALE_MAX_LEVEL = 5          # Hard cap: level 5 = 16x base size
MARTINGALE_MAX_EQUITY_PCT = 0.10  # Never risk more than 10% total equity in grid

# Smooth martingale: gentler 1.3x-1.5x multiplier instead of classic 2x doubling
# Reduces risk of catastrophic loss while still averaging into positions
SMOOTH_MARTINGALE_MULT = 1.3      # Each level is 1.3x previous (vs 2x classic)
# Anti-martingale: increase size on WINNERS, reset on losers (reverse progression)
ANTI_MARTINGALE_ENABLED = False
ANTI_MARTINGALE_MULT = 1.3        # Increase winning grid level sizes by 1.3x


# ── Grid State Management ────────────────────────────────────────────────

def get_grid_state(wallet: str) -> Dict:
    """Get the current grid state for an account."""
    state = perp_grid_state.find_one({"account_id": wallet})
    if state:
        result = dict(state)
        result.pop("_id", None)
        return result
    return {
        "account_id": wallet,
        "grids": {},              # symbol -> grid config
        "last_refresh": None,     # Last time grids were refreshed
        "martingale_enabled": MARTINGALE_ENABLED,
        "smooth_martingale": False,     # Use 1.3x instead of 2x
        "anti_martingale": ANTI_MARTINGALE_ENABLED,
    }


def save_grid_state(wallet: str, state: Dict):
    """Save the grid state for an account."""
    state["account_id"] = wallet
    state["updated_at"] = datetime.utcnow()
    perp_grid_state.update_one(
        {"account_id": wallet},
        {"$set": state},
        upsert=True,
    )


# ── Symbol Selection ─────────────────────────────────────────────────────

def select_grid_symbols(prices: Dict[str, float]) -> List[str]:
    """Pick the best symbols for grid trading — lowest ATR/price ratio (most range-bound).

    Grid trading profits from oscillation, so we want symbols that are
    choppy (low directional trend) relative to their price level.
    """
    candidates = []

    for symbol in GRID_MARKETS:
        if symbol not in prices:
            continue

        price_series = get_price_series(symbol, MIN_CANDLES_FOR_GRID)
        if len(price_series) < MIN_CANDLES_FOR_GRID:
            continue

        atr_vals = atr(price_series, ATR_PERIOD)
        if not atr_vals:
            continue

        curr_atr = atr_vals[-1]
        curr_price = prices[symbol]

        # ATR/price ratio — lower = more range-bound = better for grids
        atr_ratio = curr_atr / curr_price if curr_price > 0 else float("inf")

        candidates.append({
            "symbol": symbol,
            "atr_ratio": atr_ratio,
            "atr": curr_atr,
            "price": curr_price,
        })

    # Sort by ATR/price ratio ascending (most range-bound first)
    candidates.sort(key=lambda c: c["atr_ratio"])

    # Return top N symbols
    selected = [c["symbol"] for c in candidates[:MAX_GRID_SYMBOLS]]
    if selected:
        print(f"[grid] Selected symbols: {selected} (ATR ratios: {[round(c['atr_ratio'], 6) for c in candidates[:MAX_GRID_SYMBOLS]]})")

    return selected


# ── Grid Calculation ─────────────────────────────────────────────────────

def calculate_grid_levels(
    current_price: float,
    atr_value: float,
    equity: float,
    martingale: bool = False,
    **kwargs,
) -> Dict:
    """Calculate grid buy/sell levels, sizes, SL, and TP for each level.

    Returns:
        {
            "center_price": float,
            "spacing": float,
            "buy_levels": [{"price", "size_usd", "sl", "tp", "level"}, ...],
            "sell_levels": [{"price", "size_usd", "sl", "tp", "level"}, ...],
        }
    """
    spacing = atr_value * GRID_ATR_SPACING_MULT
    base_size = equity * GRID_SIZE_PCT

    # Safety: spacing must be meaningful
    if spacing <= 0 or spacing / current_price < 0.0001:
        print(f"[grid] Spacing too small: ${spacing:.6f} for price ${current_price:.4f}")
        return None

    buy_levels = []
    sell_levels = []

    # Calculate total martingale exposure for equity check
    if martingale:
        total_exposure = sum(base_size * (2 ** i) for i in range(GRID_LEVELS))
        max_allowed = equity * MARTINGALE_MAX_EQUITY_PCT
        if total_exposure > max_allowed:
            print(f"[grid] Martingale exposure ${total_exposure:.2f} exceeds {MARTINGALE_MAX_EQUITY_PCT*100}% cap (${max_allowed:.2f}), using flat sizing")
            martingale = False

    # Determine sizing mode
    smooth = kwargs.get("smooth_martingale", False)

    for i in range(1, GRID_LEVELS + 1):
        # Size: flat, classic martingale (2x), or smooth martingale (1.3x)
        if martingale and i <= MARTINGALE_MAX_LEVEL:
            if smooth:
                level_size = base_size * (SMOOTH_MARTINGALE_MULT ** (i - 1))
            else:
                level_size = base_size * (2 ** (i - 1))
        else:
            level_size = base_size

        # Minimum order size
        if level_size < 10:
            continue

        # --- Buy levels (below current price) ---
        buy_price = current_price - (i * spacing)
        if buy_price <= 0:
            continue

        buy_tp = buy_price + spacing              # TP one grid level up
        buy_sl = buy_price - (GRID_SL_SPACING_MULT * spacing)  # Catastrophic stop
        if buy_sl <= 0:
            buy_sl = buy_price * 0.95  # Fallback: 5% below entry

        buy_levels.append({
            "price": round(buy_price, 6),
            "size_usd": round(level_size, 2),
            "tp": round(buy_tp, 6),
            "sl": round(buy_sl, 6),
            "level": i,
        })

        # --- Sell levels (above current price) ---
        sell_price = current_price + (i * spacing)
        sell_tp = sell_price - spacing             # TP one grid level down
        sell_sl = sell_price + (GRID_SL_SPACING_MULT * spacing)  # Catastrophic stop

        sell_levels.append({
            "price": round(sell_price, 6),
            "size_usd": round(level_size, 2),
            "tp": round(sell_tp, 6),
            "sl": round(sell_sl, 6),
            "level": i,
        })

    return {
        "center_price": current_price,
        "spacing": round(spacing, 6),
        "buy_levels": buy_levels,
        "sell_levels": sell_levels,
    }


# ── Grid Placement ───────────────────────────────────────────────────────

def place_grid_orders(wallet: str, symbol: str, grid: Dict) -> List[Dict]:
    """Place all grid orders for a symbol via the pending order system.

    Cancels existing grid orders for this symbol first, then places new ones.
    Returns list of placed order summaries.
    """
    # Cancel any existing grid orders for this symbol
    cancelled = cancel_all_pending_orders(wallet, symbol)
    if cancelled.get("cancelled", 0) > 0:
        print(f"[grid] Cancelled {cancelled['cancelled']} old grid orders for {symbol}")

    placed = []

    # Place buy limit orders below price
    for level in grid["buy_levels"]:
        try:
            order = create_pending_order(
                wallet=wallet,
                symbol=symbol,
                direction="long",
                leverage=GRID_LEVERAGE,
                size_usd=level["size_usd"],
                order_type="limit",
                trigger_price=level["price"],
                stop_loss=level["sl"],
                take_profit=level["tp"],
                entry_reason=f"[grid] buy_L{level['level']} @ ${level['price']:.4f}",
                expiry_hours=GRID_EXPIRY_HOURS,
            )
            placed.append({
                "type": "limit_buy",
                "level": level["level"],
                "trigger": level["price"],
                "size": level["size_usd"],
                "tp": level["tp"],
                "sl": level["sl"],
            })
        except ValueError as e:
            print(f"[grid] Failed to place buy L{level['level']} for {symbol}: {e}")
            break  # Stop placing if we hit order limits

    # Place sell limit orders above price
    for level in grid["sell_levels"]:
        try:
            order = create_pending_order(
                wallet=wallet,
                symbol=symbol,
                direction="short",
                leverage=GRID_LEVERAGE,
                size_usd=level["size_usd"],
                order_type="limit",
                trigger_price=level["price"],
                stop_loss=level["sl"],
                take_profit=level["tp"],
                entry_reason=f"[grid] sell_L{level['level']} @ ${level['price']:.4f}",
                expiry_hours=GRID_EXPIRY_HOURS,
            )
            placed.append({
                "type": "limit_sell",
                "level": level["level"],
                "trigger": level["price"],
                "size": level["size_usd"],
                "tp": level["tp"],
                "sl": level["sl"],
            })
        except ValueError as e:
            print(f"[grid] Failed to place sell L{level['level']} for {symbol}: {e}")
            break  # Stop placing if we hit order limits

    print(
        f"[grid] Placed {len(placed)} orders for {symbol} "
        f"(center ${grid['center_price']:.4f}, spacing ${grid['spacing']:.4f})"
    )
    return placed


# ── Grid Refresh Check ───────────────────────────────────────────────────

def needs_refresh(state: Dict, prices: Dict[str, float]) -> bool:
    """Check if grids need refreshing based on time or price drift.

    Returns True if:
    - No grids have been placed yet
    - More than GRID_REFRESH_MINUTES since last refresh
    - Price has drifted more than GRID_DRIFT_THRESHOLD spacings from any grid center
    """
    last_refresh = state.get("last_refresh")

    # Never refreshed — need initial placement
    if last_refresh is None:
        return True

    # Time-based refresh (once per hour)
    if isinstance(last_refresh, str):
        last_refresh = datetime.fromisoformat(last_refresh)

    elapsed = (datetime.utcnow() - last_refresh).total_seconds() / 60
    if elapsed >= GRID_REFRESH_MINUTES:
        return True

    # Price drift check — if price moved too far from any grid center, rebalance
    grids = state.get("grids", {})
    for symbol, grid_info in grids.items():
        if symbol not in prices:
            continue
        center = grid_info.get("center_price", 0)
        spacing = grid_info.get("spacing", 0)
        if center <= 0 or spacing <= 0:
            continue
        drift = abs(prices[symbol] - center) / spacing
        if drift > GRID_DRIFT_THRESHOLD:
            print(f"[grid] Price drift for {symbol}: {drift:.1f} spacings from center — rebalancing")
            return True

    return False


# ── Main Entry Point ─────────────────────────────────────────────────────

def run_grid_strategy(
    wallet: str,
    prices: Dict[str, float],
    equity: float,
    peak_equity: float,
) -> List[Dict]:
    """Run the grid trading strategy for an account.

    Called by perp-cron alongside other strategies. Places pending orders
    at grid levels above and below current price for selected symbols.

    Args:
        wallet: Account wallet address
        prices: Dict of symbol -> current price
        equity: Current account equity
        peak_equity: Peak equity for drawdown checks

    Returns:
        List of action dicts describing what was done
    """
    actions = []

    # Drawdown protection: stop grid trading at 10% drawdown from peak
    if peak_equity and peak_equity > 0:
        drawdown_pct = (peak_equity - equity) / peak_equity * 100
        if drawdown_pct >= 10:
            print(f"[grid] Skipping — equity drawdown {drawdown_pct:.1f}% exceeds 10% limit")
            return [{"action": "skipped", "reason": f"Drawdown {drawdown_pct:.1f}% exceeds limit"}]

    # Load grid state
    state = get_grid_state(wallet)
    martingale = state.get("martingale_enabled", MARTINGALE_ENABLED)

    # Check if grids need refreshing
    if not needs_refresh(state, prices):
        return []  # Nothing to do — grids are fresh

    print(f"[grid] Refreshing grids for {wallet[:8]}... (equity: ${equity:.2f})")

    # Select best symbols for grid trading
    selected_symbols = select_grid_symbols(prices)
    if not selected_symbols:
        print("[grid] No suitable symbols found for grid trading")
        return [{"action": "skipped", "reason": "No suitable symbols"}]

    # Cancel grids for symbols no longer selected
    old_grids = state.get("grids", {})
    for old_symbol in list(old_grids.keys()):
        if old_symbol not in selected_symbols:
            cancelled = cancel_all_pending_orders(wallet, old_symbol)
            if cancelled.get("cancelled", 0) > 0:
                print(f"[grid] Removed grid for {old_symbol} (no longer selected)")
                actions.append({
                    "action": "grid_removed",
                    "symbol": old_symbol,
                    "cancelled": cancelled["cancelled"],
                })

    new_grids = {}

    for symbol in selected_symbols:
        if symbol not in prices:
            continue

        current_price = prices[symbol]

        # Get ATR for grid spacing
        price_series = get_price_series(symbol, MIN_CANDLES_FOR_GRID)
        if len(price_series) < MIN_CANDLES_FOR_GRID:
            print(f"[grid] Not enough candles for {symbol} ({len(price_series)}/{MIN_CANDLES_FOR_GRID})")
            continue

        atr_vals = atr(price_series, ATR_PERIOD)
        if not atr_vals:
            print(f"[grid] No ATR data for {symbol}")
            continue

        curr_atr = atr_vals[-1]

        # Calculate grid levels
        smooth = state.get("smooth_martingale", False)
        grid = calculate_grid_levels(current_price, curr_atr, equity, martingale, smooth_martingale=smooth)
        if grid is None:
            continue

        # Place the grid orders
        placed = place_grid_orders(wallet, symbol, grid)

        # Store grid info in state
        new_grids[symbol] = {
            "center_price": grid["center_price"],
            "spacing": grid["spacing"],
            "atr": round(curr_atr, 6),
            "levels_placed": len(placed),
            "martingale": martingale,
            "placed_at": datetime.utcnow().isoformat(),
        }

        actions.append({
            "action": "grid_placed",
            "symbol": symbol,
            "center_price": grid["center_price"],
            "spacing": grid["spacing"],
            "buy_levels": len(grid["buy_levels"]),
            "sell_levels": len(grid["sell_levels"]),
            "orders_placed": len(placed),
            "martingale": martingale,
        })

    # Save updated state
    state["grids"] = new_grids
    state["last_refresh"] = datetime.utcnow()
    save_grid_state(wallet, state)

    if actions:
        print(f"[grid] Grid refresh complete: {len(actions)} actions for {wallet[:8]}")
    else:
        print(f"[grid] Grid refresh complete: no changes for {wallet[:8]}")

    return actions

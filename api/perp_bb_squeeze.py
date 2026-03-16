# ==========================================
# Perpetual Paper Trading — Bollinger Squeeze Breakout Strategy
# ==========================================
# Forex EA-inspired strategy that detects volatility compression
# (BB inside Keltner Channel) and trades the subsequent breakout.
#
# The "squeeze" occurs when Bollinger Bands contract inside the
# Keltner Channel, indicating extremely low volatility. When the
# squeeze releases (BB expands back outside KC), price tends to
# make an explosive directional move.
#
# This is a standalone version of the squeeze detection from
# perp_keltner.py, optimized specifically for squeeze-and-fire
# breakout entries with momentum oscillator confirmation.
#
# Confirmation signals:
#   - Momentum histogram (price - SMA) direction
#   - Volume proxy (price range expansion)
#   - RSI direction confirmation
#
# Risk controls:
#   - Only trades on squeeze release (high-conviction entries)
#   - Wider trailing stops for trending moves
#   - Max 2 positions (high conviction, low frequency)
# ==========================================

import os
import sys
import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(__file__))
from perp_strategies import (
    get_price_series, ema, rsi, atr, sma, bollinger_bands,
    log_signal,
)
from perp_keltner import keltner_channel

# ── Constants ────────────────────────────────────────────────────────────

# Squeeze detection
BB_PERIOD = 20
BB_STD = 2.0
KC_EMA_PERIOD = 20
KC_ATR_PERIOD = 14
KC_ATR_MULT = 1.5

# Momentum oscillator (simple: price - SMA)
MOM_PERIOD = 20

# Confirmation
RSI_PERIOD = 14
RSI_LONG_MIN = 50             # RSI must be above 50 for long breakout
RSI_SHORT_MAX = 50            # RSI must be below 50 for short breakout

# Entry: min consecutive squeeze bars before we watch for breakout
MIN_SQUEEZE_BARS = 8
# Max bars after squeeze release to enter (don't chase old breakouts)
MAX_BARS_AFTER_RELEASE = 3

# SL/TP
SL_ATR_MULT = 2.0             # Wider SL for breakout trades
TP_ATR_MULT = 8.0             # Wide TP — trailing stop is primary exit
TRAILING_STOP_PCT = 2.5        # 2.5% trailing (let breakouts run)

# Strategy limits
MAX_POSITIONS = 2
LEVERAGE = 4

# Markets — best on liquid pairs with clear volatility cycles
SQUEEZE_MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP"]

MIN_SQUEEZE_CANDLES = 40


# ── Squeeze Detection ───────────────────────────────────────────────────

def get_squeeze_state(prices: List[float]) -> Tuple[List[bool], List[float]]:
    """Calculate squeeze state and momentum for each bar.

    Returns:
        squeeze_on: List[bool] — True when BB is inside KC (squeeze active)
        momentum: List[float] — momentum oscillator values (price - SMA)
    """
    bb_upper, bb_mid, bb_lower = bollinger_bands(prices, BB_PERIOD, BB_STD)
    kc_upper, kc_mid, kc_lower = keltner_channel(prices, KC_EMA_PERIOD, KC_ATR_PERIOD, KC_ATR_MULT)

    if not bb_upper or not kc_upper:
        return [], []

    # Calculate momentum: price - SMA (like TTM Squeeze momentum)
    sma_vals = sma(prices, MOM_PERIOD)
    if not sma_vals:
        return [], []

    # Align all arrays to shortest length
    min_len = min(len(bb_upper), len(kc_upper), len(sma_vals))

    squeeze_on = []
    momentum = []

    for i in range(min_len):
        bb_i = -(min_len - i)
        kc_i = -(min_len - i)
        sma_i = -(min_len - i)
        price_i = -(min_len - i)

        # Squeeze is ON when BB is inside KC
        sq = bb_upper[bb_i] < kc_upper[kc_i] and bb_lower[bb_i] > kc_lower[kc_i]
        squeeze_on.append(sq)

        # Momentum: price relative to SMA
        mom = prices[price_i] - sma_vals[sma_i]
        momentum.append(mom)

    return squeeze_on, momentum


def find_squeeze_release(squeeze_on: List[bool]) -> Optional[int]:
    """Find how many bars ago the last squeeze released.

    Returns None if no recent release, otherwise bars_since_release (0 = just released).
    """
    if len(squeeze_on) < 2:
        return None

    # Walk backwards to find squeeze release (True → False transition)
    for i in range(len(squeeze_on) - 1, 0, -1):
        if not squeeze_on[i] and squeeze_on[i - 1]:
            bars_since = len(squeeze_on) - 1 - i
            return bars_since

    return None


def count_consecutive_squeeze(squeeze_on: List[bool], release_idx: int) -> int:
    """Count how many consecutive squeeze bars preceded the release."""
    # release happened at index (len - 1 - release_bars_ago)
    idx = len(squeeze_on) - 1 - release_idx
    count = 0
    for i in range(idx - 1, -1, -1):
        if squeeze_on[i]:
            count += 1
        else:
            break
    return count


# ── Strategy Logic ───────────────────────────────────────────────────────

def strategy_bb_squeeze(prices: List[float], config: Dict) -> Optional[Dict]:
    """Bollinger Squeeze breakout strategy.

    Detects squeeze release and trades in the direction of momentum.
    """
    if len(prices) < MIN_SQUEEZE_CANDLES:
        return None

    squeeze_on, momentum = get_squeeze_state(prices)
    if len(squeeze_on) < MIN_SQUEEZE_BARS + 3:
        return None

    # Find recent squeeze release
    bars_since_release = find_squeeze_release(squeeze_on)
    if bars_since_release is None:
        return None  # No squeeze release detected

    if bars_since_release > MAX_BARS_AFTER_RELEASE:
        return None  # Too late to enter

    # Check squeeze duration was sufficient
    squeeze_duration = count_consecutive_squeeze(squeeze_on, bars_since_release)
    if squeeze_duration < MIN_SQUEEZE_BARS:
        return None  # Squeeze was too short

    # Momentum direction at release
    curr_mom = momentum[-1]
    prev_mom = momentum[-2] if len(momentum) >= 2 else 0

    # RSI confirmation
    rsi_vals = rsi(prices, RSI_PERIOD)
    atr_vals = atr(prices, KC_ATR_PERIOD)
    if not rsi_vals or not atr_vals:
        return None

    curr_rsi = rsi_vals[-1]
    curr_atr = atr_vals[-1]
    curr_price = prices[-1]

    # Price range expansion check (confirming breakout, not false release)
    recent_range = abs(prices[-1] - prices[-2])
    avg_range = sum(abs(prices[i] - prices[i - 1]) for i in range(-10, 0)) / 10
    range_expansion = recent_range > avg_range * 1.2  # 20% above average

    indicators = {
        "squeeze_duration": squeeze_duration,
        "bars_since_release": bars_since_release,
        "momentum": round(curr_mom, 6),
        "prev_momentum": round(prev_mom, 6),
        "rsi": round(curr_rsi, 2),
        "atr": round(curr_atr, 6),
        "range_expansion": range_expansion,
        "price": curr_price,
    }

    sl_mult = config.get("sl_atr_mult", SL_ATR_MULT)
    tp_mult = config.get("tp_atr_mult", TP_ATR_MULT)
    trail = config.get("trailing_stop_pct", TRAILING_STOP_PCT)

    # Bullish breakout: positive momentum + RSI > 50 + range expansion
    if curr_mom > 0 and curr_mom > prev_mom and curr_rsi > RSI_LONG_MIN:
        if range_expansion:
            return {
                "direction": "long",
                "signal": "bb_squeeze_breakout_up",
                "indicators": indicators,
                "atr": curr_atr,
                "mode": "squeeze_breakout",
                "sl_mult": sl_mult,
                "tp_mult": tp_mult,
                "trailing_stop_pct": trail,
            }

    # Bearish breakout: negative momentum + RSI < 50 + range expansion
    if curr_mom < 0 and curr_mom < prev_mom and curr_rsi < RSI_SHORT_MAX:
        if range_expansion:
            return {
                "direction": "short",
                "signal": "bb_squeeze_breakout_down",
                "indicators": indicators,
                "atr": curr_atr,
                "mode": "squeeze_breakout",
                "sl_mult": sl_mult,
                "tp_mult": tp_mult,
                "trailing_stop_pct": trail,
            }

    return None

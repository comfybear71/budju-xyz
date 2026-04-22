# ==========================================
# Perpetual Paper Trading — Keltner Channel Strategy
# ==========================================
# Forex EA-inspired Keltner Channel strategy for mean reversion
# and breakout trading.
#
# Keltner Channel = EMA ± multiplier * ATR
# Unlike Bollinger Bands (which use standard deviation), Keltner
# uses ATR for channel width, making it more responsive to
# actual price movement rather than statistical volatility.
#
# Modes:
#   1. Mean Reversion: Trade bounces off channel boundaries
#   2. Breakout: Trade when price closes outside the channel
#      (strong momentum — channel acts as volatility filter)
#
# The strategy auto-selects mode based on market conditions:
#   - If BB Squeeze detected (BB inside Keltner): use breakout mode
#   - Otherwise: use mean reversion mode
#
# Risk controls:
#   - Conservative sizing (1% equity risk)
#   - ATR-based SL/TP
#   - Trend filter alignment
#   - Max 3 positions across all Keltner trades
# ==========================================

import os
import sys
import math
from datetime import datetime
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from perp_strategies import (
    get_price_series, ema, rsi, atr, sma, bollinger_bands,
    trend_filter, log_signal, build_standard_indicators,
)

# ── Constants ────────────────────────────────────────────────────────────

# Keltner Channel parameters
KC_EMA_PERIOD = 20            # Center line EMA period
KC_ATR_PERIOD = 14            # ATR period for channel width
KC_ATR_MULT = 1.5             # Channel width = 1.5x ATR (standard)
KC_ATR_MULT_OUTER = 2.5       # Outer channel for extreme entries

# Bollinger Squeeze detection
BB_PERIOD = 20
BB_STD = 2.0

# Mean reversion parameters
MR_RSI_PERIOD = 14
MR_RSI_OVERSOLD = 30
MR_RSI_OVERBOUGHT = 70

# Breakout parameters
BO_RSI_THRESHOLD = 50         # RSI must confirm breakout direction
BO_MIN_SQUEEZE_BARS = 5       # Min bars of squeeze before breakout

# SL/TP
SL_ATR_MULT = 1.5             # SL at 1.5x ATR
TP_ATR_MULT_MR = 3.0          # Mean reversion TP: 3x ATR (back to middle)
TP_ATR_MULT_BO = 5.0          # Breakout TP: 5x ATR (ride the move)
TRAILING_STOP_MR = 1.0        # 1% trailing for mean reversion
TRAILING_STOP_BO = 2.0        # 2% trailing for breakout

# Markets
KELTNER_MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP", "AVAX-PERP"]

MIN_KELTNER_CANDLES = 30


# ── Keltner Channel Calculation ─────────────────────────────────────────

def keltner_channel(prices: List[float], ema_period: int = KC_EMA_PERIOD,
                    atr_period: int = KC_ATR_PERIOD, atr_mult: float = KC_ATR_MULT):
    """Calculate Keltner Channel: EMA ± ATR * multiplier.

    Returns (upper, middle, lower) lists aligned to the shortest array.
    """
    ema_vals = ema(prices, ema_period)
    atr_vals = atr(prices, atr_period)

    if not ema_vals or not atr_vals:
        return [], [], []

    # Align: both start from different offsets, use last N values
    min_len = min(len(ema_vals), len(atr_vals))
    ema_aligned = ema_vals[-min_len:]
    atr_aligned = atr_vals[-min_len:]

    upper = [e + a * atr_mult for e, a in zip(ema_aligned, atr_aligned)]
    middle = list(ema_aligned)
    lower = [e - a * atr_mult for e, a in zip(ema_aligned, atr_aligned)]

    return upper, middle, lower


def detect_bb_squeeze(prices: List[float]) -> bool:
    """Detect Bollinger Band Squeeze: BB is inside Keltner Channel.

    When Bollinger Bands contract inside Keltner Channels, it indicates
    very low volatility — a squeeze. The eventual breakout from this
    compression tends to be explosive.
    """
    bb_upper, bb_mid, bb_lower = bollinger_bands(prices, BB_PERIOD, BB_STD)
    kc_upper, kc_mid, kc_lower = keltner_channel(prices)

    if not bb_upper or not kc_upper:
        return False

    # Check last few bars for squeeze condition
    check_bars = min(BO_MIN_SQUEEZE_BARS, len(bb_upper), len(kc_upper))
    squeeze_count = 0

    for i in range(-check_bars, 0):
        if bb_upper[i] < kc_upper[i] and bb_lower[i] > kc_lower[i]:
            squeeze_count += 1

    return squeeze_count >= BO_MIN_SQUEEZE_BARS


def count_squeeze_bars(prices: List[float]) -> int:
    """Count consecutive squeeze bars (BB inside KC)."""
    bb_upper, _, bb_lower = bollinger_bands(prices, BB_PERIOD, BB_STD)
    kc_upper, _, kc_lower = keltner_channel(prices)

    if not bb_upper or not kc_upper:
        return 0

    min_len = min(len(bb_upper), len(kc_upper))
    count = 0

    for i in range(min_len - 1, -1, -1):
        bb_i = -(min_len - i)
        if bb_upper[bb_i] < kc_upper[bb_i] and bb_lower[bb_i] > kc_lower[bb_i]:
            count += 1
        else:
            break

    return count


# ── Strategy Logic ───────────────────────────────────────────────────────

def strategy_keltner(prices: List[float], config: Dict) -> Optional[Dict]:
    """Keltner Channel strategy — auto-selects mean reversion or breakout mode.

    Returns signal dict or None.
    """
    if len(prices) < max(KC_EMA_PERIOD + 2, KC_ATR_PERIOD + 2, MR_RSI_PERIOD + 2):
        return None

    # Calculate channels
    kc_upper, kc_mid, kc_lower = keltner_channel(prices)
    atr_from_strat = atr(prices, KC_ATR_PERIOD)
    rsi_vals = rsi(prices, MR_RSI_PERIOD)

    if not kc_upper or not atr_from_strat or not rsi_vals:
        return None

    curr_price = prices[-1]
    prev_price = prices[-2]
    curr_upper = kc_upper[-1]
    curr_mid = kc_mid[-1]
    curr_lower = kc_lower[-1]
    curr_rsi = rsi_vals[-1]
    curr_atr = atr_from_strat[-1]

    # Check for BB Squeeze
    is_squeeze = detect_bb_squeeze(prices)
    squeeze_bars = count_squeeze_bars(prices) if is_squeeze else 0

    indicators = {
        **build_standard_indicators(prices),
        "kc_upper": round(curr_upper, 6),
        "kc_middle": round(curr_mid, 6),
        "kc_lower": round(curr_lower, 6),
        "rsi": round(curr_rsi, 2),
        "atr": round(curr_atr, 6),
        "price": curr_price,
        "squeeze": is_squeeze,
        "squeeze_bars": squeeze_bars,
    }

    sl_mult = config.get("sl_atr_mult", SL_ATR_MULT)

    # ── Mode: Breakout (squeeze detected and breaking out) ──
    if is_squeeze and squeeze_bars >= BO_MIN_SQUEEZE_BARS:
        tp_mult = config.get("tp_atr_mult", TP_ATR_MULT_BO)
        trail = config.get("trailing_stop_pct", TRAILING_STOP_BO)

        # Upward breakout: price closes above Keltner upper
        if curr_price > curr_upper and prev_price <= curr_upper:
            if curr_rsi > BO_RSI_THRESHOLD:
                return {
                    "direction": "long",
                    "signal": "keltner_squeeze_breakout_up",
                    "indicators": indicators,
                    "atr": curr_atr,
                    "mode": "breakout",
                    "sl_mult": sl_mult,
                    "tp_mult": tp_mult,
                    "trailing_stop_pct": trail,
                }

        # Downward breakout: price closes below Keltner lower
        if curr_price < curr_lower and prev_price >= curr_lower:
            if curr_rsi < BO_RSI_THRESHOLD:
                return {
                    "direction": "short",
                    "signal": "keltner_squeeze_breakout_down",
                    "indicators": indicators,
                    "atr": curr_atr,
                    "mode": "breakout",
                    "sl_mult": sl_mult,
                    "tp_mult": tp_mult,
                    "trailing_stop_pct": trail,
                }

    # ── Mode: Mean Reversion (no squeeze — trade channel bounces) ──
    if not is_squeeze:
        tp_mult = config.get("tp_atr_mult", TP_ATR_MULT_MR)
        trail = config.get("trailing_stop_pct", TRAILING_STOP_MR)

        # Price at or below lower channel + RSI oversold → LONG bounce
        if curr_price <= curr_lower and curr_rsi <= MR_RSI_OVERSOLD:
            return {
                "direction": "long",
                "signal": "keltner_lower_bounce",
                "indicators": indicators,
                "atr": curr_atr,
                "mode": "mean_reversion",
                "tp_override": curr_mid,  # Target middle of channel
                "sl_mult": sl_mult,
                "tp_mult": tp_mult,
                "trailing_stop_pct": trail,
            }

        # Price at or above upper channel + RSI overbought → SHORT bounce
        if curr_price >= curr_upper and curr_rsi >= MR_RSI_OVERBOUGHT:
            return {
                "direction": "short",
                "signal": "keltner_upper_bounce",
                "indicators": indicators,
                "atr": curr_atr,
                "mode": "mean_reversion",
                "tp_override": curr_mid,
                "sl_mult": sl_mult,
                "tp_mult": tp_mult,
                "trailing_stop_pct": trail,
            }

    return None

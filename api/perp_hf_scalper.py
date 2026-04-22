# ==========================================
# Perpetual Paper Trading — High-Frequency Scalper
# ==========================================
# Designed for maximum trade frequency with small profit targets.
# Philosophy: "Any profit is good profit" — 1000 trades × $1-3 > 2 trades × $20
#
# Key differences from other strategies:
#   - 5-minute cooldown (vs 2-hour default)
#   - Allows multiple positions per symbol (up to 5 per side)
#   - No correlation guard (can trade BTC, ETH, SOL simultaneously)
#   - Very tight SL/TP (0.5x / 1.0x ATR) for quick in-and-out
#   - Faster indicators (EMA 3/8, RSI 5) for more frequent signals
#   - Trades ALL 10 markets for maximum opportunity
#   - Smaller position sizes per trade (0.5% of equity)
#
# Signal types (all fast-acting):
#   1. Micro EMA Cross — 3/8 EMA crossover (fires frequently)
#   2. RSI Snap — RSI(5) oversold/overbought bounce
#   3. Price Rejection — Wick rejection off local high/low
#   4. Momentum Burst — Sudden acceleration in price movement
#
# Risk: lots of small trades. Total exposure is managed by keeping
# individual trade size tiny (0.5% equity, ~$50-100 per trade).
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from perp_engine import (
    MARKETS, open_position, perp_accounts, perp_positions,
)
from perp_strategies import (
    get_price_series, store_price, ema, rsi, atr, sma,
    get_strategy_config, log_signal, build_standard_indicators,
    perp_strategy_signals,
)

# ── Constants ────────────────────────────────────────────────────────────

# Cooldown — dramatically shorter than other strategies
HF_COOLDOWN_MINUTES = 5         # 5 minutes between trades per symbol

# Indicators — faster periods for quicker signals
HF_FAST_EMA = 3                 # Ultra-fast EMA
HF_SLOW_EMA = 8                 # Still fast, but gives crossover room
HF_RSI_PERIOD = 5               # Very responsive RSI
HF_ATR_PERIOD = 10              # Shorter ATR for tighter levels

# Entry thresholds
HF_RSI_OVERSOLD = 25            # More extreme for higher conviction
HF_RSI_OVERBOUGHT = 75
HF_MOMENTUM_THRESHOLD = 1.5     # Current move must be 1.5x avg to trigger momentum

# SL/TP — tight for quick trades
HF_SL_ATR_MULT = 0.5            # Very tight stop: 0.5x ATR
HF_TP_ATR_MULT = 1.0            # Quick target: 1.0x ATR
HF_TRAILING_STOP_PCT = 0.5      # 0.5% trailing — locks in quickly

# Position sizing — small per trade, volume makes the money
HF_SIZE_PCT = 0.005              # 0.5% of equity per trade (~$50 on $10K)
HF_LEVERAGE = 5                  # 5x to amplify small moves
HF_MAX_POSITIONS = 15            # Can have many small positions open
HF_MIN_SIZE = 20                 # Minimum $20 per trade

# Markets — trade everything for maximum frequency
HF_MARKETS = list(MARKETS.keys())  # All 10 markets

# Min candles
HF_MIN_CANDLES = 15              # Need less history for fast indicators


# ── HF Cooldown Check ───────────────────────────────────────────────────

def is_hf_on_cooldown(wallet: str, symbol: str) -> bool:
    """Check if symbol is on HF cooldown (5 minutes)."""
    cutoff = datetime.utcnow() - timedelta(minutes=HF_COOLDOWN_MINUTES)
    recent = perp_strategy_signals.find_one({
        "account_id": wallet,
        "strategy": "hf_scalper",
        "symbol": symbol,
        "acted": True,
        "timestamp": {"$gte": cutoff},
    })
    return recent is not None


# ── Signal Detection ─────────────────────────────────────────────────────

def detect_hf_signals(prices: List[float], symbol: str) -> List[Dict]:
    """Detect all HF scalping signals from price data.

    Returns multiple signals — we want to be aggressive about finding entries.
    Each signal is scored; the caller picks the best one.
    """
    signals = []

    if len(prices) < max(HF_SLOW_EMA + 2, HF_RSI_PERIOD + 2, HF_ATR_PERIOD + 2):
        return signals

    fast_ema_vals = ema(prices, HF_FAST_EMA)
    slow_ema_vals = ema(prices, HF_SLOW_EMA)
    rsi_vals = rsi(prices, HF_RSI_PERIOD)
    atr_vals = atr(prices, HF_ATR_PERIOD)

    if len(fast_ema_vals) < 2 or len(slow_ema_vals) < 2 or not rsi_vals or not atr_vals:
        return signals

    curr_price = prices[-1]
    prev_price = prices[-2]
    curr_fast = fast_ema_vals[-1]
    prev_fast = fast_ema_vals[-2]
    curr_slow = slow_ema_vals[-1]
    prev_slow = slow_ema_vals[-2]
    curr_rsi = rsi_vals[-1]
    prev_rsi = rsi_vals[-2] if len(rsi_vals) >= 2 else curr_rsi
    curr_atr = atr_vals[-1]

    price_move = curr_price - prev_price
    price_move_pct = abs(price_move) / prev_price * 100 if prev_price > 0 else 0

    base_indicators = {
        **build_standard_indicators(prices),
        "fast_ema": round(curr_fast, 6),
        "slow_ema": round(curr_slow, 6),
        "rsi": round(curr_rsi, 2),
        "atr": round(curr_atr, 6),
        "price": curr_price,
        "price_move_pct": round(price_move_pct, 4),
    }

    # ── Signal 1: Micro EMA Cross ──
    # Fast EMA crosses slow EMA — fires frequently with 3/8 periods
    if prev_fast <= prev_slow and curr_fast > curr_slow:
        # Bullish micro cross
        if curr_rsi > 40 and curr_rsi < 80:  # Not overbought
            signals.append({
                "direction": "long",
                "signal": "hf_ema_cross_up",
                "score": 2.0,
                "indicators": {**base_indicators, "cross": "bullish"},
                "atr": curr_atr,
            })

    if prev_fast >= prev_slow and curr_fast < curr_slow:
        # Bearish micro cross
        if curr_rsi > 20 and curr_rsi < 60:  # Not oversold
            signals.append({
                "direction": "short",
                "signal": "hf_ema_cross_down",
                "score": 2.0,
                "indicators": {**base_indicators, "cross": "bearish"},
                "atr": curr_atr,
            })

    # ── Signal 2: RSI Snap ──
    # RSI bounces from extreme — very quick reversal signal
    if prev_rsi <= HF_RSI_OVERSOLD and curr_rsi > HF_RSI_OVERSOLD:
        # RSI snapping up from oversold
        if price_move > 0:
            signals.append({
                "direction": "long",
                "signal": "hf_rsi_snap_up",
                "score": 2.5,
                "indicators": {**base_indicators, "rsi_snap": "oversold_bounce"},
                "atr": curr_atr,
            })

    if prev_rsi >= HF_RSI_OVERBOUGHT and curr_rsi < HF_RSI_OVERBOUGHT:
        # RSI snapping down from overbought
        if price_move < 0:
            signals.append({
                "direction": "short",
                "signal": "hf_rsi_snap_down",
                "score": 2.5,
                "indicators": {**base_indicators, "rsi_snap": "overbought_rejection"},
                "atr": curr_atr,
            })

    # ── Signal 3: Price Rejection (Wick) ──
    # Price pushed to local high/low but reversed — rejection candle
    if len(prices) >= 5:
        local_high = max(prices[-5:-1])
        local_low = min(prices[-5:-1])

        # Bullish rejection: price dipped below local low but closed above
        if prev_price <= local_low and curr_price > local_low:
            bounce_pct = (curr_price - prev_price) / prev_price * 100
            if bounce_pct > 0.02:  # Meaningful bounce
                signals.append({
                    "direction": "long",
                    "signal": "hf_wick_rejection_up",
                    "score": 1.8,
                    "indicators": {**base_indicators, "local_low": round(local_low, 6),
                                   "bounce_pct": round(bounce_pct, 4)},
                    "atr": curr_atr,
                })

        # Bearish rejection: price spiked above local high but closed below
        if prev_price >= local_high and curr_price < local_high:
            drop_pct = (prev_price - curr_price) / prev_price * 100
            if drop_pct > 0.02:
                signals.append({
                    "direction": "short",
                    "signal": "hf_wick_rejection_down",
                    "score": 1.8,
                    "indicators": {**base_indicators, "local_high": round(local_high, 6),
                                   "drop_pct": round(drop_pct, 4)},
                    "atr": curr_atr,
                })

    # ── Signal 4: Momentum Burst ──
    # Sudden large move relative to recent average — ride the wave
    if len(prices) >= 10:
        avg_move = sum(abs(prices[i] - prices[i - 1]) for i in range(-10, 0)) / 10
        curr_move = abs(price_move)

        if avg_move > 0 and curr_move > avg_move * HF_MOMENTUM_THRESHOLD:
            if price_move > 0 and curr_rsi > 45:
                signals.append({
                    "direction": "long",
                    "signal": "hf_momentum_burst_up",
                    "score": 1.5,
                    "indicators": {**base_indicators, "move_ratio": round(curr_move / avg_move, 2)},
                    "atr": curr_atr,
                })
            elif price_move < 0 and curr_rsi < 55:
                signals.append({
                    "direction": "short",
                    "signal": "hf_momentum_burst_down",
                    "score": 1.5,
                    "indicators": {**base_indicators, "move_ratio": round(curr_move / avg_move, 2)},
                    "atr": curr_atr,
                })

    return signals


# ── Main Runner ──────────────────────────────────────────────────────────

def run_hf_scalper(wallet: str, prices: Dict[str, float],
                   equity: float, peak_equity: float) -> List[Dict]:
    """Run the high-frequency scalper.

    Unlike other strategies that go through the main STRATEGY_FUNCS loop,
    the HF scalper manages its own cooldowns, position checks, and sizing
    because it has fundamentally different rules (shorter cooldowns,
    no correlation guard, multiple positions per symbol).
    """
    actions = []

    # Drawdown protection — still applies
    if peak_equity and peak_equity > 0:
        dd_pct = (peak_equity - equity) / peak_equity * 100
        if dd_pct >= 10:
            return [{"action": "skipped", "reason": "Drawdown >= 10%, HF scalper paused"}]

    # Count current HF positions
    hf_positions = list(perp_positions.find({
        "account_id": wallet,
        "status": "open",
        "entry_reason": {"$regex": "^\\[hf_scalper\\]"},
    }))
    hf_count = len(hf_positions)

    if hf_count >= HF_MAX_POSITIONS:
        return []  # At capacity

    # Calculate base position size
    base_size = equity * HF_SIZE_PCT * HF_LEVERAGE
    if base_size < HF_MIN_SIZE:
        return [{"action": "skipped", "reason": f"Equity too low for HF (need >${HF_MIN_SIZE / HF_SIZE_PCT / HF_LEVERAGE:.0f})"}]

    trades_opened = 0

    for symbol in HF_MARKETS:
        if symbol not in prices:
            continue
        if hf_count + trades_opened >= HF_MAX_POSITIONS:
            break

        # HF-specific cooldown (5 min, not 2 hours)
        if is_hf_on_cooldown(wallet, symbol):
            continue

        current_price = prices[symbol]

        # Get price data
        price_series = get_price_series(symbol, count=HF_MIN_CANDLES + 10)
        if len(price_series) < HF_MIN_CANDLES:
            continue

        # Store current price
        store_price(symbol, current_price)

        # Detect signals
        signals = detect_hf_signals(price_series, symbol)
        if not signals:
            continue

        # Pick the highest-scored signal
        best_signal = max(signals, key=lambda s: s["score"])
        direction = best_signal["direction"]
        atr_value = best_signal["atr"]

        if atr_value <= 0:
            continue

        # Position size — small and consistent
        size_usd = round(base_size, 2)

        # Check we have enough balance
        account = perp_accounts.find_one({"wallet": wallet})
        if not account:
            continue
        balance = account.get("balance", 0)
        margin_needed = size_usd / HF_LEVERAGE
        if margin_needed > balance * 0.95:
            continue

        # Calculate tight SL/TP
        if direction == "long":
            stop_loss = current_price - (atr_value * HF_SL_ATR_MULT)
            take_profit = current_price + (atr_value * HF_TP_ATR_MULT)
        else:
            stop_loss = current_price + (atr_value * HF_SL_ATR_MULT)
            take_profit = current_price - (atr_value * HF_TP_ATR_MULT)

        if stop_loss <= 0:
            continue

        entry_reason = f"[hf_scalper] {best_signal['signal']} (score={best_signal['score']:.1f})"

        try:
            position = open_position(
                wallet=wallet,
                symbol=symbol,
                direction=direction,
                leverage=HF_LEVERAGE,
                size_usd=size_usd,
                entry_price=current_price,
                stop_loss=round(stop_loss, 6),
                take_profit=round(take_profit, 6),
                trailing_stop_pct=HF_TRAILING_STOP_PCT,
                entry_reason=entry_reason,
            )

            log_signal(wallet, "hf_scalper", symbol, direction,
                       best_signal["signal"], best_signal["indicators"], True)

            actions.append({
                "action": "opened",
                "symbol": symbol,
                "direction": direction,
                "size_usd": size_usd,
                "leverage": HF_LEVERAGE,
                "entry_price": current_price,
                "stop_loss": round(stop_loss, 6),
                "take_profit": round(take_profit, 6),
                "signal": best_signal["signal"],
                "score": best_signal["score"],
            })

            trades_opened += 1
            print(f"[hf] {direction.upper()} {symbol} ${size_usd:.0f} @ ${current_price:.4f} "
                  f"({best_signal['signal']}) for {wallet[:8]}")

        except ValueError as e:
            log_signal(wallet, "hf_scalper", symbol, direction,
                       best_signal["signal"], best_signal["indicators"], False, str(e))

    if trades_opened > 0:
        print(f"[hf] Opened {trades_opened} scalp trades for {wallet[:8]}")

    return actions

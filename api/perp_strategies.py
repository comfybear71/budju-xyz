# ==========================================
# Perpetual Paper Trading — Automated Strategy Engine
# ==========================================
# Runs automated trading strategies using technical indicators
# calculated from historical price data. All trades are paper.
#
# Strategies:
#   1. Trend Following — EMA crossover + RSI confirmation
#   2. Mean Reversion — Bollinger Band bounce
#   3. Momentum Breakout — Price breakout + volume surge
#
# Risk Management:
#   - Half-Kelly position sizing (capped at 5% of equity)
#   - Max 3 concurrent positions per strategy
#   - Correlation check (no duplicate market exposure)
#   - Daily loss circuit breaker (20% equity)
#   - ATR-based stop loss and take profit
# ==========================================

import os
import sys
import json
import math
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, os.path.dirname(__file__))
from database import db
from perp_engine import (
    MARKETS, INITIAL_BALANCE, MAX_OPEN_POSITIONS,
    open_position, get_open_positions, perp_accounts, perp_trades, perp_positions,
)

# ── Collections ──────────────────────────────────────────────────────────

perp_price_history = db["perp_price_history"]
perp_strategy_config = db["perp_strategy_config"]
perp_strategy_signals = db["perp_strategy_signals"]

# Indexes
perp_price_history.create_index([("symbol", 1), ("timestamp", -1)])
perp_price_history.create_index([("symbol", 1), ("interval", 1), ("timestamp", -1)])
perp_strategy_signals.create_index([("account_id", 1), ("timestamp", -1)])

# ── Constants ────────────────────────────────────────────────────────────

# Strategy defaults
DEFAULT_STRATEGIES = {
    "trend_following": {
        "enabled": True,
        "fast_ema": 9,
        "slow_ema": 21,
        "rsi_period": 14,
        "rsi_oversold": 35,
        "rsi_overbought": 65,
        "atr_period": 14,
        "sl_atr_mult": 2.0,       # Stop loss = 2x ATR
        "tp_atr_mult": 8.0,       # Wide TP — trailing stop is primary exit
        "trailing_stop_pct": 1.5,  # 1.5% trailing stop (activates after +1.5%)
        "leverage": 5,
        "max_positions": 2,
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP"],
    },
    "mean_reversion": {
        "enabled": True,
        "bb_period": 20,
        "bb_std": 2.0,
        "rsi_period": 14,
        "rsi_oversold": 30,
        "rsi_overbought": 70,
        "atr_period": 14,
        "sl_atr_mult": 1.5,       # Tighter SL for mean reversion
        "tp_atr_mult": 3.0,       # TP at 3x ATR (~1.5-2% from entry)
        "trailing_stop_pct": 1.0,  # 1% trailing to lock in BB bounce profit
        "leverage": 3,
        "max_positions": 2,
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP", "AVAX-PERP", "LINK-PERP"],
    },
    "momentum": {
        "enabled": True,
        "lookback": 20,
        "breakout_mult": 1.5,     # 1.5x avg range for breakout
        "rsi_period": 14,
        "rsi_threshold": 50,      # RSI must confirm direction
        "atr_period": 14,
        "sl_atr_mult": 2.5,       # Wider SL for breakouts
        "tp_atr_mult": 10.0,      # Very wide TP — trailing stop is primary exit
        "trailing_stop_pct": 2.0,  # 2% trailing stop (activates after +2%)
        "leverage": 5,
        "max_positions": 1,
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP"],
    },
    "scalping": {
        "enabled": False,          # Disabled — 1-min data is pure noise for scalping
        "fast_ema": 5,
        "rsi_period": 7,
        "rsi_oversold": 30,        # Tighter: was 35
        "rsi_overbought": 70,      # Tighter: was 65
        "atr_period": 10,
        "sl_atr_mult": 1.5,
        "tp_atr_mult": 2.5,
        "trailing_stop_pct": 1.5,  # Was 0.8% — too tight, exits at breakeven
        "leverage": 3,             # Was 5x — reduced
        "max_positions": 2,        # Was 3 — reduced
        "markets": ["SOL-PERP", "BTC-PERP"],
    },
    "ninja": {
        "enabled": False,          # Ninja Ambush — pending orders at key levels
        "leverage": 2,
        "sl_atr_mult": 2.5,
        "tp_atr_mult": 6.0,
        "trailing_stop_pct": 2.0,
        "max_positions": 8,        # Max pending orders
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP", "AVAX-PERP", "LINK-PERP"],
    },
    "grid": {
        "enabled": False,          # Grid Trading — ATR-based grid of limit orders
        "leverage": 2,
        "sl_atr_mult": 3.0,       # Catastrophic stop at 3x grid spacing
        "tp_atr_mult": 1.0,       # TP one grid level away
        "trailing_stop_pct": 0,
        "max_positions": 10,       # 5 buy + 5 sell levels
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP"],
    },
}

# How many 1-minute candles we need for calculations
MIN_CANDLES = 30
# Max position size as pct of equity
MAX_POSITION_PCT = 0.10  # 10% per auto trade (conservative)
# Minimum minutes between trades on same market
COOLDOWN_MINUTES = 120  # 2 hours — prevents re-entering the same chop
# Correlated assets — max 1 position across each group
CORRELATION_GROUPS = [
    {"BTC-PERP", "ETH-PERP", "SOL-PERP"},  # Major caps move together
]
# Drawdown protection
DRAWDOWN_HALF_SIZE_PCT = 5.0   # Half position size at 5% drawdown
DRAWDOWN_STOP_PCT = 10.0       # Stop trading at 10% drawdown

# ── Binance symbol mapping for historical candle seeding ────────────────
BINANCE_SYMBOLS = {
    "SOL-PERP": "SOLUSDT",
    "BTC-PERP": "BTCUSDT",
    "ETH-PERP": "ETHUSDT",
    "DOGE-PERP": "DOGEUSDT",
    "AVAX-PERP": "AVAXUSDT",
    "LINK-PERP": "LINKUSDT",
    "SUI-PERP": "SUIUSDT",
    "JUP-PERP": "JUPUSDT",
    "WIF-PERP": "WIFUSDT",
    "BONK-PERP": "BONKUSDT",
}


# ── Price History ────────────────────────────────────────────────────────

def store_price(symbol: str, price: float, timestamp: datetime = None):
    """Store a 1-minute price point."""
    ts = timestamp or datetime.utcnow()
    # Round to nearest minute
    ts = ts.replace(second=0, microsecond=0)

    perp_price_history.update_one(
        {"symbol": symbol, "timestamp": ts, "interval": "1m"},
        {"$set": {
            "symbol": symbol,
            "timestamp": ts,
            "interval": "1m",
            "price": price,
            "updated_at": datetime.utcnow(),
        }},
        upsert=True,
    )


def get_price_series(symbol: str, count: int = 100) -> List[float]:
    """Get the last N 1-minute prices for a symbol."""
    docs = list(perp_price_history.find(
        {"symbol": symbol, "interval": "1m"},
        {"price": 1, "_id": 0},
    ).sort("timestamp", -1).limit(count))
    # Return in chronological order (oldest first)
    return [d["price"] for d in reversed(docs)]


def get_candle_count(symbol: str) -> int:
    """How many candles we have stored for a symbol."""
    return perp_price_history.count_documents({"symbol": symbol, "interval": "1m"})


def seed_historical_candles(symbol: str, count: int = 120) -> int:
    """
    Fetch historical 1-minute candles from Binance public API and backfill.
    Returns number of candles seeded. Skips if we already have enough data.
    Uses Binance spot klines (free, no API key needed).
    """
    existing = get_candle_count(symbol)
    if existing >= count:
        return 0  # Already have enough

    binance_symbol = BINANCE_SYMBOLS.get(symbol)
    if not binance_symbol:
        print(f"[seed] No Binance mapping for {symbol}, skipping")
        return 0

    needed = count - existing
    url = (
        f"https://api.binance.com/api/v3/klines"
        f"?symbol={binance_symbol}&interval=1m&limit={needed}"
    )
    req = Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "BudjuBot/1.0",
    })

    try:
        with urlopen(req, timeout=10) as resp:
            klines = json.loads(resp.read().decode())
    except Exception as e:
        print(f"[seed] Binance fetch failed for {symbol}: {e}")
        return 0

    seeded = 0
    for kline in klines:
        # Binance kline format: [open_time, open, high, low, close, volume, ...]
        open_time_ms = kline[0]
        close_price = float(kline[4])
        ts = datetime.utcfromtimestamp(open_time_ms / 1000)
        ts = ts.replace(second=0, microsecond=0)

        perp_price_history.update_one(
            {"symbol": symbol, "timestamp": ts, "interval": "1m"},
            {"$setOnInsert": {
                "symbol": symbol,
                "timestamp": ts,
                "interval": "1m",
                "price": close_price,
                "updated_at": datetime.utcnow(),
                "source": "binance_seed",
            }},
            upsert=True,
        )
        seeded += 1

    print(f"[seed] Seeded {seeded} candles for {symbol} (had {existing}, now ~{existing + seeded})")
    return seeded


def seed_all_markets(min_candles: int = None):
    """Seed historical candles for all markets that need them."""
    target = min_candles or MIN_CANDLES
    # Add buffer so indicators have enough history
    fetch_count = max(target + 30, 120)
    total_seeded = 0
    for symbol in BINANCE_SYMBOLS:
        try:
            total_seeded += seed_historical_candles(symbol, fetch_count)
        except Exception as e:
            print(f"[seed] Error seeding {symbol}: {e}")
    if total_seeded > 0:
        print(f"[seed] Total: seeded {total_seeded} candles across all markets")
    return total_seeded


# ── Technical Indicators ────────────────────────────────────────────────

def ema(prices: List[float], period: int) -> List[float]:
    """Exponential Moving Average."""
    if len(prices) < period:
        return []
    k = 2 / (period + 1)
    ema_vals = [sum(prices[:period]) / period]  # SMA seed
    for price in prices[period:]:
        ema_vals.append(price * k + ema_vals[-1] * (1 - k))
    return ema_vals


def sma(prices: List[float], period: int) -> List[float]:
    """Simple Moving Average."""
    if len(prices) < period:
        return []
    return [sum(prices[i:i+period]) / period for i in range(len(prices) - period + 1)]


def rsi(prices: List[float], period: int = 14) -> List[float]:
    """Relative Strength Index."""
    if len(prices) < period + 1:
        return []

    deltas = [prices[i+1] - prices[i] for i in range(len(prices) - 1)]
    gains = [max(d, 0) for d in deltas]
    losses = [abs(min(d, 0)) for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    rsi_vals = []
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

        if avg_loss == 0:
            rsi_vals.append(100.0)
        else:
            rs = avg_gain / avg_loss
            rsi_vals.append(100 - (100 / (1 + rs)))

    return rsi_vals


def bollinger_bands(prices: List[float], period: int = 20, num_std: float = 2.0) -> Tuple[List[float], List[float], List[float]]:
    """Bollinger Bands — returns (upper, middle, lower)."""
    if len(prices) < period:
        return [], [], []

    middle = sma(prices, period)
    upper = []
    lower = []

    for i in range(len(middle)):
        window = prices[i:i+period]
        mean = middle[i]
        std = math.sqrt(sum((p - mean) ** 2 for p in window) / period)
        upper.append(mean + num_std * std)
        lower.append(mean - num_std * std)

    return upper, middle, lower


def atr(prices: List[float], period: int = 14) -> List[float]:
    """Average True Range scaled to ~1hr timeframe.

    Raw 1-minute ATR is extremely small (e.g. $0.04 for SOL), making
    ATR-based SL/TP nearly useless. We scale by sqrt(60) ≈ 7.75 to
    approximate a 1-hour ATR, giving trades room to breathe without
    getting stopped out by normal price noise.
    """
    if len(prices) < period + 1:
        return []

    true_ranges = [abs(prices[i+1] - prices[i]) for i in range(len(prices) - 1)]

    # Scale factor: sqrt(60) to approximate 1-hour ATR from 1-min data
    scale = math.sqrt(60)

    atr_vals = [sum(true_ranges[:period]) / period * scale]
    for i in range(period, len(true_ranges)):
        raw = (atr_vals[-1] / scale * (period - 1) + true_ranges[i]) / period
        atr_vals.append(raw * scale)

    return atr_vals


# ── Trend Filter ────────────────────────────────────────────────────────

TREND_EMA_PERIOD = 50  # 50-candle EMA as directional guard

def trend_filter(prices: List[float], direction: str) -> bool:
    """Check if a trade direction aligns with the higher-timeframe trend.

    Uses a 50-period EMA:
      - Long signals require price ABOVE the 50 EMA (uptrend)
      - Short signals require price BELOW the 50 EMA (downtrend)

    Returns True if the trade is allowed, False if it conflicts with trend.
    """
    if len(prices) < TREND_EMA_PERIOD + 1:
        return True  # Not enough data — allow trade (don't block cold-start)

    ema_vals = ema(prices, TREND_EMA_PERIOD)
    if not ema_vals:
        return True

    curr_price = prices[-1]
    curr_ema = ema_vals[-1]

    if direction == "long":
        return curr_price > curr_ema
    else:  # short
        return curr_price < curr_ema


# ── Strategy Config ──────────────────────────────────────────────────────

def get_strategy_config(wallet: str) -> Dict:
    """Get strategy configuration for an account."""
    config = perp_strategy_config.find_one({"wallet": wallet})
    if config:
        result = dict(config)
        result.pop("_id", None)
        return result

    # Create default config
    config = {
        "wallet": wallet,
        "auto_trading_enabled": False,
        "strategies": DEFAULT_STRATEGIES,
        "global_settings": {
            "max_total_positions": MAX_OPEN_POSITIONS,
            "max_equity_risk_pct": 10.0,  # Max 10% of equity at risk
            "cooldown_minutes": COOLDOWN_MINUTES,
            "min_candles": MIN_CANDLES,
        },
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    perp_strategy_config.insert_one(config)
    config.pop("_id", None)
    return config


def update_strategy_config(wallet: str, updates: Dict) -> Dict:
    """Update strategy configuration."""
    perp_strategy_config.update_one(
        {"wallet": wallet},
        {"$set": {**updates, "updated_at": datetime.utcnow()}},
        upsert=True,
    )
    return get_strategy_config(wallet)


def toggle_auto_trading(wallet: str, enabled: bool) -> Dict:
    """Enable or disable auto trading."""
    return update_strategy_config(wallet, {"auto_trading_enabled": enabled})


# ── Signal Logging ───────────────────────────────────────────────────────

def log_signal(wallet: str, strategy: str, symbol: str, direction: str,
               signal_type: str, indicators: Dict, acted: bool, reason: str = ""):
    """Log a strategy signal for auditing."""
    perp_strategy_signals.insert_one({
        "account_id": wallet,
        "strategy": strategy,
        "symbol": symbol,
        "direction": direction,
        "signal_type": signal_type,
        "indicators": indicators,
        "acted": acted,
        "reason": reason,
        "timestamp": datetime.utcnow(),
    })


def get_recent_signals(wallet: str, limit: int = 50) -> List[Dict]:
    """Get recent strategy signals."""
    signals = list(perp_strategy_signals.find(
        {"account_id": wallet},
        {"_id": 0},
    ).sort("timestamp", -1).limit(limit))
    for s in signals:
        if isinstance(s.get("timestamp"), datetime):
            s["timestamp"] = s["timestamp"].isoformat()
    return signals


# ── Position Sizing ──────────────────────────────────────────────────────

def calculate_position_size(equity: float, atr_value: float, price: float,
                            leverage: int, sl_atr_mult: float) -> float:
    """Calculate position size based on risk (ATR-based)."""
    # Risk 1-2% of equity per trade
    risk_pct = 0.015  # 1.5% of equity
    risk_amount = equity * risk_pct

    # Stop distance in USD
    stop_distance = atr_value * sl_atr_mult
    if stop_distance <= 0:
        return 0

    # Position size = risk / (stop_distance / price)
    stop_pct = stop_distance / price
    size_usd = risk_amount / stop_pct

    # Cap at max position pct of equity
    max_size = equity * MAX_POSITION_PCT * leverage
    size_usd = min(size_usd, max_size)

    # Minimum $50
    if size_usd < 50:
        return 0

    return round(size_usd, 2)


# ── Cooldown Check ───────────────────────────────────────────────────────

def is_on_cooldown(wallet: str, symbol: str, cooldown_min: int) -> bool:
    """Check if a market is on cooldown (recently traded)."""
    cutoff = datetime.utcnow() - timedelta(minutes=cooldown_min)

    # Check recent orders
    recent = perp_strategy_signals.find_one({
        "account_id": wallet,
        "symbol": symbol,
        "acted": True,
        "timestamp": {"$gte": cutoff},
    })
    return recent is not None


# ── Strategies ───────────────────────────────────────────────────────────

def strategy_trend_following(prices: List[float], config: Dict) -> Optional[Dict]:
    """
    Trend Following Strategy:
    - LONG when fast EMA crosses above slow EMA AND RSI > oversold
    - SHORT when fast EMA crosses below slow EMA AND RSI < overbought
    - Uses ATR for stop loss and take profit
    """
    fast = config.get("fast_ema", 9)
    slow = config.get("slow_ema", 21)
    rsi_period = config.get("rsi_period", 14)
    rsi_os = config.get("rsi_oversold", 35)
    rsi_ob = config.get("rsi_overbought", 65)
    atr_period = config.get("atr_period", 14)

    if len(prices) < max(slow + 2, rsi_period + 2, atr_period + 2):
        return None

    fast_ema = ema(prices, fast)
    slow_ema = ema(prices, slow)
    rsi_vals = rsi(prices, rsi_period)
    atr_vals = atr(prices, atr_period)

    if len(fast_ema) < 2 or len(slow_ema) < 2 or not rsi_vals or not atr_vals:
        return None

    # Align arrays — get last 2 values of each
    # EMA arrays have different lengths due to different periods
    # fast_ema has len(prices) - fast + 1 values
    # slow_ema has len(prices) - slow + 1 values
    # We need to align them by taking the last values
    curr_fast = fast_ema[-1]
    prev_fast = fast_ema[-2]
    curr_slow = slow_ema[-1]
    prev_slow = slow_ema[-2]
    curr_rsi = rsi_vals[-1]
    curr_atr = atr_vals[-1]
    curr_price = prices[-1]

    indicators = {
        "fast_ema": round(curr_fast, 6),
        "slow_ema": round(curr_slow, 6),
        "rsi": round(curr_rsi, 2),
        "atr": round(curr_atr, 6),
        "price": curr_price,
    }

    # Bullish crossover: fast crosses above slow
    if prev_fast <= prev_slow and curr_fast > curr_slow:
        if curr_rsi > rsi_os and curr_rsi < rsi_ob:
            if trend_filter(prices, "long"):
                return {
                    "direction": "long",
                    "signal": "ema_cross_up",
                    "indicators": indicators,
                    "atr": curr_atr,
                }

    # Bearish crossover: fast crosses below slow
    if prev_fast >= prev_slow and curr_fast < curr_slow:
        if curr_rsi < rsi_ob and curr_rsi > rsi_os:
            if trend_filter(prices, "short"):
                return {
                    "direction": "short",
                    "signal": "ema_cross_down",
                    "indicators": indicators,
                    "atr": curr_atr,
                }

    return None


def strategy_mean_reversion(prices: List[float], config: Dict) -> Optional[Dict]:
    """
    Mean Reversion Strategy:
    - LONG when price touches lower Bollinger Band AND RSI oversold
    - SHORT when price touches upper Bollinger Band AND RSI overbought
    - Targets middle band as take profit
    """
    bb_period = config.get("bb_period", 20)
    bb_std = config.get("bb_std", 2.0)
    rsi_period = config.get("rsi_period", 14)
    rsi_os = config.get("rsi_oversold", 30)
    rsi_ob = config.get("rsi_overbought", 70)
    atr_period = config.get("atr_period", 14)

    if len(prices) < max(bb_period + 2, rsi_period + 2, atr_period + 2):
        return None

    upper, middle, lower = bollinger_bands(prices, bb_period, bb_std)
    rsi_vals = rsi(prices, rsi_period)
    atr_vals = atr(prices, atr_period)

    if not upper or not rsi_vals or not atr_vals:
        return None

    curr_price = prices[-1]
    curr_upper = upper[-1]
    curr_middle = middle[-1]
    curr_lower = lower[-1]
    curr_rsi = rsi_vals[-1]
    curr_atr = atr_vals[-1]

    indicators = {
        "bb_upper": round(curr_upper, 6),
        "bb_middle": round(curr_middle, 6),
        "bb_lower": round(curr_lower, 6),
        "rsi": round(curr_rsi, 2),
        "atr": round(curr_atr, 6),
        "price": curr_price,
    }

    # Price at or below lower band + RSI oversold → LONG
    # NOTE: No trend filter for mean reversion — the whole point is to fade
    # overextensions. The trend filter blocks the exact trades this strategy
    # is designed to take (buying dips below EMA).
    if curr_price <= curr_lower and curr_rsi <= rsi_os:
        return {
            "direction": "long",
            "signal": "bb_lower_bounce",
            "indicators": indicators,
            "atr": curr_atr,
            "tp_override": curr_middle,  # Target middle band
        }

    # Price at or above upper band + RSI overbought → SHORT
    if curr_price >= curr_upper and curr_rsi >= rsi_ob:
        return {
            "direction": "short",
            "signal": "bb_upper_bounce",
            "indicators": indicators,
            "atr": curr_atr,
            "tp_override": curr_middle,
        }

    return None


def strategy_momentum(prices: List[float], config: Dict) -> Optional[Dict]:
    """
    Momentum Breakout Strategy:
    - LONG when price breaks above recent high with RSI confirmation
    - SHORT when price breaks below recent low with RSI confirmation
    - Uses wider stops for trending moves
    """
    lookback = config.get("lookback", 20)
    breakout_mult = config.get("breakout_mult", 1.5)
    rsi_period = config.get("rsi_period", 14)
    rsi_threshold = config.get("rsi_threshold", 50)
    atr_period = config.get("atr_period", 14)

    if len(prices) < max(lookback + 2, rsi_period + 2, atr_period + 2):
        return None

    rsi_vals = rsi(prices, rsi_period)
    atr_vals = atr(prices, atr_period)

    if not rsi_vals or not atr_vals:
        return None

    curr_price = prices[-1]
    prev_price = prices[-2]
    curr_rsi = rsi_vals[-1]
    curr_atr = atr_vals[-1]

    # Recent price range
    recent_prices = prices[-(lookback+1):-1]  # Exclude current
    recent_high = max(recent_prices)
    recent_low = min(recent_prices)
    avg_range = sum(abs(prices[i+1] - prices[i]) for i in range(len(prices)-lookback-1, len(prices)-1)) / lookback

    indicators = {
        "recent_high": round(recent_high, 6),
        "recent_low": round(recent_low, 6),
        "avg_range": round(avg_range, 6),
        "rsi": round(curr_rsi, 2),
        "atr": round(curr_atr, 6),
        "price": curr_price,
    }

    # Current candle range
    curr_range = abs(curr_price - prev_price)

    # Breakout above recent high with strong move
    if curr_price > recent_high and curr_range > avg_range * breakout_mult:
        if curr_rsi > rsi_threshold:
            if trend_filter(prices, "long"):
                return {
                    "direction": "long",
                    "signal": "breakout_high",
                    "indicators": indicators,
                    "atr": curr_atr,
                }

    # Breakout below recent low with strong move
    if curr_price < recent_low and curr_range > avg_range * breakout_mult:
        if curr_rsi < rsi_threshold:
            if trend_filter(prices, "short"):
                return {
                    "direction": "short",
                    "signal": "breakout_low",
                    "indicators": indicators,
                    "atr": curr_atr,
                }

    return None


def strategy_scalping(prices: List[float], config: Dict) -> Optional[Dict]:
    """
    Scalping Strategy:
    - Quick entries based on RSI extremes + EMA slope direction
    - LONG when RSI dips below 35 AND price is above fast EMA (pullback in uptrend)
    - SHORT when RSI spikes above 65 AND price is below fast EMA (rally in downtrend)
    - Tighter stops and profits for fast trades
    - More relaxed entry conditions than other strategies for higher frequency
    """
    fast = config.get("fast_ema", 5)
    rsi_period = config.get("rsi_period", 7)
    rsi_os = config.get("rsi_oversold", 35)
    rsi_ob = config.get("rsi_overbought", 65)
    atr_period = config.get("atr_period", 10)

    if len(prices) < max(fast + 2, rsi_period + 2, atr_period + 2):
        return None

    fast_ema_vals = ema(prices, fast)
    rsi_vals = rsi(prices, rsi_period)
    atr_vals = atr(prices, atr_period)

    if len(fast_ema_vals) < 3 or not rsi_vals or not atr_vals:
        return None

    curr_price = prices[-1]
    prev_price = prices[-2]
    curr_ema = fast_ema_vals[-1]
    prev_ema = fast_ema_vals[-2]
    curr_rsi = rsi_vals[-1]
    prev_rsi = rsi_vals[-2] if len(rsi_vals) >= 2 else curr_rsi
    curr_atr = atr_vals[-1]

    # EMA slope (rising or falling)
    ema_slope = curr_ema - prev_ema
    ema_rising = ema_slope > 0
    price_momentum = curr_price - prev_price

    indicators = {
        "fast_ema": round(curr_ema, 6),
        "ema_slope": round(ema_slope, 6),
        "rsi": round(curr_rsi, 2),
        "prev_rsi": round(prev_rsi, 2),
        "atr": round(curr_atr, 6),
        "price": curr_price,
    }

    # SCALP LONG: RSI was oversold or dipping + EMA is rising + price bouncing up
    if curr_rsi <= rsi_os and ema_rising and price_momentum > 0:
        if trend_filter(prices, "long"):
            return {
                "direction": "long",
                "signal": "scalp_rsi_bounce",
                "indicators": indicators,
                "atr": curr_atr,
            }

    # Also LONG: RSI crossing up from oversold (recovery)
    if prev_rsi < rsi_os and curr_rsi > rsi_os and curr_price > curr_ema:
        if trend_filter(prices, "long"):
            return {
                "direction": "long",
                "signal": "scalp_rsi_recovery",
                "indicators": indicators,
                "atr": curr_atr,
            }

    # SCALP SHORT: RSI was overbought or spiking + EMA is falling + price dropping
    if curr_rsi >= rsi_ob and not ema_rising and price_momentum < 0:
        if trend_filter(prices, "short"):
            return {
                "direction": "short",
                "signal": "scalp_rsi_rejection",
                "indicators": indicators,
                "atr": curr_atr,
            }

    # Also SHORT: RSI crossing down from overbought (exhaustion)
    if prev_rsi > rsi_ob and curr_rsi < rsi_ob and curr_price < curr_ema:
        if trend_filter(prices, "short"):
            return {
                "direction": "short",
                "signal": "scalp_rsi_exhaustion",
                "indicators": indicators,
                "atr": curr_atr,
            }

    return None


# ── Main Auto-Trader ─────────────────────────────────────────────────────

STRATEGY_FUNCS = {
    "trend_following": strategy_trend_following,
    "mean_reversion": strategy_mean_reversion,
    "momentum": strategy_momentum,
    "scalping": strategy_scalping,
}


def _check_correlation(symbol: str, open_symbols: set) -> bool:
    """Check if opening a position in symbol would violate correlation limits.
    Returns True if the trade is allowed, False if blocked.
    """
    for group in CORRELATION_GROUPS:
        if symbol in group:
            # Check if any correlated symbol already has a position
            if open_symbols & group:
                return False
    return True


def _get_drawdown_multiplier(account: Dict) -> float:
    """Get position size multiplier based on current drawdown.
    Returns 1.0 (full size), 0.5 (half size), or 0.0 (stop trading).
    """
    peak = account.get("peak_equity", INITIAL_BALANCE)
    equity = account.get("equity", INITIAL_BALANCE)
    if peak <= 0:
        return 1.0
    drawdown_pct = ((peak - equity) / peak) * 100

    if drawdown_pct >= DRAWDOWN_STOP_PCT:
        return 0.0
    elif drawdown_pct >= DRAWDOWN_HALF_SIZE_PCT:
        return 0.5
    return 1.0


def run_auto_trader(wallet: str, prices: Dict[str, float]) -> List[Dict]:
    """
    Run all enabled strategies for an account.
    Called by the perp-cron every minute with live prices.
    Returns list of actions taken.
    """
    config = get_strategy_config(wallet)

    if not config.get("auto_trading_enabled"):
        return []

    account = perp_accounts.find_one({"wallet": wallet})
    if not account:
        return []

    if account.get("trading_paused"):
        return [{"action": "skipped", "reason": "Trading paused — daily loss limit"}]

    # Drawdown protection
    dd_mult = _get_drawdown_multiplier(account)
    if dd_mult <= 0:
        return [{"action": "skipped", "reason": f"Drawdown protection: >{DRAWDOWN_STOP_PCT}% drawdown, trading halted"}]

    equity = account.get("equity", INITIAL_BALANCE)
    balance = account.get("balance", 0)
    global_settings = config.get("global_settings", {})
    cooldown = global_settings.get("cooldown_minutes", COOLDOWN_MINUTES)
    min_candles = global_settings.get("min_candles", MIN_CANDLES)

    # Get current open positions
    open_pos = list(perp_positions.find({"account_id": wallet, "status": "open"}))
    open_count = len(open_pos)
    open_symbols = set(p["symbol"] for p in open_pos)

    actions = []

    for strategy_name, strategy_func in STRATEGY_FUNCS.items():
        strat_config = config.get("strategies", {}).get(strategy_name, {})
        if not strat_config.get("enabled"):
            continue

        strat_markets = strat_config.get("markets", [])
        strat_leverage = strat_config.get("leverage", 5)
        strat_max_pos = strat_config.get("max_positions", 2)
        sl_mult = strat_config.get("sl_atr_mult", 2.0)
        tp_mult = strat_config.get("tp_atr_mult", 3.0)
        trailing_pct = strat_config.get("trailing_stop_pct", 0)

        # Count positions for this strategy
        strat_positions = sum(
            1 for p in open_pos
            if p.get("entry_reason", "").startswith(f"[{strategy_name}]")
        )
        if strat_positions >= strat_max_pos:
            continue

        for symbol in strat_markets:
            if symbol not in prices:
                continue

            # Skip if already have position in this market
            if symbol in open_symbols:
                continue

            # Correlation guard — max 1 position across correlated groups
            if not _check_correlation(symbol, open_symbols):
                continue

            # Check total position limit
            if open_count >= global_settings.get("max_total_positions", MAX_OPEN_POSITIONS):
                break

            # Check cooldown
            if is_on_cooldown(wallet, symbol, cooldown):
                continue

            # Store current price
            store_price(symbol, prices[symbol])

            # Get price history
            price_series = get_price_series(symbol, min_candles)
            if len(price_series) < min_candles:
                continue

            # Run strategy
            signal = strategy_func(price_series, strat_config)
            if not signal:
                continue

            direction = signal["direction"]
            atr_value = signal.get("atr", 0)
            curr_price = prices[symbol]

            # Calculate position size (with drawdown protection)
            size_usd = calculate_position_size(
                equity, atr_value, curr_price, strat_leverage, sl_mult
            )
            if dd_mult < 1.0:
                size_usd = round(size_usd * dd_mult, 2)
            if size_usd <= 0:
                log_signal(wallet, strategy_name, symbol, direction,
                          signal["signal"], signal["indicators"], False,
                          "Position size too small")
                continue

            # Check if we have enough balance
            margin_needed = size_usd / strat_leverage
            if margin_needed > balance * 0.9:  # Keep 10% buffer
                log_signal(wallet, strategy_name, symbol, direction,
                          signal["signal"], signal["indicators"], False,
                          f"Insufficient balance: need ${margin_needed:.2f}, have ${balance:.2f}")
                continue

            # Calculate SL/TP
            if direction == "long":
                stop_loss = curr_price - (atr_value * sl_mult)
                take_profit = signal.get("tp_override", curr_price + (atr_value * tp_mult))
            else:
                stop_loss = curr_price + (atr_value * sl_mult)
                take_profit = signal.get("tp_override", curr_price - (atr_value * tp_mult))

            entry_reason = f"[{strategy_name}] {signal['signal']}"

            # Place the trade
            try:
                position = open_position(
                    wallet=wallet,
                    symbol=symbol,
                    direction=direction,
                    leverage=strat_leverage,
                    size_usd=size_usd,
                    entry_price=curr_price,
                    stop_loss=stop_loss,
                    take_profit=take_profit,
                    trailing_stop_pct=trailing_pct if trailing_pct > 0 else None,
                    entry_reason=entry_reason,
                )

                log_signal(wallet, strategy_name, symbol, direction,
                          signal["signal"], signal["indicators"], True)

                actions.append({
                    "action": "opened",
                    "strategy": strategy_name,
                    "symbol": symbol,
                    "direction": direction,
                    "size_usd": size_usd,
                    "leverage": strat_leverage,
                    "entry_price": curr_price,
                    "stop_loss": round(stop_loss, 6),
                    "take_profit": round(take_profit, 6),
                    "trailing_stop_pct": trailing_pct if trailing_pct > 0 else None,
                    "signal": signal["signal"],
                })

                open_count += 1
                open_symbols.add(symbol)
                # Update balance after trade
                balance -= (size_usd / strat_leverage) + (size_usd * 0.0006)

            except ValueError as e:
                log_signal(wallet, strategy_name, symbol, direction,
                          signal["signal"], signal["indicators"], False,
                          str(e))
                actions.append({
                    "action": "error",
                    "strategy": strategy_name,
                    "symbol": symbol,
                    "error": str(e),
                })

    # ── Run Ninja Ambush strategy (pending orders at key levels) ──
    ninja_config = config.get("strategies", {}).get("ninja", {})
    if ninja_config.get("enabled"):
        try:
            from perp_ninja_strategy import run_ninja_strategy
            peak_equity = account.get("peak_equity", equity)
            ninja_actions = run_ninja_strategy(wallet, prices, equity, peak_equity)
            for a in ninja_actions:
                a["strategy"] = "ninja"
            actions.extend(ninja_actions)
        except Exception as e:
            print(f"[auto_trader] Ninja strategy error: {e}")
            actions.append({"action": "error", "strategy": "ninja", "error": str(e)})

    # ── Run Grid Trading strategy (ATR-based grid of limit orders) ──
    grid_config = config.get("strategies", {}).get("grid", {})
    if grid_config.get("enabled"):
        try:
            from perp_grid_strategy import run_grid_strategy
            peak_equity = account.get("peak_equity", equity)
            grid_actions = run_grid_strategy(wallet, prices, equity, peak_equity)
            for a in grid_actions:
                a["strategy"] = "grid"
            actions.extend(grid_actions)
        except Exception as e:
            print(f"[auto_trader] Grid strategy error: {e}")
            actions.append({"action": "error", "strategy": "grid", "error": str(e)})

    return actions


def get_strategy_status(wallet: str) -> Dict:
    """Get current strategy status for display."""
    config = get_strategy_config(wallet)
    account = perp_accounts.find_one({"wallet": wallet})

    # Count candles per market
    candle_counts = {}
    all_markets = set()
    for strat in config.get("strategies", {}).values():
        for m in strat.get("markets", []):
            all_markets.add(m)
    for symbol in all_markets:
        candle_counts[symbol] = get_candle_count(symbol)

    # Recent signals
    recent = get_recent_signals(wallet, 20)

    # Active strategy positions
    open_pos = list(perp_positions.find({"account_id": wallet, "status": "open"}))
    strategy_positions = {}
    all_strategy_names = list(STRATEGY_FUNCS.keys()) + ["ninja", "grid"]
    for name in all_strategy_names:
        strategy_positions[name] = [
            {
                "symbol": p["symbol"],
                "direction": p["direction"],
                "pnl": p.get("unrealized_pnl", 0),
            }
            for p in open_pos
            if p.get("entry_reason", "").startswith(f"[{name}]")
        ]

    return {
        "auto_trading_enabled": config.get("auto_trading_enabled", False),
        "strategies": config.get("strategies", {}),
        "global_settings": config.get("global_settings", {}),
        "candle_counts": candle_counts,
        "min_candles_required": config.get("global_settings", {}).get("min_candles", MIN_CANDLES),
        "recent_signals": recent,
        "strategy_positions": strategy_positions,
        "trading_paused": account.get("trading_paused", False) if account else False,
    }

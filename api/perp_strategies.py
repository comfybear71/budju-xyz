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
perp_strategy_performance = db["perp_strategy_performance"]

# Indexes
perp_price_history.create_index([("symbol", 1), ("timestamp", -1)])
perp_price_history.create_index([("symbol", 1), ("interval", 1), ("timestamp", -1)])
perp_strategy_signals.create_index([("account_id", 1), ("timestamp", -1)])
perp_strategy_performance.create_index([("account_id", 1), ("strategy", 1), ("symbol", 1)], unique=True)

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
    "keltner": {
        "enabled": False,          # Keltner Channel — mean reversion + squeeze breakout
        "leverage": 3,
        "sl_atr_mult": 1.5,
        "tp_atr_mult": 3.0,       # Mean reversion: 3x ATR to middle
        "trailing_stop_pct": 1.0,
        "max_positions": 3,
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP", "AVAX-PERP"],
    },
    "bb_squeeze": {
        "enabled": False,          # Bollinger Squeeze — volatility compression breakout
        "leverage": 4,
        "sl_atr_mult": 2.0,
        "tp_atr_mult": 8.0,       # Wide TP — trailing stop is primary exit
        "trailing_stop_pct": 2.5,
        "max_positions": 2,
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP"],
    },
    "zone_recovery": {
        "enabled": False,          # Zone Recovery — hedge recovery with escalating lots
        "leverage": 3,
        "sl_atr_mult": 2.0,
        "tp_atr_mult": 3.0,
        "trailing_stop_pct": 0,
        "max_positions": 4,        # 2 zones × 2 sides
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP"],
    },
    "hf_scalper": {
        "enabled": False,          # High-Frequency Scalper — lots of small quick trades
        "leverage": 5,
        "sl_atr_mult": 0.5,        # Very tight stop
        "tp_atr_mult": 1.0,        # Quick target
        "trailing_stop_pct": 0.5,
        "max_positions": 15,       # Many small positions
        "markets": list(MARKETS.keys()),  # All markets
    },
    "sr_reversal": {
        "enabled": False,          # S/R Reversal — 15-min support/resistance bounces
        "leverage": 3,
        "sl_atr_mult": 1.5,        # Tight SL behind the level
        "tp_atr_mult": 3.0,        # Target back toward middle
        "trailing_stop_pct": 1.0,
        "max_positions": 3,
        "markets": ["SOL-PERP", "BTC-PERP", "ETH-PERP", "SUI-PERP", "AVAX-PERP", "LINK-PERP"],
    },
}

# Strategy candle timeframe — 15-min candles for real signal quality
# (1-min candles = pure noise, no strategy is profitable on them)
CANDLE_MINUTES = 15
# How many candles we need for calculations
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
DRAWDOWN_STOP_PCT = 30.0       # Raised from 10% for paper trading — need ML training data

# ── Equity Curve Trading (Meta-Filter) ──────────────────────────────────
# Monitors the strategy's own equity curve. If the equity curve is trending
# down (below its own moving average), reduce or pause trading. This is a
# "strategy of strategies" concept from forex EA design.
#
# How it works:
#   - Track equity snapshots at each cron run
#   - Calculate EMA of equity curve
#   - If equity < equity_EMA → "cold streak" → reduce size or pause
#   - If equity > equity_EMA → "hot streak" → trade normal or increase
EQUITY_CURVE_EMA_PERIOD = 20     # 20 cron runs (~20 minutes or ~100 min at 5-min cron)
EQUITY_CURVE_ENABLED = True      # Master switch for equity curve filter

# ── Binance symbol mapping for historical candle seeding ────────────────
BINANCE_SYMBOLS = {
    "SOL-PERP": "SOLUSDT",
    "BTC-PERP": "BTCUSDT",
    "ETH-PERP": "ETHUSDT",
    "DOGE-PERP": "DOGEUSDT",
    "AVAX-PERP": "AVAXUSDT",
    "LINK-PERP": "LINKUSDT",
    "SUI-PERP": "SUIUSDT",
    "RENDER-PERP": "RENDERUSDT",
    "JUP-PERP": "JUPUSDT",
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
    """How many candles we have stored for a symbol. Cached in Redis (5min TTL)."""
    from redis_cache import cache_get, cache_set

    cache_key = f"perp:candle_count:{symbol}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    count = perp_price_history.count_documents({"symbol": symbol, "interval": "1m"})
    cache_set(cache_key, count, ttl=300)  # 5 minutes — candles grow slowly
    return count


def get_price_series_15m(symbol: str, count: int = 100) -> List[float]:
    """Get the last N 15-minute close prices for a symbol.

    Aggregates from stored 1-minute data by taking the last price
    in each 15-minute bucket. If 15m candles were directly seeded,
    uses those instead.
    """
    # First try directly stored 15m candles
    docs_15m = list(perp_price_history.find(
        {"symbol": symbol, "interval": "15m"},
        {"price": 1, "_id": 0},
    ).sort("timestamp", -1).limit(count))

    if len(docs_15m) >= count:
        return [d["price"] for d in reversed(docs_15m)]

    # Fallback: aggregate from 1-minute data
    # Need count * 15 one-minute candles to build count 15-min bars
    needed_1m = count * 15 + 15  # Extra buffer
    docs_1m = list(perp_price_history.find(
        {"symbol": symbol, "interval": "1m"},
        {"price": 1, "timestamp": 1, "_id": 0},
    ).sort("timestamp", -1).limit(needed_1m))

    if len(docs_1m) < 15:
        return [d["price"] for d in reversed(docs_15m)] if docs_15m else []

    # Group by 15-minute buckets
    docs_1m.reverse()  # Chronological order
    buckets = {}
    for doc in docs_1m:
        ts = doc["timestamp"]
        # Round down to nearest 15-minute boundary
        bucket_min = (ts.minute // 15) * 15
        bucket_ts = ts.replace(minute=bucket_min, second=0, microsecond=0)
        bucket_key = bucket_ts.isoformat()
        buckets[bucket_key] = doc["price"]  # Last price in bucket = close

    # Get the last N buckets
    sorted_keys = sorted(buckets.keys())
    prices_15m = [buckets[k] for k in sorted_keys[-count:]]
    return prices_15m


def seed_15m_candles(symbol: str, count: int = 200) -> int:
    """Seed 15-minute historical candles from Binance for S/R analysis.

    15-min candles give better support/resistance levels than 1-min noise.
    """
    existing = perp_price_history.count_documents(
        {"symbol": symbol, "interval": "15m"}
    )
    if existing >= count:
        return 0

    binance_symbol = BINANCE_SYMBOLS.get(symbol)
    if not binance_symbol:
        return 0

    needed = count - existing
    url = (
        f"https://api.binance.com/api/v3/klines"
        f"?symbol={binance_symbol}&interval=15m&limit={min(needed, 500)}"
    )
    req = Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "BudjuBot/1.0",
    })

    try:
        with urlopen(req, timeout=10) as resp:
            klines = json.loads(resp.read().decode())
    except Exception as e:
        print(f"[seed] Binance 15m fetch failed for {symbol}: {e}")
        return 0

    seeded = 0
    for kline in klines:
        open_time_ms = kline[0]
        close_price = float(kline[4])
        high_price = float(kline[2])
        low_price = float(kline[3])
        ts = datetime.utcfromtimestamp(open_time_ms / 1000)
        ts = ts.replace(second=0, microsecond=0)

        perp_price_history.update_one(
            {"symbol": symbol, "timestamp": ts, "interval": "15m"},
            {"$setOnInsert": {
                "symbol": symbol,
                "timestamp": ts,
                "interval": "15m",
                "price": close_price,
                "high": high_price,
                "low": low_price,
                "updated_at": datetime.utcnow(),
                "source": "binance_seed",
            }},
            upsert=True,
        )
        seeded += 1

    if seeded > 0:
        print(f"[seed] Seeded {seeded} 15m candles for {symbol}")
    return seeded


def get_15m_hlc(symbol: str, count: int = 100):
    """Get 15-minute High, Low, Close arrays for S/R detection.

    Returns (highs, lows, closes) lists.
    """
    docs = list(perp_price_history.find(
        {"symbol": symbol, "interval": "15m"},
        {"price": 1, "high": 1, "low": 1, "_id": 0},
    ).sort("timestamp", -1).limit(count))

    if not docs:
        return [], [], []

    docs.reverse()
    highs = [d.get("high", d["price"]) for d in docs]
    lows = [d.get("low", d["price"]) for d in docs]
    closes = [d["price"] for d in docs]
    return highs, lows, closes


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
            # Also seed 15-minute candles for S/R analysis
            total_seeded += seed_15m_candles(symbol, 200)
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

    # Scale to approximate 1-hour ATR from candle data
    # 1-min: sqrt(60) ≈ 7.75, 15-min: sqrt(4) = 2.0, 60-min: 1.0
    scale = math.sqrt(60 / CANDLE_MINUTES)

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


# ── Standard Indicator Helper ────────────────────────────────────────────

def build_standard_indicators(prices: List[float]) -> Dict:
    """Compute the full ML feature set from a price series.

    Returns a dict with every key the ML model expects. Safe to call even
    with short price series — returns neutral defaults on insufficient data.
    Merge into strategy-specific indicator dicts so neither can drift:
        indicators = {**build_standard_indicators(prices), ...strategy_specific...}
    Strategy-specific values override the standard ones where they overlap.
    """
    price = prices[-1] if prices else 1.0
    result: Dict = {
        "price":      price,
        "rsi":        50.0,
        "fast_ema":   0.0,
        "slow_ema":   0.0,
        "atr":        0.0,
        "bb_upper":   0.0,
        "bb_middle":  0.0,
        "bb_lower":   0.0,
        "confidence": 0.0,
    }

    if len(prices) < 22:
        return result

    # RSI(14)
    rsi_vals = rsi(prices, 14)
    curr_rsi = rsi_vals[-1] if rsi_vals else 50.0
    result["rsi"] = round(curr_rsi, 2)

    # EMA(9) and EMA(21)
    fast_vals = ema(prices, 9)
    slow_vals = ema(prices, 21)
    curr_fast = fast_vals[-1] if fast_vals else 0.0
    curr_slow = slow_vals[-1] if slow_vals else 0.0
    result["fast_ema"] = round(curr_fast, 6)
    result["slow_ema"] = round(curr_slow, 6)

    # ATR(14)
    atr_vals = atr(prices, 14)
    curr_atr = atr_vals[-1] if atr_vals else 0.0
    result["atr"] = round(curr_atr, 6)

    # Bollinger Bands(20, 2σ)
    if len(prices) >= 20:
        upper, middle, lower = bollinger_bands(prices, 20, 2.0)
        if upper:
            result["bb_upper"]  = round(upper[-1], 6)
            result["bb_middle"] = round(middle[-1], 6)
            result["bb_lower"]  = round(lower[-1], 6)

    # Confidence: RSI distance from neutral (0 = flat, 100 = extreme)
    result["confidence"] = round(min(100.0, abs(curr_rsi - 50.0) * 2), 1)

    return result


# ── Strategy Config ──────────────────────────────────────────────────────

def get_strategy_config(wallet: str) -> Dict:
    """Get strategy configuration for an account.

    Merges any new strategies from DEFAULT_STRATEGIES into existing configs
    so that accounts created before new strategies were added still see them.
    """
    config = perp_strategy_config.find_one({"wallet": wallet})
    if config:
        result = dict(config)
        result.pop("_id", None)

        # Merge in any new strategies that didn't exist when this account was created
        saved_strategies = result.get("strategies", {})
        updated = False
        for name, defaults in DEFAULT_STRATEGIES.items():
            if name not in saved_strategies:
                saved_strategies[name] = dict(defaults)
                updated = True
        if updated:
            result["strategies"] = saved_strategies
            perp_strategy_config.update_one(
                {"wallet": wallet},
                {"$set": {"strategies": saved_strategies, "updated_at": datetime.utcnow()}},
            )

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


def start_strategy_test(wallet: str, strategy_name: str, duration_minutes: int = 60) -> Dict:
    """Start a 1-hour test of a single strategy with max leverage, max size, all markets.

    - Disables all other strategies
    - Enables the target strategy with max leverage (50x, capped per market by engine)
    - Sets markets to ALL available markets
    - Increases max_positions to 9 (one per market)
    - Sets test_expires_at for auto-stop
    - Enables auto_trading
    """
    all_markets = list(MARKETS.keys())

    config = get_strategy_config(wallet)
    strategies = config.get("strategies", {})

    if strategy_name not in strategies:
        raise ValueError(f"Unknown strategy: {strategy_name}")

    # Save original config for restoration
    original_config = {}
    for name, strat in strategies.items():
        original_config[name] = {
            "enabled": strat.get("enabled", False),
            "leverage": strat.get("leverage", 5),
            "max_positions": strat.get("max_positions", 2),
            "markets": strat.get("markets", []),
        }

    # Disable all strategies, then enable only the target
    updates = {}
    for name in strategies:
        updates[f"strategies.{name}.enabled"] = False

    # Enable target strategy with max settings
    updates[f"strategies.{strategy_name}.enabled"] = True
    updates[f"strategies.{strategy_name}.leverage"] = 50  # Engine caps per market
    updates[f"strategies.{strategy_name}.max_positions"] = len(all_markets)
    updates[f"strategies.{strategy_name}.markets"] = all_markets

    # Set test metadata
    expires_at = datetime.utcnow() + timedelta(minutes=duration_minutes)
    updates["auto_trading_enabled"] = True
    updates["test_mode"] = {
        "active": True,
        "strategy": strategy_name,
        "started_at": datetime.utcnow(),
        "expires_at": expires_at,
        "duration_minutes": duration_minutes,
        "original_config": original_config,
    }

    update_strategy_config(wallet, updates)

    return {
        "success": True,
        "strategy": strategy_name,
        "markets": all_markets,
        "leverage": 50,
        "expires_at": expires_at.isoformat(),
        "duration_minutes": duration_minutes,
    }


def stop_strategy_test(wallet: str) -> Dict:
    """Stop an active strategy test and restore original configuration."""
    config = get_strategy_config(wallet)
    test_mode = config.get("test_mode")

    if not test_mode or not test_mode.get("active"):
        return {"success": False, "error": "No active test"}

    original = test_mode.get("original_config", {})

    # Restore original strategy configs
    updates = {}
    for name, orig in original.items():
        updates[f"strategies.{name}.enabled"] = orig.get("enabled", False)
        updates[f"strategies.{name}.leverage"] = orig.get("leverage", 5)
        updates[f"strategies.{name}.max_positions"] = orig.get("max_positions", 2)
        updates[f"strategies.{name}.markets"] = orig.get("markets", [])

    updates["auto_trading_enabled"] = False
    updates["test_mode"] = {"active": False}

    update_strategy_config(wallet, updates)

    return {"success": True, "restored": True}


def check_test_expiry(wallet: str) -> bool:
    """Check if a strategy test has expired and auto-stop it. Returns True if expired."""
    config = get_strategy_config(wallet)
    test_mode = config.get("test_mode")

    if not test_mode or not test_mode.get("active"):
        return False

    expires_at = test_mode.get("expires_at")
    if not expires_at:
        return False

    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)

    if datetime.utcnow() >= expires_at:
        stop_strategy_test(wallet)
        return True

    return False


# ── Signal Logging ───────────────────────────────────────────────────────

def log_signal(wallet: str, strategy: str, symbol: str, direction: str,
               signal_type: str, indicators: Dict, acted: bool, reason: str = "",
               rejected_by: str = ""):
    """Log a strategy signal for auditing."""
    doc = {
        "account_id": wallet,
        "strategy": strategy,
        "symbol": symbol,
        "direction": direction,
        "signal_type": signal_type,
        "indicators": indicators,
        "acted": acted,
        "reason": reason,
        "timestamp": datetime.utcnow(),
    }
    if rejected_by:
        doc["rejected_by"] = rejected_by
    perp_strategy_signals.insert_one(doc)


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
        **build_standard_indicators(prices),
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
        **build_standard_indicators(prices),
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
        **build_standard_indicators(prices),
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
        **build_standard_indicators(prices),
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


# ── Keltner Channel + BB Squeeze (EA strategies) ────────────────────────

def strategy_keltner_wrapper(prices: List[float], config: Dict) -> Optional[Dict]:
    """Wrapper to lazy-import and run Keltner Channel strategy."""
    try:
        from perp_keltner import strategy_keltner
        return strategy_keltner(prices, config)
    except Exception as e:
        print(f"[strategy] Keltner error: {e}")
        return None


def strategy_bb_squeeze_wrapper(prices: List[float], config: Dict) -> Optional[Dict]:
    """Wrapper to lazy-import and run BB Squeeze strategy."""
    try:
        from perp_bb_squeeze import strategy_bb_squeeze
        return strategy_bb_squeeze(prices, config)
    except Exception as e:
        print(f"[strategy] BB Squeeze error: {e}")
        return None


# ── Equity Curve Trading (Meta-Filter) ──────────────────────────────────

perp_equity_curve = db["perp_equity_curve"]
perp_equity_curve.create_index([("account_id", 1), ("timestamp", -1)])


def record_equity_snapshot(wallet: str, equity: float):
    """Record an equity snapshot for equity curve analysis."""
    perp_equity_curve.insert_one({
        "account_id": wallet,
        "equity": equity,
        "timestamp": datetime.utcnow(),
    })
    # Keep only last 200 snapshots to avoid bloat
    count = perp_equity_curve.count_documents({"account_id": wallet})
    if count > 200:
        oldest = list(perp_equity_curve.find(
            {"account_id": wallet},
            {"_id": 1},
        ).sort("timestamp", 1).limit(count - 200))
        if oldest:
            perp_equity_curve.delete_many({"_id": {"$in": [o["_id"] for o in oldest]}})


def get_equity_curve_multiplier(wallet: str) -> float:
    """Calculate position size multiplier based on equity curve health.

    Returns:
        1.0 — equity above its EMA (hot streak, trade normally)
        0.5 — equity below its EMA (cold streak, half size)
        0.0 — equity significantly below EMA (deep cold streak, pause)
    """
    if not EQUITY_CURVE_ENABLED:
        return 1.0

    snapshots = list(perp_equity_curve.find(
        {"account_id": wallet},
        {"equity": 1, "_id": 0},
    ).sort("timestamp", -1).limit(EQUITY_CURVE_EMA_PERIOD + 5))

    if len(snapshots) < EQUITY_CURVE_EMA_PERIOD:
        return 1.0  # Not enough data yet — trade normally

    # Reverse to chronological order
    equities = [s["equity"] for s in reversed(snapshots)]

    # Calculate EMA of equity curve
    equity_ema_vals = ema(equities, EQUITY_CURVE_EMA_PERIOD)
    if not equity_ema_vals:
        return 1.0

    curr_equity = equities[-1]
    curr_ema = equity_ema_vals[-1]

    if curr_ema <= 0:
        return 1.0

    ratio = curr_equity / curr_ema

    if ratio >= 1.0:
        return 1.0   # Hot streak — trade normally
    elif ratio >= 0.97:
        return 0.5   # Cooling off — half size
    else:
        return 0.25  # Cold streak — quarter size (don't fully stop to allow recovery)


# ── Strategy Performance Feedback Loop ───────────────────────────────────

# Rolling window for performance tracking
PERF_WINDOW = 20          # Look at last 20 trades per strategy/market
PERF_MIN_TRADES = 5       # Need at least 5 trades before judging
PERF_DISABLE_WR = 0.25    # Auto-disable strategy below 25% win rate
PERF_REDUCE_WR = 0.35     # Reduce sizing below 35% win rate
PERF_BOOST_WR = 0.55      # Boost sizing above 55% win rate

# Regime detection
REGIME_ADX_TRENDING = 25   # ADX above this = trending market
REGIME_ADX_STRONG = 40     # ADX above this = strong trend
REGIME_BB_SQUEEZE = 0.02   # BB width below 2% = low volatility / squeeze
REGIME_LOW_VOL_BB = 0.005  # BB width below 0.5% = dead market, block directional strats

# Overextension filter — block chasing into moves that already happened
OVEREXTENSION_LOOKBACK = 360   # 6 hours of 1-min candles
OVEREXTENSION_PCT = 0.05       # 5% move = overextended, don't chase
OVEREXTENSION_EXEMPT = {"mean_reversion"}  # MR fades moves, so it's exempt


def update_strategy_performance(wallet: str, strategy_name: str, symbol: str,
                                 pnl: float, exit_type: str):
    """Update rolling performance stats after a trade closes.
    Called from perp_engine.close_position() or can be called from cron.
    """
    is_win = pnl > 0

    # Upsert strategy/market performance doc
    perf = perp_strategy_performance.find_one({
        "account_id": wallet,
        "strategy": strategy_name,
        "symbol": symbol,
    })

    if not perf:
        perf = {
            "account_id": wallet,
            "strategy": strategy_name,
            "symbol": symbol,
            "recent_pnls": [],
            "total_trades": 0,
            "total_wins": 0,
            "total_pnl": 0.0,
            "rolling_win_rate": 0.0,
            "rolling_pnl": 0.0,
            "auto_disabled": False,
            "disable_reason": None,
            "last_updated": datetime.utcnow(),
        }

    # Append to rolling window
    recent = perf.get("recent_pnls", [])
    recent.append({"pnl": round(pnl, 4), "win": is_win, "exit_type": exit_type,
                   "timestamp": datetime.utcnow().isoformat()})
    if len(recent) > PERF_WINDOW:
        recent = recent[-PERF_WINDOW:]

    # Calculate rolling stats
    wins = sum(1 for r in recent if r["win"])
    rolling_wr = wins / len(recent) if recent else 0
    rolling_pnl = sum(r["pnl"] for r in recent)

    # Auto-disable check
    auto_disabled = False
    disable_reason = None
    if len(recent) >= PERF_MIN_TRADES and rolling_wr < PERF_DISABLE_WR:
        auto_disabled = True
        disable_reason = f"Win rate {rolling_wr:.0%} below {PERF_DISABLE_WR:.0%} threshold ({len(recent)} trades)"

    perf.update({
        "recent_pnls": recent,
        "total_trades": perf.get("total_trades", 0) + 1,
        "total_wins": perf.get("total_wins", 0) + (1 if is_win else 0),
        "total_pnl": round(perf.get("total_pnl", 0.0) + pnl, 4),
        "rolling_win_rate": round(rolling_wr, 4),
        "rolling_pnl": round(rolling_pnl, 4),
        "auto_disabled": auto_disabled,
        "disable_reason": disable_reason,
        "last_updated": datetime.utcnow(),
    })

    perp_strategy_performance.update_one(
        {"account_id": wallet, "strategy": strategy_name, "symbol": symbol},
        {"$set": perf},
        upsert=True,
    )

    return {
        "strategy": strategy_name,
        "symbol": symbol,
        "rolling_wr": rolling_wr,
        "rolling_pnl": rolling_pnl,
        "auto_disabled": auto_disabled,
        "trades_in_window": len(recent),
    }


def get_strategy_performance_multiplier(wallet: str, strategy_name: str, symbol: str) -> float:
    """Get position size multiplier based on strategy/market performance.

    Returns:
        1.5 — hot strategy (>55% win rate, 20+ trades)
        1.0 — normal (not enough data or average performance)
        0.5 — underperforming (25-35% win rate)
        0.0 — auto-disabled (<25% win rate over 5+ trades)
    """
    perf = perp_strategy_performance.find_one({
        "account_id": wallet,
        "strategy": strategy_name,
        "symbol": symbol,
    })

    if not perf:
        return 1.0  # No data yet

    trades = len(perf.get("recent_pnls", []))
    if trades < PERF_MIN_TRADES:
        return 1.0  # Not enough data

    wr = perf.get("rolling_win_rate", 0.5)

    if perf.get("auto_disabled"):
        return 0.0  # Blocked

    if wr < PERF_REDUCE_WR:
        return 0.5  # Underperforming — half size

    if wr >= PERF_BOOST_WR and trades >= PERF_WINDOW:
        return 1.5  # Hot strategy — boost

    return 1.0


def get_strategy_performance_summary(wallet: str) -> Dict:
    """Get performance summary for all strategies — used by frontend."""
    perfs = list(perp_strategy_performance.find({"account_id": wallet}))
    summary = {}
    for p in perfs:
        key = f"{p['strategy']}:{p['symbol']}"
        summary[key] = {
            "strategy": p["strategy"],
            "symbol": p["symbol"],
            "rolling_win_rate": p.get("rolling_win_rate", 0),
            "rolling_pnl": p.get("rolling_pnl", 0),
            "total_trades": p.get("total_trades", 0),
            "total_pnl": p.get("total_pnl", 0),
            "auto_disabled": p.get("auto_disabled", False),
            "disable_reason": p.get("disable_reason"),
            "trades_in_window": len(p.get("recent_pnls", [])),
        }
    return summary


def detect_market_regime(price_series: List[float], atr_values: List[float] = None) -> Dict:
    """Detect current market regime: trending, ranging, or volatile.

    Uses ADX (trend strength) + Bollinger Band width (volatility).
    Returns regime info that strategies can use to self-select.
    """
    if len(price_series) < 30:
        return {"regime": "unknown", "adx": 0, "bb_width": 0, "trend_direction": "neutral"}

    closes = price_series

    # Calculate ADX (Average Directional Index) — trend strength indicator
    # Simplified: use directional movement over rolling windows
    period = 14
    if len(closes) < period * 2:
        return {"regime": "unknown", "adx": 0, "bb_width": 0, "trend_direction": "neutral"}

    # +DM / -DM calculation
    plus_dm = []
    minus_dm = []
    tr_list = []
    for i in range(1, len(closes)):
        high_diff = closes[i] - closes[i-1]  # Simplified: using close as proxy
        low_diff = closes[i-1] - closes[i]
        plus_dm.append(max(high_diff, 0))
        minus_dm.append(max(low_diff, 0))
        tr_list.append(abs(closes[i] - closes[i-1]))

    if len(tr_list) < period:
        return {"regime": "unknown", "adx": 0, "bb_width": 0, "trend_direction": "neutral"}

    # Smoothed averages
    def smooth_avg(values, p):
        if len(values) < p:
            return []
        result = [sum(values[:p]) / p]
        for i in range(p, len(values)):
            result.append((result[-1] * (p - 1) + values[i]) / p)
        return result

    sm_plus = smooth_avg(plus_dm, period)
    sm_minus = smooth_avg(minus_dm, period)
    sm_tr = smooth_avg(tr_list, period)

    if not sm_plus or not sm_minus or not sm_tr:
        return {"regime": "unknown", "adx": 0, "bb_width": 0, "trend_direction": "neutral"}

    # DI+ and DI-
    di_plus = (sm_plus[-1] / sm_tr[-1] * 100) if sm_tr[-1] > 0 else 0
    di_minus = (sm_minus[-1] / sm_tr[-1] * 100) if sm_tr[-1] > 0 else 0

    # DX and ADX
    di_sum = di_plus + di_minus
    dx = abs(di_plus - di_minus) / di_sum * 100 if di_sum > 0 else 0

    # Simple ADX approximation (smoothed DX)
    adx = dx  # For simplicity; proper ADX needs multi-period smoothing

    # Bollinger Band width for volatility
    bb_period = 20
    if len(closes) >= bb_period:
        recent = closes[-bb_period:]
        sma_val = sum(recent) / bb_period
        std_val = (sum((x - sma_val) ** 2 for x in recent) / bb_period) ** 0.5
        bb_width = (std_val * 2) / sma_val if sma_val > 0 else 0
    else:
        bb_width = 0

    # Trend direction
    ema_fast = ema(closes, 9)
    ema_slow = ema(closes, 21)
    if ema_fast and ema_slow:
        trend_dir = "bullish" if ema_fast[-1] > ema_slow[-1] else "bearish"
    else:
        trend_dir = "neutral"

    # ATR as % of price (for volatility gating)
    atr_vals = atr(closes, 14)
    atr_pct = (atr_vals[-1] / closes[-1]) if atr_vals and closes[-1] > 0 else 0

    # Classify regime
    if adx >= REGIME_ADX_TRENDING:
        regime = "trending"
    elif bb_width < REGIME_LOW_VOL_BB:
        regime = "low_volatility"  # Dead market — only mean reversion allowed
    elif bb_width < REGIME_BB_SQUEEZE:
        regime = "ranging"  # Low volatility, mean-reverting
    else:
        regime = "volatile"  # High vol but no clear trend

    return {
        "regime": regime,
        "adx": round(adx, 2),
        "bb_width": round(bb_width, 4),
        "atr_pct": round(atr_pct, 6),
        "trend_direction": trend_dir,
        "di_plus": round(di_plus, 2),
        "di_minus": round(di_minus, 2),
    }


# Strategy suitability per regime
REGIME_STRATEGY_WEIGHTS = {
    "trending": {
        "trend_following": 1.5,   # Best in trends
        "momentum": 1.5,          # Best in trends
        "mean_reversion": 0.3,    # Bad in trends — fades the move
        "scalping": 0.5,          # OK but noisy
        "keltner": 1.0,           # Adaptive
        "bb_squeeze": 1.2,        # Squeeze breakouts work in trends
    },
    "ranging": {
        "trend_following": 0.3,   # Whipsaws in ranges
        "momentum": 0.3,          # False breakouts
        "mean_reversion": 1.5,    # Best in ranges
        "scalping": 1.0,          # OK
        "keltner": 1.2,           # MR mode works
        "bb_squeeze": 0.5,        # No squeeze in ranges
    },
    "volatile": {
        "trend_following": 0.7,
        "momentum": 1.0,
        "mean_reversion": 0.7,
        "scalping": 0.3,          # Gets stopped out
        "keltner": 1.0,
        "bb_squeeze": 1.5,        # Volatility expansion
    },
    "low_volatility": {
        "trend_following": 0.0,   # Dead market, no trend to follow
        "momentum": 0.0,          # No momentum in dead market
        "mean_reversion": 1.0,    # Can bounce off tight bands
        "scalping": 0.0,          # Fees eat everything
        "keltner": 0.0,           # No edge in dead vol
        "bb_squeeze": 0.0,        # No breakout from dead market
    },
    "unknown": {
        "trend_following": 1.0,
        "momentum": 1.0,
        "mean_reversion": 1.0,
        "scalping": 1.0,
        "keltner": 1.0,
        "bb_squeeze": 1.0,
    },
}

# ── ML Signal Classifier Gate ────────────────────────────────────────────

ML_API_URL = os.getenv("ML_API_URL", "")  # e.g. "http://your-vps:8421"
# ML_API_SECRET is the bearer token for the ML droplet. Kept separate from VPS_API_SECRET
# (used by the spot VPS trader) so one box's compromise doesn't leak both.
# Falls back to VPS_API_SECRET for backwards compatibility with pre-April-2026 setups.
ML_API_SECRET = os.getenv("ML_API_SECRET") or os.getenv("VPS_API_SECRET", "")
ML_THRESHOLD = 0.30  # Lowered from 0.40 — 574 samples too few for aggressive filtering
ML_ENABLED = bool(ML_API_URL)  # Only active when URL is configured


def ml_predict(strategy: str, symbol: str, direction: str, leverage: int,
               price: float, size_usd: float, indicators: Dict) -> Dict:
    """Call the ML prediction API to score a signal.

    Returns: {"win_probability": float, "should_trade": bool, "model_loaded": bool}
    Falls back to allowing the trade if ML API is unavailable.
    """
    if not ML_ENABLED:
        return {"win_probability": 0.5, "should_trade": True, "model_loaded": False,
                "reason": "ML not configured"}

    payload = json.dumps({
        "strategy": strategy,
        "symbol": symbol,
        "direction": direction,
        "leverage": leverage,
        "price": price,
        "size_usd": size_usd,
        "indicators": indicators,
        "threshold": ML_THRESHOLD,
    }).encode()

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "PerpCron/1.0",
    }
    if ML_API_SECRET:
        headers["Authorization"] = f"Bearer {ML_API_SECRET}"

    try:
        req = Request(f"{ML_API_URL}/predict", data=payload, headers=headers, method="POST")
        with urlopen(req, timeout=3) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        # ML API down — don't block trades, just log
        return {"win_probability": 0.5, "should_trade": True, "model_loaded": False,
                "error": str(e), "reason": "ML API unavailable — allowing trade"}


# ── Main Auto-Trader ─────────────────────────────────────────────────────

STRATEGY_FUNCS = {
    "trend_following": strategy_trend_following,
    "mean_reversion": strategy_mean_reversion,
    "momentum": strategy_momentum,
    "scalping": strategy_scalping,
    "keltner": strategy_keltner_wrapper,
    "bb_squeeze": strategy_bb_squeeze_wrapper,
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
    # Check if a strategy test has expired
    check_test_expiry(wallet)

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

    # Test mode: use max position sizing (50% of equity instead of 10%)
    test_mode = config.get("test_mode", {})
    is_test = test_mode.get("active", False)

    # Record equity snapshot for equity curve trading
    record_equity_snapshot(wallet, equity)

    actions = []

    # Equity curve meta-filter: reduce size during cold streaks
    ec_mult = get_equity_curve_multiplier(wallet)
    if ec_mult < 1.0:
        actions.append({
            "action": "equity_curve",
            "multiplier": ec_mult,
            "reason": f"Equity curve filter: {ec_mult}x sizing",
        })

    # Get current open positions
    open_pos = list(perp_positions.find({"account_id": wallet, "status": "open"}))
    open_count = len(open_pos)
    open_symbols = set(p["symbol"] for p in open_pos)

    # Pre-compute regime per market for strategy weighting
    market_regimes = {}
    for symbol in prices:
        try:
            ps = get_price_series_15m(symbol, 50)
            if len(ps) >= 30:
                market_regimes[symbol] = detect_market_regime(ps)
        except Exception:
            pass

    if market_regimes:
        regime_summary = {s: r["regime"] for s, r in market_regimes.items()}
        actions.append({"action": "regime_detection", "regimes": regime_summary})

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
                log_signal(wallet, strategy_name, symbol, "none",
                          "already_open", {}, False,
                          f"Already have open position in {symbol}",
                          rejected_by="already_open")
                continue

            # Correlation guard — max 1 position across correlated groups
            if not _check_correlation(symbol, open_symbols):
                correlated = [s for g in CORRELATION_GROUPS if symbol in g for s in g & open_symbols]
                log_signal(wallet, strategy_name, symbol, "none",
                          "correlation_guard", {}, False,
                          f"Correlated with open {', '.join(correlated)}",
                          rejected_by="correlation")
                continue

            # Check total position limit
            if open_count >= global_settings.get("max_total_positions", MAX_OPEN_POSITIONS):
                break

            # Check cooldown
            if is_on_cooldown(wallet, symbol, cooldown):
                log_signal(wallet, strategy_name, symbol, "none",
                          "cooldown", {}, False,
                          f"On cooldown ({cooldown}min)",
                          rejected_by="cooldown")
                continue

            # ── FEEDBACK LOOP: Check strategy/market performance ──
            perf_mult = get_strategy_performance_multiplier(wallet, strategy_name, symbol)
            if perf_mult <= 0:
                log_signal(wallet, strategy_name, symbol, "none",
                          "performance_disabled", {}, False,
                          f"Strategy auto-disabled: poor win rate on {symbol}",
                          rejected_by="performance")
                actions.append({
                    "action": "auto_disabled",
                    "strategy": strategy_name,
                    "symbol": symbol,
                    "reason": f"Strategy auto-disabled: poor win rate on {symbol}",
                })
                continue

            # ── REGIME FILTER: Weight strategy based on market conditions ──
            regime_info = market_regimes.get(symbol, {})
            regime = regime_info.get("regime", "unknown")
            regime_weight = REGIME_STRATEGY_WEIGHTS.get(regime, {}).get(strategy_name, 1.0)
            if regime_weight < 0.4:
                # Strategy is a poor fit for current regime — skip entirely
                reason_prefix = "Low volatility" if regime == "low_volatility" else "Regime"
                log_signal(wallet, strategy_name, symbol, "none",
                          f"{reason_prefix}: {regime} market blocks {strategy_name}",
                          {"regime": regime, "adx": regime_info.get("adx", 0),
                           "bb_width": regime_info.get("bb_width", 0),
                           "atr_pct": regime_info.get("atr_pct", 0)}, False,
                          f"{reason_prefix}: {regime} market blocks {strategy_name}",
                          rejected_by="low_volatility" if regime == "low_volatility" else "regime")
                continue

            # Store current price
            store_price(symbol, prices[symbol])

            # Get price history
            price_series = get_price_series_15m(symbol, min_candles)
            if len(price_series) < min_candles:
                continue

            # Run strategy (indicators now on 15-min candles)
            signal = strategy_func(price_series, strat_config)
            if not signal:
                continue

            direction = signal["direction"]
            atr_value = signal.get("atr", 0)
            curr_price = prices[symbol]

            # ── OVEREXTENSION FILTER: Don't chase moves that already happened ──
            if strategy_name not in OVEREXTENSION_EXEMPT:
                extended_series = get_price_series(symbol, OVEREXTENSION_LOOKBACK)
                if len(extended_series) >= 60:
                    recent_low = min(extended_series)
                    recent_high = max(extended_series)
                    if direction == "long" and recent_low > 0:
                        move_pct = (curr_price - recent_low) / recent_low
                    elif direction == "short" and recent_high > 0:
                        move_pct = (recent_high - curr_price) / recent_high
                    else:
                        move_pct = 0
                    if move_pct > OVEREXTENSION_PCT:
                        log_signal(wallet, strategy_name, symbol, direction,
                                  signal["signal"], {**signal.get("indicators", {}),
                                  "move_pct": round(move_pct * 100, 1),
                                  "lookback_hours": round(len(extended_series) / 60, 1)},
                                  False,
                                  f"Overextended: {direction} after {move_pct:.1%} move in {len(extended_series) // 60}h",
                                  rejected_by="overextended")
                        continue

            # Calculate position size (with drawdown + equity curve + performance + regime)
            if is_test:
                # Test mode: max position size = 50% of equity * leverage
                size_usd = round(equity * 0.50 * strat_leverage, 2)
            else:
                size_usd = calculate_position_size(
                    equity, atr_value, curr_price, strat_leverage, sl_mult
                )
                if dd_mult < 1.0:
                    size_usd = round(size_usd * dd_mult, 2)
                if ec_mult < 1.0:
                    size_usd = round(size_usd * ec_mult, 2)
                # Performance feedback: scale by strategy win rate
                if perf_mult != 1.0:
                    size_usd = round(size_usd * perf_mult, 2)
                # Regime weight: scale by how suitable this strategy is
                if regime_weight != 1.0:
                    size_usd = round(size_usd * regime_weight, 2)
            if size_usd <= 0:
                log_signal(wallet, strategy_name, symbol, direction,
                          signal["signal"], signal["indicators"], False,
                          "Position size too small",
                          rejected_by="size")
                continue

            # Check if we have enough balance
            margin_needed = size_usd / strat_leverage
            if margin_needed > balance * 0.9:  # Keep 10% buffer
                log_signal(wallet, strategy_name, symbol, direction,
                          signal["signal"], signal["indicators"], False,
                          f"Insufficient balance: need ${margin_needed:.2f}, have ${balance:.2f}",
                          rejected_by="balance")
                continue

            # Use signal-specific SL/TP multipliers if provided (Keltner/BB Squeeze)
            sig_sl_mult = signal.get("sl_mult", sl_mult)
            sig_tp_mult = signal.get("tp_mult", tp_mult)

            # Calculate SL/TP
            if direction == "long":
                stop_loss = curr_price - (atr_value * sig_sl_mult)
                take_profit = signal.get("tp_override", curr_price + (atr_value * sig_tp_mult))
            else:
                stop_loss = curr_price + (atr_value * sig_sl_mult)
                take_profit = signal.get("tp_override", curr_price - (atr_value * sig_tp_mult))

            # Use signal-specific trailing stop if provided
            sig_trailing = signal.get("trailing_stop_pct", trailing_pct)

            entry_reason = f"[{strategy_name}] {signal['signal']}"

            # ── ML GATE: Ask classifier if this trade is worth taking ──
            if ML_ENABLED:
                ml_result = ml_predict(
                    strategy=strategy_name, symbol=symbol, direction=direction,
                    leverage=strat_leverage, price=curr_price, size_usd=size_usd,
                    indicators=signal.get("indicators", {}),
                )
                win_prob = ml_result.get("win_probability", 0.5)
                if ml_result.get("model_loaded") and not ml_result.get("should_trade", True):
                    why = ml_result.get("why", {})
                    why_str = why.get("summary", "") if why else ""
                    reject_reason = f"ML rejected: {win_prob:.0%} < {ML_THRESHOLD:.0%}"
                    if why_str:
                        reject_reason += f" | {why_str}"
                    log_signal(wallet, strategy_name, symbol, direction,
                              signal["signal"], {**signal["indicators"], "ml_win_prob": win_prob,
                              "ml_why": why.get("top_factors", []) if why else []},
                              False, reject_reason,
                              rejected_by="ml")
                    actions.append({
                        "action": "ml_rejected",
                        "strategy": strategy_name,
                        "symbol": symbol,
                        "direction": direction,
                        "win_probability": round(win_prob, 4),
                        "threshold": ML_THRESHOLD,
                    })
                    continue
                # ML approved — log the probability for tracking
                signal["indicators"]["ml_win_prob"] = win_prob
                entry_reason = f"[{strategy_name}] {signal['signal']} (ML:{win_prob:.0%})"

            # Place the trade
            try:
                # Log signal BEFORE opening position so the signal timestamp precedes
                # the trade's entry_time. train.py matches signals to trades by finding
                # the closest signal with timestamp <= entry_time within 5 minutes.
                # If logged after, the signal timestamp is always slightly later and
                # the match fails — causing all indicator features to be zero.
                log_signal(wallet, strategy_name, symbol, direction,
                          signal["signal"], signal["indicators"], True)

                position = open_position(
                    wallet=wallet,
                    symbol=symbol,
                    direction=direction,
                    leverage=strat_leverage,
                    size_usd=size_usd,
                    entry_price=curr_price,
                    stop_loss=stop_loss,
                    take_profit=take_profit,
                    trailing_stop_pct=sig_trailing if sig_trailing > 0 else None,
                    entry_reason=entry_reason,
                )

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
                    "trailing_stop_pct": sig_trailing if sig_trailing > 0 else None,
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

    # ── Run Zone Recovery strategy (hedge recovery with escalating lots) ──
    zone_config = config.get("strategies", {}).get("zone_recovery", {})
    if zone_config.get("enabled"):
        try:
            from perp_zone_recovery import run_zone_recovery
            peak_equity = account.get("peak_equity", equity)
            zone_actions = run_zone_recovery(wallet, prices, equity, peak_equity)
            for a in zone_actions:
                a["strategy"] = "zone_recovery"
            actions.extend(zone_actions)
        except Exception as e:
            print(f"[auto_trader] Zone recovery error: {e}")
            actions.append({"action": "error", "strategy": "zone_recovery", "error": str(e)})

    # ── Run HF Scalper (high-frequency, own cooldown/position rules) ──
    hf_config = config.get("strategies", {}).get("hf_scalper", {})
    if hf_config.get("enabled"):
        try:
            from perp_hf_scalper import run_hf_scalper
            peak_equity = account.get("peak_equity", equity)
            hf_actions = run_hf_scalper(wallet, prices, equity, peak_equity)
            for a in hf_actions:
                a["strategy"] = "hf_scalper"
            actions.extend(hf_actions)
        except Exception as e:
            print(f"[auto_trader] HF Scalper error: {e}")
            actions.append({"action": "error", "strategy": "hf_scalper", "error": str(e)})

    # ── Run S/R Reversal (15-min support/resistance reversal trading) ──
    sr_config = config.get("strategies", {}).get("sr_reversal", {})
    if sr_config.get("enabled"):
        try:
            from perp_sr_reversal import run_sr_reversal
            peak_equity = account.get("peak_equity", equity)
            sr_actions = run_sr_reversal(wallet, prices, equity, peak_equity)
            for a in sr_actions:
                a["strategy"] = "sr_reversal"
            actions.extend(sr_actions)
        except Exception as e:
            print(f"[auto_trader] S/R Reversal error: {e}")
            actions.append({"action": "error", "strategy": "sr_reversal", "error": str(e)})

    return actions


def get_strategy_status(wallet: str) -> Dict:
    """Get current strategy status for display. Uses Redis cache (90s TTL)."""
    from redis_cache import cache_get, cache_set

    cache_key = f"perp:strategy_status:{wallet[:16]}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

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
    all_strategy_names = list(STRATEGY_FUNCS.keys()) + ["ninja", "grid", "zone_recovery", "hf_scalper", "sr_reversal"]
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

    # Test mode info
    test_mode = config.get("test_mode", {})
    test_info = None
    if test_mode.get("active"):
        expires_at = test_mode.get("expires_at")
        if isinstance(expires_at, datetime):
            expires_at = expires_at.isoformat()
        test_info = {
            "active": True,
            "strategy": test_mode.get("strategy"),
            "started_at": test_mode.get("started_at").isoformat() if isinstance(test_mode.get("started_at"), datetime) else test_mode.get("started_at"),
            "expires_at": expires_at,
            "duration_minutes": test_mode.get("duration_minutes", 60),
        }

    # ML stats — lightweight, no external API call (avoid blocking dashboard load)
    ml_stats = {
        "enabled": ML_ENABLED,
        "threshold": ML_THRESHOLD,
        "model_loaded": ML_ENABLED,  # If URL is configured, assume model is running
    }

    # Count ML-approved vs rejected from recent signals
    ml_approved = 0
    ml_rejected = 0
    ml_approved_wins = 0
    ml_approved_total = 0
    for sig in recent:
        indicators = sig.get("indicators", {})
        if "ml_win_prob" in indicators:
            if sig.get("acted"):
                ml_approved += 1
            else:
                ml_rejected += 1

    # ML-approved trade win rate from closed trades
    ml_trades = list(perp_trades.find(
        {"account_id": wallet, "entry_reason": {"$regex": r"\(ML:"}},
        {"realized_pnl": 1},
    ))
    if ml_trades:
        ml_approved_total = len(ml_trades)
        ml_approved_wins = sum(1 for t in ml_trades if t.get("realized_pnl", 0) > 0)
    ml_stats["approved_trades"] = ml_approved_total
    ml_stats["approved_wins"] = ml_approved_wins
    ml_stats["approved_win_rate"] = round(ml_approved_wins / ml_approved_total, 4) if ml_approved_total > 0 else None
    ml_stats["recent_approved"] = ml_approved
    ml_stats["recent_rejected"] = ml_rejected

    # Strategy performance (feedback loop data)
    perf_summary = get_strategy_performance_summary(wallet)

    result = {
        "auto_trading_enabled": config.get("auto_trading_enabled", False),
        "strategies": config.get("strategies", {}),
        "global_settings": config.get("global_settings", {}),
        "candle_counts": candle_counts,
        "min_candles_required": config.get("global_settings", {}).get("min_candles", MIN_CANDLES),
        "recent_signals": recent,
        "strategy_positions": strategy_positions,
        "trading_paused": account.get("trading_paused", False) if account else False,
        "test_mode": test_info,
        "ml_stats": ml_stats,
        "strategy_performance": perf_summary,
    }

    # Cache for 90 seconds (cron runs every 60s, so data is always <90s old)
    cache_set(cache_key, result, ttl=90)
    return result

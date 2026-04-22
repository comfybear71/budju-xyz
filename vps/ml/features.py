"""
ML Feature Definitions — Single Source of Truth
================================================
Shared by train.py (training pipeline) and server.py (prediction API).
Any change to features, encoding maps, or paths must happen here only.
"""

import os
from datetime import datetime

# ── Paths ────────────────────────────────────────────────────────────────

_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(_DIR, "model.joblib")
META_PATH  = os.path.join(_DIR, "model_meta.json")

# ── Encoding Maps ────────────────────────────────────────────────────────
# Categorical → integer. Unknown values map to -1.

STRATEGY_MAP = {
    "trend_following": 0, "mean_reversion": 1, "momentum": 2,
    "scalping": 3, "keltner": 4, "bb_squeeze": 5,
    "ninja": 6, "grid": 7, "zone_recovery": 8,
    "hf_scalper": 9, "sr_reversal": 10,
}
SYMBOL_MAP = {
    "SOL-PERP": 0, "BTC-PERP": 1, "ETH-PERP": 2, "DOGE-PERP": 3,
    "AVAX-PERP": 4, "LINK-PERP": 5, "SUI-PERP": 6, "RENDER-PERP": 7,
    "JUP-PERP": 8, "WIF-PERP": 9,
}
DIRECTION_MAP = {"long": 0, "short": 1}

# ── Feature Names (canonical order) ─────────────────────────────────────
# Must be sorted alphabetically — XGBoost model is trained with this order.

FEATURE_NAMES = sorted([
    "strategy", "symbol", "direction", "leverage",
    "hour", "day_of_week",
    "rsi", "ema_spread_pct", "atr_pct",
    "bb_width", "bb_position",
    "confidence", "size_pct",
])


def extract_features(
    strategy: str,
    symbol: str,
    direction: str,
    leverage: float,
    indicators: dict,
    price: float,
    size_usd: float,
    ts: datetime = None,
) -> dict:
    """Build the feature dict for a single trade signal.

    Used identically by train.py (from trade + signal docs) and
    server.py (from the /predict request body).

    Returns a dict keyed by FEATURE_NAMES. Unknown categoricals → -1.
    """
    ts = ts or datetime.utcnow()
    price = float(price) if price else 1.0
    ind = indicators or {}

    features = {}

    # Categorical
    features["strategy"]    = STRATEGY_MAP.get(strategy, -1)
    features["symbol"]      = SYMBOL_MAP.get(symbol, -1)
    features["direction"]   = DIRECTION_MAP.get(direction, 0)
    features["leverage"]    = float(leverage or 5)

    # Time
    features["hour"]        = ts.hour
    features["day_of_week"] = ts.weekday()

    # RSI (strategy-agnostic fallback = 50)
    features["rsi"] = float(ind.get("rsi", 50))

    # EMA spread as % of price (fast - slow)
    fast = float(ind.get("fast_ema", ind.get("ema_fast", ind.get("ema_9", 0))))
    slow = float(ind.get("slow_ema", ind.get("ema_slow", ind.get("ema_21", 0))))
    features["ema_spread_pct"] = ((fast - slow) / price * 100) if price and fast and slow else 0.0

    # ATR as % of price
    atr = float(ind.get("atr", ind.get("atr_value", 0)))
    features["atr_pct"] = (atr / price * 100) if price and atr else 0.0

    # Bollinger Band width (upper - lower as % of mid)
    bb_upper = float(ind.get("bb_upper", ind.get("upper_band", 0)))
    bb_lower = float(ind.get("bb_lower", ind.get("lower_band", 0)))
    bb_mid   = float(ind.get("bb_middle", ind.get("bb_mid", ind.get("sma", 0))))
    features["bb_width"]    = ((bb_upper - bb_lower) / bb_mid * 100) if bb_mid else 0.0
    features["bb_position"] = ((price - bb_lower) / (bb_upper - bb_lower)) if bb_upper > bb_lower else 0.5

    # Confidence / hotness score from the strategy signal (0-100)
    features["confidence"] = float(ind.get("confidence", ind.get("hotness", 50)))

    # Position size relative to a $10K account
    features["size_pct"] = float(size_usd or 0) / 10_000 * 100

    return features


def features_to_array(feat_dict: dict, names: list = None) -> list:
    """Convert a feature dict to a list in the canonical column order.

    names defaults to FEATURE_NAMES (sorted). Pass the list from
    model_meta.json to guarantee the order matches what the model was
    trained on.
    """
    cols = names or FEATURE_NAMES
    return [feat_dict.get(col, 0) for col in cols]

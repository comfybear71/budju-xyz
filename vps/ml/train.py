"""
ML Signal Classifier — Training Pipeline
==========================================
Trains an XGBoost model to predict whether a perp trading signal will be profitable.

Data sources (MongoDB):
  - perp_trades: Closed trades with entry_reason (strategy), PnL, symbol
  - perp_strategy_signals: All signals fired with indicator snapshots

Process:
  1. Load closed trades (labeled: win/loss based on realized_pnl)
  2. Match each trade to its originating signal (for indicator features)
  3. Extract features: RSI, EMA spread, ATR, BB width, regime, strategy, symbol, hour
  4. Train XGBoost classifier: P(win | features)
  5. Save model to disk for the prediction API

Run: python train.py
Schedule: daily retrain via cron
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

import numpy as np
import joblib
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ml_train")

# ── Config ────────────────────────────────────────────────────
#
# Two data-source modes:
#   1. HTTP (preferred, post-April-2026): fetch training data from Vercel via
#      /api/ml-training-data. No MongoDB credentials live on this box.
#   2. MongoDB direct (legacy/fallback): connects if BUDJU_TRAINING_API_URL is not set.
#      Kept for local development but should not be used on the hardened droplet.

TRAINING_API_URL = os.getenv("BUDJU_TRAINING_API_URL", "")
TRAINING_API_SECRET = os.getenv("BUDJU_TRAINING_API_SECRET", "")
MONGODB_URI = os.getenv("MONGODB_URI", "")
DB_NAME = os.getenv("DB_NAME", "flub")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
META_PATH = os.path.join(os.path.dirname(__file__), "model_meta.json")
MIN_TRADES_TO_TRAIN = 20  # Need at least this many closed trades

# Feature encoding maps
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


def connect_db():
    """Legacy: Connect to MongoDB directly (local dev only, not used on hardened droplet)."""
    try:
        from pymongo import MongoClient
    except ImportError:
        log.error("pymongo not installed — use HTTP mode by setting BUDJU_TRAINING_API_URL")
        sys.exit(1)
    if not MONGODB_URI:
        log.error("MONGODB_URI not set (and no BUDJU_TRAINING_API_URL configured)")
        sys.exit(1)
    log.warning("Connecting to MongoDB directly — this is DEV mode, not for hardened droplets")
    client = MongoClient(MONGODB_URI)
    return client[DB_NAME]


def fetch_training_data_http():
    """Fetch closed trades + acted signals from Vercel endpoint.

    Returns a dict with:
      trades  — list of trade dicts (datetime fields as ISO strings)
      signals — list of signal dicts
    """
    if not TRAINING_API_URL or not TRAINING_API_SECRET:
        return None

    url = f"{TRAINING_API_URL}?limit=5000"
    req = Request(url, headers={
        "Authorization": f"Bearer {TRAINING_API_SECRET}",
        "Accept": "application/json",
    })
    try:
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except HTTPError as e:
        log.error(f"Training API HTTP {e.code}: {e.reason}")
        return None
    except URLError as e:
        log.error(f"Training API unreachable: {e.reason}")
        return None

    # Parse datetime strings back to datetime objects so feature extraction still works
    def _parse(doc):
        for field in ("entry_time", "exit_time", "timestamp"):
            v = doc.get(field)
            if isinstance(v, str):
                try:
                    doc[field] = datetime.fromisoformat(v.replace("Z", "+00:00"))
                except Exception:
                    pass
        return doc

    data["trades"] = [_parse(t) for t in data.get("trades", [])]
    data["signals"] = [_parse(s) for s in data.get("signals", [])]
    log.info(f"Fetched via HTTP: {len(data['trades'])} trades, {len(data['signals'])} signals")
    return data


def extract_features(trade, signal=None):
    """Extract ML features from a trade + its matching signal indicators.

    Returns a feature vector or None if insufficient data.
    """
    features = {}

    # Basic trade features
    entry_reason = trade.get("entry_reason", "")
    strategy = ""
    if entry_reason.startswith("["):
        bracket_end = entry_reason.find("]")
        if bracket_end > 1:
            strategy = entry_reason[1:bracket_end]

    features["strategy"] = STRATEGY_MAP.get(strategy, -1)
    features["symbol"] = SYMBOL_MAP.get(trade.get("symbol", ""), -1)
    features["direction"] = DIRECTION_MAP.get(trade.get("direction", ""), 0)
    features["leverage"] = trade.get("leverage", 5)

    # Time features
    entry_time = trade.get("entry_time")
    if isinstance(entry_time, datetime):
        features["hour"] = entry_time.hour
        features["day_of_week"] = entry_time.weekday()
    else:
        features["hour"] = 12
        features["day_of_week"] = 3

    # Signal indicator features (from matched signal or trade metadata)
    indicators = {}
    if signal and isinstance(signal.get("indicators"), dict):
        indicators = signal["indicators"]

    # RSI
    features["rsi"] = float(indicators.get("rsi", 50))

    # EMA spread (fast - slow as % of price)
    fast_ema = float(indicators.get("fast_ema", indicators.get("ema_fast", indicators.get("ema_9", 0))))
    slow_ema = float(indicators.get("slow_ema", indicators.get("ema_slow", indicators.get("ema_21", 0))))
    price = float(trade.get("entry_price", 1))
    features["ema_spread_pct"] = ((fast_ema - slow_ema) / price * 100) if price > 0 and fast_ema > 0 and slow_ema > 0 else 0

    # ATR as % of price
    atr = float(indicators.get("atr", indicators.get("atr_value", 0)))
    features["atr_pct"] = (atr / price * 100) if price > 0 and atr > 0 else 0

    # Bollinger Band width
    bb_upper = float(indicators.get("bb_upper", indicators.get("upper_band", 0)))
    bb_lower = float(indicators.get("bb_lower", indicators.get("lower_band", 0)))
    bb_mid = float(indicators.get("bb_middle", indicators.get("bb_mid", indicators.get("sma", 0))))
    features["bb_width"] = ((bb_upper - bb_lower) / bb_mid * 100) if bb_mid > 0 else 0

    # Price position within BB (0 = at lower, 1 = at upper)
    if bb_upper > bb_lower:
        features["bb_position"] = (price - bb_lower) / (bb_upper - bb_lower)
    else:
        features["bb_position"] = 0.5

    # Confidence score from signal
    features["confidence"] = float(indicators.get("confidence", indicators.get("hotness", 50)))

    # Size relative to equity
    features["size_pct"] = float(trade.get("size_usd", 0)) / 10000 * 100  # Assume ~$10K equity

    return features


def load_training_data(source):
    """Load closed trades and match with signals to build training set.

    `source` can be either:
      - a dict with keys "trades" and "signals" (from HTTP fetch), or
      - a MongoDB database handle (legacy direct-connect mode).
    """
    if isinstance(source, dict):
        trades = source.get("trades", [])
        acted_signals = source.get("signals", [])
    else:
        # Legacy MongoDB path
        trades_coll = source["perp_trades"]
        signals_coll = source["perp_strategy_signals"]
        trades = list(trades_coll.find({}).sort("exit_time", -1))
        acted_signals = list(signals_coll.find({"acted": True}).sort("timestamp", -1))

    log.info(f"Found {len(trades)} closed trades")

    if len(trades) < MIN_TRADES_TO_TRAIN:
        log.warning(f"Not enough trades ({len(trades)} < {MIN_TRADES_TO_TRAIN}). Need more data.")
        return None, None

    log.info(f"Found {len(acted_signals)} acted signals")

    # Build signal lookup: (strategy, symbol, direction) → list of signals sorted by time
    signal_lookup = {}
    for sig in acted_signals:
        key = (sig.get("strategy", ""), sig.get("symbol", ""), sig.get("direction", ""))
        if key not in signal_lookup:
            signal_lookup[key] = []
        signal_lookup[key].append(sig)

    # Extract features and labels
    X_list = []
    y_list = []
    matched = 0
    unmatched = 0

    for trade in trades:
        # Label: win or loss
        pnl = trade.get("realized_pnl", 0)
        label = 1 if pnl > 0 else 0

        # Try to match trade with signal
        entry_reason = trade.get("entry_reason", "")
        strategy = ""
        if entry_reason.startswith("["):
            bracket_end = entry_reason.find("]")
            if bracket_end > 1:
                strategy = entry_reason[1:bracket_end]

        signal = None
        key = (strategy, trade.get("symbol", ""), trade.get("direction", ""))
        candidates = signal_lookup.get(key, [])

        # Find closest signal before trade entry
        entry_time = trade.get("entry_time")
        if entry_time and candidates:
            for sig in candidates:
                sig_time = sig.get("timestamp")
                if sig_time and sig_time <= entry_time:
                    # Within 5 minutes of trade entry
                    if (entry_time - sig_time).total_seconds() < 300:
                        signal = sig
                        matched += 1
                        break

        if not signal:
            unmatched += 1

        features = extract_features(trade, signal)
        if features and features["strategy"] >= 0:
            X_list.append(features)
            y_list.append(label)

    log.info(f"Training set: {len(X_list)} samples ({matched} matched signals, {unmatched} unmatched)")

    if len(X_list) < MIN_TRADES_TO_TRAIN:
        log.warning(f"Not enough valid samples ({len(X_list)} < {MIN_TRADES_TO_TRAIN})")
        return None, None

    # Convert to numpy arrays
    feature_names = sorted(X_list[0].keys())
    X = np.array([[f[k] for k in feature_names] for f in X_list])
    y = np.array(y_list)

    return X, y, feature_names


def train_model():
    """Train XGBoost classifier and save to disk."""
    log.info("=" * 60)
    log.info("ML Signal Classifier — Training Pipeline")
    log.info("=" * 60)

    # Prefer HTTP fetch from Vercel (hardened mode — no DB creds on this box).
    # Fall back to direct MongoDB for local development.
    source = fetch_training_data_http()
    if source is None:
        log.info("No training API configured — falling back to direct MongoDB")
        source = connect_db()

    result = load_training_data(source)

    if result is None or result[0] is None:
        log.error("Cannot train — insufficient data. Let strategies run and accumulate trades.")
        return False

    X, y, feature_names = result

    log.info(f"Features: {feature_names}")
    log.info(f"Dataset: {len(X)} samples, {sum(y)} wins ({sum(y)/len(y)*100:.1f}%), {len(y)-sum(y)} losses")

    # Split train/test
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if len(set(y)) > 1 else None
    )

    # Train XGBoost
    model = XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        min_child_weight=3,
        subsample=0.8,
        colsample_bytree=0.8,
        objective="binary:logistic",
        eval_metric="logloss",
        use_label_encoder=False,
        random_state=42,
    )

    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    # Evaluate
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    accuracy = accuracy_score(y_test, y_pred)
    log.info(f"\nModel accuracy: {accuracy:.1%}")
    log.info(f"\nClassification report:\n{classification_report(y_test, y_pred, target_names=['Loss', 'Win'])}")

    # Feature importance
    importances = dict(zip(feature_names, model.feature_importances_))
    sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)
    log.info("Feature importance:")
    for name, imp in sorted_imp:
        log.info(f"  {name}: {imp:.4f}")

    # Save model
    joblib.dump(model, MODEL_PATH)
    log.info(f"Model saved to {MODEL_PATH}")

    # Save metadata
    meta = {
        "trained_at": datetime.utcnow().isoformat(),
        "samples": int(len(X)),
        "features": feature_names,
        "accuracy": round(float(accuracy), 4),
        "win_rate_in_data": round(float(sum(y) / len(y)), 4),
        "feature_importance": {k: round(float(v), 4) for k, v in sorted_imp},
    }
    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2)
    log.info(f"Metadata saved to {META_PATH}")

    return True


if __name__ == "__main__":
    train_model()

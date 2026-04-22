"""
ML Signal Classifier — Training Pipeline
==========================================
Trains an XGBoost model to predict whether a perp trading signal will be profitable.

Data sources (priority order):
  1. HTTPS via Vercel /api/ml-training-data  (ML box — no DB credentials needed)
  2. Direct MongoDB connection                (fallback / local dev)

Process:
  1. Load closed trades + matched signals
  2. Extract features via features.py (single source of truth)
  3. Train XGBoost classifier: P(win | features)
  4. Save model to disk for the prediction API

Run: python train.py
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

import numpy as np
import joblib
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

from features import (
    MODEL_PATH, META_PATH,
    FEATURE_NAMES,
    extract_features, features_to_array,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ml_train")

# ── Config ────────────────────────────────────────────────────
#
# Two data-source modes:
#   1. HTTP (preferred, post-April-2026): fetch training data from Vercel via
#      /api/ml-training-data. No MongoDB credentials live on this box.
#   2. MongoDB direct (legacy/fallback): connects if BUDJU_TRAINING_API_URL is not set.
#      Kept for local development but should not be used on the hardened droplet.

MONGODB_URI              = os.getenv("MONGODB_URI", "")
DB_NAME                  = os.getenv("DB_NAME", "flub")
TRAINING_API_URL         = os.getenv("BUDJU_TRAINING_API_URL", "")
TRAINING_API_SECRET      = os.getenv("BUDJU_TRAINING_API_SECRET", "")
MIN_TRADES_TO_TRAIN      = 20


# ── Data loading ──────────────────────────────────────────────

def fetch_training_data_http() -> dict:
    """Fetch trades + signals from Vercel /api/ml-training-data via HTTPS.

    Returns parsed dict with 'trades' and 'signals' lists, or None on failure.
    Datetime strings are parsed back to datetime objects for feature extraction.
    """
    if not TRAINING_API_URL or not TRAINING_API_SECRET:
        return None

    # TRAINING_API_URL is the full endpoint, e.g. https://budju.xyz/api/ml-training-data
    url = f"{TRAINING_API_URL.rstrip('/')}?limit=2000"
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
    except json.JSONDecodeError as e:
        log.error(f"Training API returned non-JSON (wrong URL?): {e}")
        return None

    # Parse datetime strings back to datetime objects so feature extraction works
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


def fetch_training_data_mongodb() -> dict:
    """Fetch trades + signals directly from MongoDB (local dev / fallback)."""
    if not MONGODB_URI:
        raise ValueError("MONGODB_URI not set")
    from pymongo import MongoClient
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    trades  = list(db["perp_trades"].find({}).sort("exit_time", -1).limit(2000))
    signals = list(db["perp_strategy_signals"].find({"acted": True}).sort("timestamp", -1))
    # Normalise ObjectIds to strings for consistent handling
    for doc in trades + signals:
        doc["_id"] = str(doc.get("_id", ""))
    return {"trades": trades, "signals": signals}


def _parse_strategy(entry_reason: str) -> str:
    """Extract strategy name from '[trend_following] signal ...'."""
    if entry_reason.startswith("["):
        end = entry_reason.find("]")
        if end > 1:
            return entry_reason[1:end]
    return ""


def load_training_data() -> tuple:
    """Load and join trades + signals, extract features. Returns (X, y, names)."""

    # Try HTTP first, fall back to MongoDB
    raw = fetch_training_data_http()
    if raw is not None:
        log.info("Training data loaded via HTTPS API")
    else:
        try:
            raw = fetch_training_data_mongodb()
            log.info("Training data loaded via MongoDB")
        except Exception as e:
            raise RuntimeError(f"No data source available: {e}")

    trades  = raw.get("trades", [])
    signals = raw.get("signals", [])
    log.info(f"Found {len(trades)} trades, {len(signals)} acted signals")

    if len(trades) < MIN_TRADES_TO_TRAIN:
        log.warning(f"Not enough trades ({len(trades)} < {MIN_TRADES_TO_TRAIN})")
        return None, None, None

    # Build signal lookup: (strategy, symbol, direction) → list of signals
    signal_lookup: dict = {}
    for sig in signals:
        key = (sig.get("strategy", ""), sig.get("symbol", ""), sig.get("direction", ""))
        signal_lookup.setdefault(key, []).append(sig)

    X_list, y_list = [], []
    matched = unmatched = 0

    for trade in trades:
        pnl   = trade.get("realized_pnl", 0)
        label = 1 if pnl > 0 else 0

        strategy = _parse_strategy(trade.get("entry_reason", ""))
        key = (strategy, trade.get("symbol", ""), trade.get("direction", ""))
        candidates = signal_lookup.get(key, [])

        # Find closest signal within ±5 minutes of trade entry.
        # Using abs() because historically signals were logged AFTER the trade
        # opened, making sig_time slightly later than entry_time. Option B
        # (perp_strategies.py) fixes the ordering going forward, but abs()
        # ensures historical data also matches correctly.
        entry_time = trade.get("entry_time")
        best_signal = None
        best_delta = 300  # max window in seconds
        if entry_time and candidates:
            for sig in candidates:
                sig_time = sig.get("timestamp")
                if sig_time:
                    delta = abs((entry_time - sig_time).total_seconds())
                    if delta < best_delta:
                        best_delta = delta
                        best_signal = sig

        signal = best_signal
        if signal:
            matched += 1
        else:
            unmatched += 1

        indicators = signal["indicators"] if signal and isinstance(signal.get("indicators"), dict) else {}
        entry_ts = entry_time if isinstance(entry_time, datetime) else None

        feat = extract_features(
            strategy=strategy,
            symbol=trade.get("symbol", ""),
            direction=trade.get("direction", ""),
            leverage=trade.get("leverage", 5),
            indicators=indicators,
            price=trade.get("entry_price", 1),
            size_usd=trade.get("size_usd", 0),
            ts=entry_ts,
        )

        if feat["strategy"] >= 0:
            X_list.append(feat)
            y_list.append(label)

    log.info(f"Training set: {len(X_list)} samples ({matched} matched, {unmatched} unmatched)")

    if len(X_list) < MIN_TRADES_TO_TRAIN:
        log.warning(f"Not enough valid samples ({len(X_list)})")
        return None, None, None

    X = np.array([features_to_array(f) for f in X_list])
    y = np.array(y_list)

    return X, y, FEATURE_NAMES


# ── Model training ────────────────────────────────────────────

def train_model() -> bool:
    """Train XGBoost classifier and save to disk. Returns True on success."""
    log.info("=" * 60)
    log.info("ML Signal Classifier — Training Pipeline")
    log.info("=" * 60)

    try:
        result = load_training_data()
    except RuntimeError as e:
        log.error(f"Cannot load training data: {e}")
        return False

    if result is None or result[0] is None:
        log.error("Cannot train — insufficient data.")
        return False

    X, y, feature_names = result

    log.info(f"Features ({len(feature_names)}): {feature_names}")
    n_wins = int(sum(y))
    n_losses = len(y) - n_wins
    log.info(f"Dataset: {len(X)} samples, {n_wins} wins ({n_wins/len(y)*100:.1f}%), {n_losses} losses")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if len(set(y)) > 1 else None
    )

    # Correct for class imbalance: penalise missed wins proportionally to how
    # rare they are. Without this, XGBoost defaults to always predicting "loss"
    # (the majority class) and achieves misleadingly high accuracy.
    scale_pos_weight = n_losses / n_wins if n_wins > 0 else 1.0
    log.info(f"scale_pos_weight: {scale_pos_weight:.2f} ({n_losses} losses / {n_wins} wins)")

    model = XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        min_child_weight=3,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        objective="binary:logistic",
        eval_metric="logloss",
        use_label_encoder=False,
        random_state=42,
    )

    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    log.info(f"\nModel accuracy: {accuracy:.1%}")
    log.info(f"\nClassification report:\n{classification_report(y_test, y_pred, target_names=['Loss', 'Win'])}")

    importances = dict(zip(feature_names, model.feature_importances_))
    sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)
    log.info("Feature importance:")
    for name, imp in sorted_imp:
        log.info(f"  {name}: {imp:.4f}")

    joblib.dump(model, MODEL_PATH)
    log.info(f"Model saved to {MODEL_PATH}")

    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
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

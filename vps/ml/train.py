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
  3. Extract features via features.py (single source of truth)
  4. Train XGBoost classifier: P(win | features)
  5. Save model to disk for the prediction API

Run: python train.py
Schedule: daily retrain via cron
"""

import os
import sys
import json
import logging
from datetime import datetime

import numpy as np
import joblib
from pymongo import MongoClient
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

from features import (
    MODEL_PATH, META_PATH,
    STRATEGY_MAP, SYMBOL_MAP,
    FEATURE_NAMES,
    extract_features, features_to_array,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ml_train")

# ── Config ────────────────────────────────────────────────────

MONGODB_URI = os.getenv("MONGODB_URI", "")
DB_NAME = os.getenv("DB_NAME", "flub")
MIN_TRADES_TO_TRAIN = 20


def connect_db():
    """Connect to MongoDB."""
    if not MONGODB_URI:
        log.error("MONGODB_URI not set")
        sys.exit(1)
    client = MongoClient(MONGODB_URI)
    return client[DB_NAME]


def _parse_strategy(entry_reason: str) -> str:
    """Extract strategy name from entry_reason like '[trend_following] signal'."""
    if entry_reason.startswith("["):
        end = entry_reason.find("]")
        if end > 1:
            return entry_reason[1:end]
    return ""


def load_training_data(db):
    """Load closed trades and match with signals to build training set."""
    trades_coll = db["perp_trades"]
    signals_coll = db["perp_strategy_signals"]

    trades = list(trades_coll.find({}).sort("exit_time", -1))
    log.info(f"Found {len(trades)} closed trades")

    if len(trades) < MIN_TRADES_TO_TRAIN:
        log.warning(f"Not enough trades ({len(trades)} < {MIN_TRADES_TO_TRAIN}). Need more data.")
        return None, None, None

    acted_signals = list(signals_coll.find({"acted": True}).sort("timestamp", -1))
    log.info(f"Found {len(acted_signals)} acted signals")

    # Build lookup: (strategy, symbol, direction) → sorted list of signals
    signal_lookup: dict = {}
    for sig in acted_signals:
        key = (sig.get("strategy", ""), sig.get("symbol", ""), sig.get("direction", ""))
        signal_lookup.setdefault(key, []).append(sig)

    X_list, y_list = [], []
    matched = unmatched = 0

    for trade in trades:
        pnl = trade.get("realized_pnl", 0)
        label = 1 if pnl > 0 else 0

        strategy = _parse_strategy(trade.get("entry_reason", ""))

        # Best-match signal within ±5 minutes of entry (abs time delta)
        signal = None
        entry_time = trade.get("entry_time")
        key = (strategy, trade.get("symbol", ""), trade.get("direction", ""))
        candidates = signal_lookup.get(key, [])
        if entry_time and candidates:
            best_delta = 300
            for sig in candidates:
                sig_time = sig.get("timestamp")
                if sig_time:
                    delta = abs((entry_time - sig_time).total_seconds())
                    if delta < best_delta:
                        best_delta = delta
                        signal = sig
            if signal:
                matched += 1

        if not signal:
            unmatched += 1

        indicators = signal["indicators"] if signal and isinstance(signal.get("indicators"), dict) else {}

        feat = extract_features(
            strategy=strategy,
            symbol=trade.get("symbol", ""),
            direction=trade.get("direction", ""),
            leverage=trade.get("leverage", 5),
            indicators=indicators,
            price=trade.get("entry_price", 1),
            size_usd=trade.get("size_usd", 0),
            ts=entry_time if isinstance(entry_time, datetime) else None,
        )

        if feat["strategy"] >= 0:
            X_list.append(feat)
            y_list.append(label)

    log.info(f"Training set: {len(X_list)} samples ({matched} matched signals, {unmatched} unmatched)")

    if len(X_list) < MIN_TRADES_TO_TRAIN:
        log.warning(f"Not enough valid samples ({len(X_list)} < {MIN_TRADES_TO_TRAIN})")
        return None, None, None

    X = np.array([features_to_array(f) for f in X_list])
    y = np.array(y_list)

    return X, y, FEATURE_NAMES


def train_model():
    """Train XGBoost classifier and save to disk."""
    log.info("=" * 60)
    log.info("ML Signal Classifier — Training Pipeline")
    log.info("=" * 60)

    db = connect_db()
    result = load_training_data(db)

    if result is None or result[0] is None:
        log.error("Cannot train — insufficient data. Let strategies run and accumulate trades.")
        return False

    X, y, feature_names = result

    log.info(f"Features ({len(feature_names)}): {feature_names}")
    log.info(f"Dataset: {len(X)} samples, {sum(y)} wins ({sum(y)/len(y)*100:.1f}%), {len(y)-sum(y)} losses")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if len(set(y)) > 1 else None
    )

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

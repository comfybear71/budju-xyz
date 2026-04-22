"""
ML Signal Classifier — Prediction API Server
==============================================
Serves XGBoost predictions via HTTP. Called by the perp-cron
before opening any auto-trade position.

Endpoints:
  GET  /ping     — Public liveness probe (no auth)
  POST /predict  — Score a signal (returns win probability)
  GET  /health   — Health check + model info
  POST /retrain  — Trigger model retrain

Run: python server.py
Port: 8421 (next to the VPS trader on 8420)
"""

import os
import json
import logging
from datetime import datetime

import numpy as np
import joblib
from aiohttp import web

from features import (
    MODEL_PATH, META_PATH,
    extract_features, features_to_array,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ml_server")

API_PORT = int(os.getenv("ML_API_PORT", "8421"))
API_SECRET = os.getenv("ML_API_SECRET") or os.getenv("VPS_API_SECRET", "")
DEFAULT_THRESHOLD = 0.55

# Model state
model = None
meta = None
feature_names = None


def load_model():
    """Load the trained model from disk."""
    global model, meta, feature_names

    if not os.path.exists(MODEL_PATH):
        log.warning(f"No model found at {MODEL_PATH} — predictions will return 0.5 (neutral)")
        return False

    model = joblib.load(MODEL_PATH)
    log.info(f"Model loaded from {MODEL_PATH}")

    if os.path.exists(META_PATH):
        with open(META_PATH) as f:
            meta = json.load(f)
        feature_names = meta.get("features", [])
        log.info(f"Model metadata: {meta.get('samples')} samples, {meta.get('accuracy', 0):.1%} accuracy")
    else:
        feature_names = []

    return True


def verify_auth(request):
    """Verify Bearer token. Fails closed when no secret is set."""
    if not API_SECRET:
        log.warning("API_SECRET not set — rejecting request")
        return False
    auth = request.headers.get("Authorization", "")
    return auth.startswith("Bearer ") and auth[7:] == API_SECRET


async def handle_ping(request):
    """Public liveness probe — no auth required."""
    return web.json_response({"status": "ok"})


async def handle_predict(request):
    """Score a trading signal. Returns win probability.

    POST /predict
    Body: {
        "strategy": "trend_following",
        "symbol": "SOL-PERP",
        "direction": "long",
        "leverage": 5,
        "indicators": {
            "rsi": 42.5,
            "fast_ema": 80.5, "slow_ema": 79.2,
            "atr": 1.2,
            "bb_upper": 82, "bb_lower": 78, "bb_middle": 80,
            "confidence": 75
        },
        "price": 80.0,
        "size_usd": 500
    }
    """
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    # No model yet — allow trade, don't block
    if model is None:
        return web.json_response({
            "win_probability": 0.5,
            "should_trade": True,
            "threshold": DEFAULT_THRESHOLD,
            "model_loaded": False,
            "reason": "No model trained yet — allowing trade",
        })

    price = float(data.get("price", 1) or 1)

    feat = extract_features(
        strategy=data.get("strategy", ""),
        symbol=data.get("symbol", ""),
        direction=data.get("direction", ""),
        leverage=data.get("leverage", 5),
        indicators=data.get("indicators") or {},
        price=price,
        size_usd=data.get("size_usd", 0),
        ts=datetime.utcnow(),
    )

    try:
        X = np.array([features_to_array(feat, feature_names)])
        proba = float(model.predict_proba(X)[0][1])
    except Exception as e:
        log.error(f"Prediction error: {e}")
        return web.json_response({
            "win_probability": 0.5,
            "should_trade": True,
            "threshold": DEFAULT_THRESHOLD,
            "model_loaded": True,
            "error": str(e),
        })

    threshold = float(data.get("threshold", DEFAULT_THRESHOLD))

    return web.json_response({
        "win_probability": round(proba, 4),
        "should_trade": proba >= threshold,
        "threshold": threshold,
        "model_loaded": True,
        "features_used": feat,
    })


async def handle_health(request):
    """Health check + model info."""
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)
    return web.json_response({
        "status": "ok",
        "model_loaded": model is not None,
        "meta": meta,
        "port": API_PORT,
        "timestamp": datetime.utcnow().isoformat(),
    })


async def handle_retrain(request):
    """Trigger model retrain."""
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        from train import train_model
        success = train_model()
        if success:
            load_model()
            return web.json_response({"status": "ok", "retrained": True, "meta": meta})
        else:
            return web.json_response({"status": "error", "retrained": False,
                                      "reason": "Insufficient training data"})
    except Exception as e:
        log.error(f"Retrain error: {e}")
        return web.json_response({"status": "error", "error": str(e)}, status=500)


def create_app():
    app = web.Application()
    app.router.add_get("/ping", handle_ping)
    app.router.add_post("/predict", handle_predict)
    app.router.add_get("/health", handle_health)
    app.router.add_post("/retrain", handle_retrain)
    return app


if __name__ == "__main__":
    if not API_SECRET:
        raise SystemExit("ML_API_SECRET (or VPS_API_SECRET) must be set before starting")
    load_model()
    app = create_app()
    log.info(f"ML Prediction API starting on port {API_PORT}")
    web.run_app(app, host="0.0.0.0", port=API_PORT)

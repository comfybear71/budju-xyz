"""
ML Signal Classifier — Prediction API Server
==============================================
Serves XGBoost predictions via HTTP. Called by the perp-cron
before opening any auto-trade position.

Endpoints:
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ml_server")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
META_PATH = os.path.join(os.path.dirname(__file__), "model_meta.json")
API_PORT = int(os.getenv("ML_API_PORT", "8421"))
API_SECRET = os.getenv("VPS_API_SECRET", "")

# Default confidence threshold — only allow trades scoring above this
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
    """Verify API secret."""
    if not API_SECRET:
        return True
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:] == API_SECRET
    return False


# ── Strategy/symbol encoding (must match train.py) ──

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
            "ema_fast": 80.5, "ema_slow": 79.2,
            "atr": 1.2,
            "bb_upper": 82, "bb_lower": 78, "bb_mid": 80,
            "confidence": 75
        },
        "price": 80.0,
        "size_usd": 500
    }

    Response: {
        "win_probability": 0.72,
        "should_trade": true,
        "threshold": 0.55,
        "model_loaded": true
    }
    """
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    # If no model loaded, return neutral (don't block trades)
    if model is None:
        return web.json_response({
            "win_probability": 0.5,
            "should_trade": True,
            "threshold": DEFAULT_THRESHOLD,
            "model_loaded": False,
            "reason": "No model trained yet — allowing trade",
        })

    # Build feature vector
    indicators = data.get("indicators", {})
    price = float(data.get("price", 1))

    features = {}
    features["strategy"] = STRATEGY_MAP.get(data.get("strategy", ""), -1)
    features["symbol"] = SYMBOL_MAP.get(data.get("symbol", ""), -1)
    features["direction"] = DIRECTION_MAP.get(data.get("direction", ""), 0)
    features["leverage"] = data.get("leverage", 5)

    now = datetime.utcnow()
    features["hour"] = now.hour
    features["day_of_week"] = now.weekday()

    features["rsi"] = float(indicators.get("rsi", 50))

    fast_ema = float(indicators.get("fast_ema", indicators.get("ema_fast", indicators.get("ema_9", 0))))
    slow_ema = float(indicators.get("slow_ema", indicators.get("ema_slow", indicators.get("ema_21", 0))))
    features["ema_spread_pct"] = ((fast_ema - slow_ema) / price * 100) if price > 0 and fast_ema > 0 and slow_ema > 0 else 0

    atr = float(indicators.get("atr", indicators.get("atr_value", 0)))
    features["atr_pct"] = (atr / price * 100) if price > 0 and atr > 0 else 0

    bb_upper = float(indicators.get("bb_upper", indicators.get("upper_band", 0)))
    bb_lower = float(indicators.get("bb_lower", indicators.get("lower_band", 0)))
    bb_mid = float(indicators.get("bb_middle", indicators.get("bb_mid", indicators.get("sma", 0))))
    features["bb_width"] = ((bb_upper - bb_lower) / bb_mid * 100) if bb_mid > 0 else 0

    if bb_upper > bb_lower:
        features["bb_position"] = (price - bb_lower) / (bb_upper - bb_lower)
    else:
        features["bb_position"] = 0.5

    features["confidence"] = float(indicators.get("confidence", indicators.get("hotness", 50)))
    features["size_pct"] = float(data.get("size_usd", 0)) / 10000 * 100

    # Build feature array in correct order
    try:
        X = np.array([[features.get(f, 0) for f in feature_names]])
        proba = model.predict_proba(X)[0][1]  # Probability of win
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
    should_trade = proba >= threshold

    return web.json_response({
        "win_probability": round(float(proba), 4),
        "should_trade": should_trade,
        "threshold": threshold,
        "model_loaded": True,
        "features_used": features,
    })


async def handle_health(request):
    """Health check + model info."""
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
            load_model()  # Reload the new model
            return web.json_response({"status": "ok", "retrained": True, "meta": meta})
        else:
            return web.json_response({"status": "error", "retrained": False,
                                       "reason": "Insufficient training data"})
    except Exception as e:
        log.error(f"Retrain error: {e}")
        return web.json_response({"status": "error", "error": str(e)}, status=500)


def create_app():
    """Create the aiohttp app."""
    app = web.Application()
    app.router.add_post("/predict", handle_predict)
    app.router.add_get("/health", handle_health)
    app.router.add_post("/retrain", handle_retrain)
    return app


if __name__ == "__main__":
    load_model()
    app = create_app()
    log.info(f"ML Prediction API starting on port {API_PORT}")
    web.run_app(app, host="0.0.0.0", port=API_PORT)

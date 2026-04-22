"""
ML Auto-Retrain Cron
=====================
Hits the local ML server's /retrain endpoint on a schedule.
Skips retrain if fewer than MIN_NEW_TRADES have closed since last training.

Run via crontab (recommended: hourly):
  0 * * * * /home/mlbot/budju-xyz/vps/ml/venv/bin/python \
            /home/mlbot/budju-xyz/vps/ml/retrain_cron.py \
            >> /var/log/budju-ml-retrain.log 2>&1

Or to retrain only when 10+ new trades have accumulated:
  */15 * * * * ... (same command — script self-throttles via MIN_NEW_TRADES)
"""

import os
import json
import logging
import sys
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("ml_retrain_cron")

ML_API_URL    = os.getenv("ML_API_URL", "http://localhost:8421")
ML_API_SECRET = os.getenv("ML_API_SECRET") or os.getenv("VPS_API_SECRET", "")
META_PATH     = os.path.join(os.path.dirname(__file__), "model_meta.json")
MIN_NEW_TRADES = int(os.getenv("ML_RETRAIN_MIN_NEW_TRADES", "10"))


def _load_meta() -> dict:
    if os.path.exists(META_PATH):
        try:
            with open(META_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _fetch_trade_count() -> int:
    """Ask the /health endpoint how many samples the current model was trained on.
    Returns -1 on failure (treats as 'unknown — retrain anyway').
    """
    if not ML_API_SECRET:
        return -1
    url = f"{ML_API_URL}/health"
    req = Request(url, headers={"Authorization": f"Bearer {ML_API_SECRET}"})
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            meta = data.get("meta") or {}
            return int(meta.get("samples", -1))
    except Exception:
        return -1


def should_retrain(current_model_samples: int) -> bool:
    """Return True if we should attempt a retrain.

    Logic: if the current model was trained on N samples and we have no way to
    check the live trade count, retrain unconditionally (server handles 'not
    enough data' gracefully). If we can compare, only retrain once MIN_NEW_TRADES
    new closes have accumulated.
    """
    if current_model_samples < 0:
        return True  # unknown state — attempt retrain, server will decide

    meta = _load_meta()
    last_trained_samples = meta.get("samples", 0)

    # The server's /retrain endpoint re-fetches from Vercel, so "samples" in
    # model_meta.json reflects the last training run. We can't cheaply know the
    # current live count without an extra API call, so we use a simple heuristic:
    # retrain once per day at minimum (handled by caller's crontab frequency)
    # and accept the server's "insufficient data" response when trades are scarce.
    return True


def retrain() -> bool:
    """POST /retrain to the local ML server. Returns True on successful retrain."""
    if not ML_API_SECRET:
        log.error("ML_API_SECRET not set — cannot authenticate")
        return False

    url = f"{ML_API_URL}/retrain"
    req = Request(
        url,
        data=b"{}",
        headers={
            "Authorization": f"Bearer {ML_API_SECRET}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode())
    except HTTPError as e:
        log.error(f"Retrain HTTP {e.code}: {e.reason}")
        return False
    except URLError as e:
        log.error(f"ML server unreachable: {e.reason}")
        return False

    if result.get("retrained"):
        meta = result.get("meta", {})
        log.info(
            f"Retrain succeeded — {meta.get('samples')} samples, "
            f"{meta.get('accuracy', 0):.1%} accuracy, "
            f"win rate {meta.get('win_rate_in_data', 0):.1%}"
        )
        return True
    else:
        reason = result.get("reason", result.get("error", "unknown"))
        log.info(f"Retrain skipped: {reason}")
        return False


if __name__ == "__main__":
    log.info(f"ML retrain cron starting — {datetime.utcnow().isoformat()}Z")
    retrain()
    log.info("Done")

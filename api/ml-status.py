from http.server import BaseHTTPRequestHandler
import json
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from database import db

ALLOWED_ORIGINS = ["https://budju.xyz", "https://www.budju.xyz"]

perp_strategy_signals = db["perp_strategy_signals"]


def _cors_origin(headers) -> str:
    origin = headers.get("Origin", "")
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]


def _time_ago(ts) -> str:
    if not ts:
        return ""
    now = datetime.now(timezone.utc)
    if hasattr(ts, "tzinfo") and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    diff = int((now - ts).total_seconds())
    if diff < 60:
        return f"{diff}s ago"
    if diff < 3600:
        return f"{diff // 60}m ago"
    if diff < 86400:
        return f"{diff // 3600}h ago"
    return f"{diff // 86400}d ago"


def get_ml_decisions():
    since = datetime.now(timezone.utc) - timedelta(days=7)
    cursor = perp_strategy_signals.find(
        {"timestamp": {"$gte": since}},
        sort=[("timestamp", -1)],
        limit=500,
    )

    decisions = []
    for sig in cursor:
        indicators = sig.get("indicators") or {}
        ml_prob = indicators.get("ml_win_prob")
        reason = sig.get("reason") or ""
        is_ml_rejection = "ML rejected" in reason

        # Skip signals that didn't go through the ML gate at all
        if ml_prob is None and not is_ml_rejection:
            continue

        # Parse SHAP human-readable summary from rejection reason
        shap_summary = ""
        if "|" in reason:
            shap_summary = reason.split("|", 1)[1].strip()

        ml_why = indicators.get("ml_why") or []
        # Keep top 2 factors, strip heavy fields
        top_factors = [
            {"label": f.get("label", f.get("feature", "")), "impact": round(float(f.get("impact", 0)), 3)}
            for f in ml_why[:2]
        ]

        ts = sig.get("timestamp")
        decisions.append({
            "type": "blocked" if is_ml_rejection else "allowed",
            "strategy": (sig.get("strategy") or "").replace("_", " "),
            "symbol": (sig.get("symbol") or "").replace("-PERP", ""),
            "direction": sig.get("direction") or "",
            "score": round(float(ml_prob), 2) if ml_prob is not None else None,
            "shap_summary": shap_summary,
            "top_factors": top_factors,
            "time_ago": _time_ago(ts),
        })

        if len(decisions) >= 20:
            break

    return decisions


def get_stats(decisions):
    allowed = [d for d in decisions if d["type"] == "allowed"]
    blocked = [d for d in decisions if d["type"] == "blocked"]
    total = len(decisions)
    block_rate = round(len(blocked) / total * 100) if total > 0 else 0
    avg_allowed = round(sum(d["score"] for d in allowed if d["score"] is not None) / len(allowed), 2) if allowed else None
    avg_blocked = round(sum(d["score"] for d in blocked if d["score"] is not None) / len(blocked), 2) if blocked else None
    return {
        "total": total,
        "allowed": len(allowed),
        "blocked": len(blocked),
        "block_rate_pct": block_rate,
        "avg_allowed_score": avg_allowed,
        "avg_blocked_score": avg_blocked,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        origin = _cors_origin(self.headers)
        try:
            decisions = get_ml_decisions()
            stats = get_stats(decisions)
            body = json.dumps({"decisions": decisions, "stats": stats}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e), "decisions": [], "stats": {}}).encode())

    def do_OPTIONS(self):
        origin = _cors_origin(self.headers)
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass

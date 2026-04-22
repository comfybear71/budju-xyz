from http.server import BaseHTTPRequestHandler
import json
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from database import db

ALLOWED_ORIGINS = ["https://budju.xyz", "https://www.budju.xyz"]

perp_strategy_signals = db["perp_strategy_signals"]

FUNNEL_STAGES = {
    "cooldown": "Cooldown",
    "already_open": "Already Open",
    "correlation": "Correlation Guard",
    "performance": "Performance Disabled",
    "low_volatility": "Low Volatility",
    "regime": "Regime Blocked",
    "size": "Size Too Small",
    "balance": "Low Balance",
    "ml": "ML Blocked",
}


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


def get_funnel_and_decisions():
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    cursor = perp_strategy_signals.find(
        {"timestamp": {"$gte": since}},
        sort=[("timestamp", -1)],
        limit=2000,
    )

    funnel_counts = {k: 0 for k in FUNNEL_STAGES}
    funnel_counts["traded"] = 0
    ml_decisions = []
    recent_rejections = []

    for sig in cursor:
        indicators = sig.get("indicators") or {}
        ml_prob = indicators.get("ml_win_prob")
        reason = sig.get("reason") or ""
        rejected_by = sig.get("rejected_by", "")
        acted = sig.get("acted", False)
        ts = sig.get("timestamp")
        strategy = (sig.get("strategy") or "").replace("_", " ")
        symbol = (sig.get("symbol") or "").replace("-PERP", "")
        direction = sig.get("direction") or ""

        if acted:
            funnel_counts["traded"] += 1
            if ml_prob is not None:
                ml_decisions.append({
                    "type": "allowed",
                    "strategy": strategy,
                    "symbol": symbol,
                    "direction": direction,
                    "score": round(float(ml_prob), 2),
                    "shap_summary": "",
                    "top_factors": [],
                    "time_ago": _time_ago(ts),
                })
            continue

        if rejected_by and rejected_by in FUNNEL_STAGES:
            funnel_counts[rejected_by] += 1

            if rejected_by == "ml":
                shap_summary = ""
                if "|" in reason:
                    shap_summary = reason.split("|", 1)[1].strip()
                ml_why = indicators.get("ml_why") or []
                top_factors = [
                    {"label": f.get("label", f.get("feature", "")),
                     "impact": round(float(f.get("impact", 0)), 3)}
                    for f in ml_why[:2]
                ]
                ml_decisions.append({
                    "type": "blocked",
                    "strategy": strategy,
                    "symbol": symbol,
                    "direction": direction,
                    "score": round(float(ml_prob), 2) if ml_prob is not None else None,
                    "shap_summary": shap_summary,
                    "top_factors": top_factors,
                    "time_ago": _time_ago(ts),
                })
            elif len(recent_rejections) < 30:
                recent_rejections.append({
                    "rejected_by": rejected_by,
                    "label": FUNNEL_STAGES.get(rejected_by, rejected_by),
                    "strategy": strategy,
                    "symbol": symbol,
                    "direction": direction,
                    "reason": reason,
                    "time_ago": _time_ago(ts),
                })
            continue

        # Legacy signals without rejected_by — check for ML data
        is_ml_rejection = "ML rejected" in reason
        if ml_prob is not None or is_ml_rejection:
            funnel_counts["ml"] += 1
            shap_summary = ""
            if "|" in reason:
                shap_summary = reason.split("|", 1)[1].strip()
            ml_why = indicators.get("ml_why") or []
            top_factors = [
                {"label": f.get("label", f.get("feature", "")),
                 "impact": round(float(f.get("impact", 0)), 3)}
                for f in ml_why[:2]
            ]
            ml_decisions.append({
                "type": "blocked" if is_ml_rejection else "allowed",
                "strategy": strategy,
                "symbol": symbol,
                "direction": direction,
                "score": round(float(ml_prob), 2) if ml_prob is not None else None,
                "shap_summary": shap_summary,
                "top_factors": top_factors,
                "time_ago": _time_ago(ts),
            })

    # Build funnel stages array (ordered pipeline)
    funnel = []
    for key in ["cooldown", "already_open", "correlation", "performance",
                "low_volatility", "regime", "size", "balance", "ml"]:
        if funnel_counts.get(key, 0) > 0:
            funnel.append({
                "key": key,
                "label": FUNNEL_STAGES[key],
                "count": funnel_counts[key],
            })
    funnel.append({
        "key": "traded",
        "label": "Traded",
        "count": funnel_counts["traded"],
    })

    total_signals = sum(funnel_counts.values())

    # ML stats
    ml_allowed = [d for d in ml_decisions if d["type"] == "allowed"]
    ml_blocked = [d for d in ml_decisions if d["type"] == "blocked"]
    ml_total = len(ml_decisions)
    ml_stats = {
        "total": ml_total,
        "allowed": len(ml_allowed),
        "blocked": len(ml_blocked),
        "block_rate_pct": round(len(ml_blocked) / ml_total * 100) if ml_total > 0 else 0,
        "avg_allowed_score": round(sum(d["score"] for d in ml_allowed if d["score"] is not None) / len(ml_allowed), 2) if ml_allowed else None,
        "avg_blocked_score": round(sum(d["score"] for d in ml_blocked if d["score"] is not None) / len(ml_blocked), 2) if ml_blocked else None,
    }

    return {
        "funnel": funnel,
        "total_signals": total_signals,
        "ml_decisions": ml_decisions[:20],
        "recent_rejections": recent_rejections[:20],
        "stats": ml_stats,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        origin = _cors_origin(self.headers)
        try:
            data = get_funnel_and_decisions()
            body = json.dumps(data).encode()
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
            self.wfile.write(json.dumps({
                "error": str(e), "funnel": [], "total_signals": 0,
                "ml_decisions": [], "recent_rejections": [], "stats": {},
            }).encode())

    def do_OPTIONS(self):
        origin = _cors_origin(self.headers)
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass

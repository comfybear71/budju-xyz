# ==========================================
# "Is the auto-trade bot actually able to trade, and if not, why?"
# ==========================================
# Built after TRADING_ENABLED=false sat in Vercel for ~2.5 days (2026-10-24
# to 2026-10-30) and nothing in the app said so. The cron records a small
# heartbeat every run (record_cron_status); /api/state turns it plus the
# current settings into plain-English messages (compute_bot_status) that the
# admin Auto Trade screen shows as a banner.
#
# No secrets here — only whether switches are on and what the cron last said.

import os
import time

# The cron runs every 5 minutes; three missed runs means something is wrong.
CRON_STALE_MS = 15 * 60 * 1000


def record_cron_status(save_fn, result, now_ms=None):
    """Persist one run's outcome. `result` is what run_auto_trade_check()
    returned (or {"error": ...}). Never raises — a failed heartbeat write must
    not break trading."""
    try:
        now_ms = now_ms or int(time.time() * 1000)
        status = {"ranAt": now_ms}
        if not isinstance(result, dict):
            status["outcome"] = "error"
            status["reason"] = "Unexpected result from cron"
        elif result.get("error"):
            status["outcome"] = "error"
            status["reason"] = str(result["error"])[:300]
        elif result.get("skipped"):
            status["outcome"] = "skipped"
            status["reason"] = str(result.get("reason", ""))[:300]
        else:
            status["outcome"] = "ok"
            status["walletsProcessed"] = result.get("walletsProcessed", 0)
            status["walletsOptedIn"] = result.get("walletsOptedIn", 0)
            status["tradesExecuted"] = result.get("tradesExecuted", 0)
        save_fn({"autoCronStatus": status})
    except Exception:
        pass


def _ago(ms):
    mins = max(0, int(ms // 60000))
    if mins < 1:
        return "less than a minute ago"
    if mins < 60:
        return f"{mins} min ago"
    hours = mins // 60
    if hours < 48:
        return f"{hours} h ago"
    return f"{hours // 24} days ago"


def compute_bot_status(state, now_ms=None):
    """Return {"level": "ok"|"warn"|"error", "messages": [...], "lastRunAgo": str|None}.
    error = the bot will NOT trade; warn = trading but something needs a look."""
    now_ms = now_ms or int(time.time() * 1000)
    errors, warns = [], []

    if os.getenv("TRADING_ENABLED", "true").lower() == "false":
        errors.append("Trading is switched OFF — TRADING_ENABLED is false in Vercel. The bot will not place any order.")
    if os.getenv("DRY_RUN", "false").lower() == "true":
        warns.append("DRY RUN is on — the bot only pretends to trade (DRY_RUN=true in Vercel).")

    auto_active = state.get("autoActive")
    auto_active = auto_active if isinstance(auto_active, dict) else {}
    if not auto_active.get("isActive"):
        errors.append("Master switch is off on the Auto Trade screen — no tier is running.")
    else:
        tier_active = auto_active.get("tierActive") or {}
        if not any(tier_active.get(str(t)) or tier_active.get(t) for t in (1, 2, 3)):
            errors.append("Every tier (T1, T2, T3) is stopped — nothing will trade.")

    cron = state.get("autoCronStatus")
    last_run_ago = None
    if isinstance(cron, dict) and isinstance(cron.get("ranAt"), (int, float)):
        age = now_ms - cron["ranAt"]
        last_run_ago = _ago(age)
        if age > CRON_STALE_MS:
            errors.append(f"The trading job has not run since {last_run_ago} — it should run every 5 minutes.")
        else:
            outcome = cron.get("outcome")
            if outcome == "error":
                errors.append(f"Last run failed: {cron.get('reason') or 'unknown error'}")
            elif outcome == "skipped" and cron.get("reason"):
                msg = f"Last run did nothing: {cron['reason']}"
                if msg not in errors and not any(cron["reason"] in e for e in errors):
                    errors.append(msg)
            elif outcome == "ok":
                opted = cron.get("walletsOptedIn") or 0
                done = cron.get("walletsProcessed") or 0
                if opted and done < opted:
                    warns.append(f"Only {done} of {opted} wallets could be read last run — check the others' Swyftx keys.")
    else:
        warns.append("No run recorded yet — waiting for the next 5-minute trading cycle.")

    level = "error" if errors else ("warn" if warns else "ok")
    return {"level": level, "messages": errors + warns, "lastRunAgo": last_run_ago}

# ==========================================
# Remember coins Swyftx keeps switching off (pure — no database / network)
# ==========================================
# When Swyftx refuses a coin ("not presently tradable") the bot pauses it and retries. A coin that Swyftx has switched off
# for good (BTT, DASH, XMR...) used to raise the same Telegram alert every 6 hours forever. Now:
#   * the FIRST time (or the first time in 7 days) the coin is paused for 6 hours and ONE alert is sent;
#   * a repeat within 7 days is paused for 24 hours and is NOT alerted again (it is still noted in the run log);
# so a coin that stays off becomes quiet, while a coin that comes back and goes off again later is reported again.

QUIET_DAYS = 7
FORGET_DAYS = 30
FIRST_PAUSE_HOURS = 6.0
REPEAT_PAUSE_HOURS = 24.0
_DAY_MS = 86_400_000
KNOWN_OFF = ("BTT", "DASH", "XMR")      # already reported and known to be off: start quiet instead of alerting once more


def initial_seen(now_ms):
    return {c: {"first": now_ms, "last": now_ms, "count": 3} for c in KNOWN_OFF}


def next_pause(seen, coin, now_ms, first_hours=FIRST_PAUSE_HOURS, repeat_hours=REPEAT_PAUSE_HOURS):
    """-> (pause_hours, alert, new_seen). `seen` = {coin: {"first": ms, "last": ms, "count": n}} (not changed; a new dict is returned)."""
    seen = {c: dict(v) for c, v in (seen or {}).items() if isinstance(v, dict) and now_ms - float(v.get("last", 0) or 0) < FORGET_DAYS * _DAY_MS}
    cur = seen.get(coin)
    recent = bool(cur) and now_ms - float(cur.get("last", 0) or 0) < QUIET_DAYS * _DAY_MS
    if recent:
        cur["last"], cur["count"] = now_ms, int(cur.get("count", 1)) + 1
        seen[coin] = cur
        return repeat_hours, False, seen
    seen[coin] = {"first": now_ms, "last": now_ms, "count": 1}
    return first_hours, True, seen


def switched_off(state, now_ms):
    """Coins to treat as switched off on Swyftx: refused within the quiet window, or paused right now. Before the memory exists
    (nothing refused since it was added) the known BTT/DASH/XMR are used, so the screen can hide them straight away."""
    state = state or {}
    seen = state.get("autoUntradableSeen")
    out = set()
    if isinstance(seen, dict):
        out |= {c for c, v in seen.items() if isinstance(v, dict) and now_ms - float(v.get("last", 0) or 0) < QUIET_DAYS * _DAY_MS}
    else:
        out |= set(KNOWN_OFF)
    for c, until in (state.get("autoPausedAssets") or {}).items():
        if isinstance(until, (int, float)) and until > now_ms:
            out.add(c)
    return sorted(out)

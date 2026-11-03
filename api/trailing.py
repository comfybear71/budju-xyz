# ==========================================
# Trailing take-profit (pure — no database / network)
# ==========================================
# When a coin reaches its sell level the bot does NOT sell at once. It "arms" that signal and keeps the highest
# price seen. It sells only when the price falls back `pullback`% from that high — or when the price has run
# `cap`% past the sell level (a hard stop on waiting). How much it sells is unchanged: the tier's own slice.

from typing import Dict, Iterable, Optional, Tuple

DEFAULT_CONFIG = {"enabled": False, "pullbackPct": 5.0, "capPct": 25.0}
MAX_ARMED_MS = 14 * 24 * 3_600_000       # an armed signal that never resolves is dropped after 14 days


def clean_config(raw: Optional[Dict]) -> Dict:
    raw = raw or {}
    def f(key, lo, hi):
        try:
            v = float(raw.get(key, DEFAULT_CONFIG[key]))
        except (TypeError, ValueError):
            v = DEFAULT_CONFIG[key]
        return min(hi, max(lo, v))
    return {"enabled": bool(raw.get("enabled", False)), "pullbackPct": f("pullbackPct", 1.0, 20.0), "capPct": f("capPct", 5.0, 200.0)}


def step(price: float, sell_target: float, state: Optional[Dict], pullback_pct: float, cap_pct: float, now_ms: int) -> Tuple[str, Optional[Dict]]:
    """-> (decision, new_state). decision: "none" (not at the sell level), "wait" (armed, let it run), "sell"."""
    if price <= 0 or sell_target <= 0:
        return "none", None
    if state and now_ms - int(state.get("at", now_ms)) > MAX_ARMED_MS:
        state = None
    if state is None:
        if price < sell_target:
            return "none", None
        state = {"high": price, "at": now_ms}
    else:
        state = {"high": max(float(state["high"]), price), "at": int(state.get("at", now_ms))}
    hard = price >= sell_target * (1 + cap_pct / 100.0)
    pulled = price <= state["high"] * (1 - pullback_pct / 100.0)
    if hard or pulled:
        return "sell", state
    return "wait", state


def decide_all(pairs: Iterable[Tuple[str, int]], prices: Dict[str, float], targets: Dict[str, Dict],
               trail_state: Dict[str, Dict], cfg: Dict, now_ms: int) -> Tuple[Dict[str, str], Dict[str, Dict]]:
    """Decision for every coin:tier signal, once per cron cycle (shared by every wallet)."""
    decisions: Dict[str, str] = {}
    new_state: Dict[str, Dict] = {}
    for code, tier in pairs:
        ck = f"{code}:{tier}"
        tgt = targets.get(ck) or targets.get(code) or {}
        sell_target = float(tgt.get("sell", 0) or 0)
        d, st = step(float(prices.get(code, 0) or 0), sell_target, trail_state.get(ck), cfg["pullbackPct"], cfg["capPct"], now_ms)
        decisions[ck] = d
        if st is not None:
            new_state[ck] = st
    return decisions, new_state

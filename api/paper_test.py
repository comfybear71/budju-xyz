# ==========================================
# Four-week PAPER test of "dynamic coin management" (pure — no database / network)
# ==========================================
# Nothing here changes what the bot trades. Each day a snapshot of every coin's numbers is stored; each week the
# rules below decide which coins they WOULD switch off or on. Over four weeks that shows whether following the
# rules would have helped, before anything is automated.

import os
from typing import Dict, Iterable, List, Optional

CORE_COINS = [c.strip().upper() for c in os.getenv("PAPER_CORE_COINS", "BTC,ETH,SOL,BNB,XRP,LINK").split(",") if c.strip()]
MIN_DIPS = 5                 # fewer dips than this = not enough evidence either way
WEAK_YEAR, WEAK_90 = -5.0, 0.0      # avg % per dip bought over the year / last 90 days
STRONG_YEAR, STRONG_90 = 5.0, 0.0
CONFIRM_WEEKS = 2            # a coin must be weak (or strong) at two weekly reviews in a row
TEST_WEEKS = 4


def coin_status(year_per_buy: float, per90: Optional[float], dips: int, core: bool) -> str:
    """core / weak / strong / neutral / thin (not enough dips to judge)."""
    if core:
        return "core"
    if dips < MIN_DIPS:
        return "thin"
    p90 = per90 if per90 is not None else year_per_buy
    if year_per_buy < WEAK_YEAR and p90 < WEAK_90:
        return "weak"
    if year_per_buy > STRONG_YEAR and p90 > STRONG_90:
        return "strong"
    return "neutral"


def weekly_review(statuses: Dict[str, str], in_tiers: Iterable[str], state: Dict, today: str) -> Dict:
    """Update the streaks and the 'would switch off / on' lists. state is returned updated (copy)."""
    st = {"streaks": dict(state.get("streaks") or {}), "off": dict(state.get("off") or {}), "on": dict(state.get("on") or {}),
          "log": list(state.get("log") or [])}
    tiers = set(in_tiers)
    new_off, new_on, back = [], [], []
    for coin, status in statuses.items():
        s = dict(st["streaks"].get(coin) or {"weak": 0, "ok": 0, "strong": 0})
        s["weak"] = s["weak"] + 1 if status == "weak" else 0
        s["strong"] = s["strong"] + 1 if status == "strong" else 0
        s["ok"] = s["ok"] + 1 if status not in ("weak",) else 0
        st["streaks"][coin] = s
        if coin in tiers and s["weak"] >= CONFIRM_WEEKS and coin not in st["off"]:
            st["off"][coin] = {"since": today}
            new_off.append(coin)
        if coin in st["off"] and s["ok"] >= CONFIRM_WEEKS:
            del st["off"][coin]
            back.append(coin)
        if coin not in tiers and s["strong"] >= CONFIRM_WEEKS and coin not in st["on"]:
            st["on"][coin] = {"since": today}
            new_on.append(coin)
        if coin in st["on"] and status != "strong" and s["strong"] == 0:
            del st["on"][coin]
    st["log"].append({"date": today, "off": new_off, "on": new_on, "back": back})
    st["log"] = st["log"][-12:]
    return st


def what_if_off(buys: List[Dict], since_date: str, price_now: float) -> float:
    """If the coin had been switched off on since_date: the result of the buys made after it, valued now
    (negative = switching off would have SAVED that much; positive = it would have cost that much)."""
    total = 0.0
    for b in buys:
        if str(b.get("ts") or "")[:10] >= since_date:
            total += float(b["qty"]) * (price_now - float(b["price"]))
    return round(total, 2)


def paper_call(coin: str, status: str, state: Dict) -> str:
    if status == "core":
        return "core"
    if coin in (state.get("off") or {}):
        return "off"
    if coin in (state.get("on") or {}):
        return "on"
    return "keep"

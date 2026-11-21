# ==========================================
# Per-coin buying cap (pure — no database / network)
# ==========================================
# All three tiers of one coin can be triggered at the same moment after a crash, so one coin could take a fifth of a
# deposit. The cap limits how much ONE coin may be bought in any rolling 24 hours, all its tiers together:
#       cap = COIN_CAP_PCT % of the "day's money"  =  cash now + everything bought in the last 24 hours
# Counting the last 24 hours (not just this run) stops the same coin's T2/T3 from topping it up again on the next run.

import os
from datetime import datetime

COIN_CAP_PCT = float(os.getenv("COIN_CAP_PCT", "10") or 10)       # 0 switches the cap off
COIN_CAP_FLOOR = 50.0      # a coin can always take at least this much per day, so small wallets are never starved by the %


def recent_buys(trade_log, now_ms, hours=24):
    """{coin: USD bought in the last `hours`} from a wallet's trade log."""
    cutoff = now_ms - hours * 3_600_000
    out = {}
    for e in trade_log or []:
        if str(e.get("side", "")).lower() != "buy":
            continue
        try:
            ms = datetime.fromisoformat(str(e.get("timestamp") or e.get("time") or "").replace("Z", "+00:00")).timestamp() * 1000
            usd = float(e.get("qty", e.get("quantity", 0)) or 0) * float(e.get("price", 0) or 0)
        except (ValueError, TypeError):
            continue
        if ms > cutoff:
            out[e.get("coin")] = out.get(e.get("coin"), 0.0) + usd
    return out


def day_budget(cash, recent):
    return float(cash) + sum(recent.values())


def cap_amount(budget, pct=None):
    """USD one coin may be bought for per 24h, or None when the cap is off."""
    pct = COIN_CAP_PCT if pct is None else pct
    return max(budget * pct / 100.0, COIN_CAP_FLOOR) if pct and pct > 0 else None

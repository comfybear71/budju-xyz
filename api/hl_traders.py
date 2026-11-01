# Hyperliquid trader data helpers (pure). Tolerant of missing fields: the shape is checked live by the admin test card.
from typing import Callable, Dict, List


def _f(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def pick_leaders(rows: List[Dict], window_fn: Callable[[Dict, str], Dict], min_account_usd: float = 50_000.0) -> List[Dict]:
    """Traders profitable over BOTH the month and all time, with real money in the account, best monthly ROI first."""
    out = []
    for r in rows:
        if not isinstance(r, dict) or not r.get("ethAddress"):
            continue
        if _f(r.get("accountValue")) < min_account_usd:
            continue
        month, week, alltime = window_fn(r, "month"), window_fn(r, "week"), window_fn(r, "allTime")
        if _f(month.get("pnl")) <= 0 or _f(alltime.get("pnl")) <= 0 or _f(week.get("pnl")) <= 0:
            continue
        out.append({"address": r["ethAddress"], "name": r.get("displayName"), "accountValue": round(_f(r.get("accountValue")), 0),
                    "monthPnl": round(_f(month.get("pnl")), 0), "monthRoi": round(_f(month.get("roi")) * 100, 1),
                    "allTimePnl": round(_f(alltime.get("pnl")), 0), "monthVolume": round(_f(month.get("vlm")), 0)})
    out.sort(key=lambda x: -x["monthRoi"])
    return out


def summarize_fills(fills: List[Dict]) -> Dict:
    """Win rate, streak and sizes from a trader's recent fills (only fills that closed something count as wins/losses)."""
    closed = [f for f in fills if isinstance(f, dict) and _f(f.get("closedPnl")) != 0]
    closed.sort(key=lambda f: _f(f.get("time")))
    wins = sum(1 for f in closed if _f(f["closedPnl"]) > 0)
    streak = 0
    for f in reversed(closed):
        if _f(f["closedPnl"]) > 0:
            streak += 1
        else:
            break
    notional = [abs(_f(f.get("px")) * _f(f.get("sz"))) for f in fills if isinstance(f, dict)]
    return {
        "fills": len(fills), "closedTrades": len(closed),
        "winRate": round(100 * wins / len(closed), 1) if closed else None,
        "winStreak": streak,
        "avgTradeUsd": round(sum(notional) / len(notional), 0) if notional else None,
        "coins": sorted({f.get("coin") for f in fills if isinstance(f, dict) and f.get("coin")})[:10],
    }

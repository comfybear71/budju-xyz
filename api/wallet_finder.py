# ==========================================
# Active-wallet finder (pure — no network / database)
# ==========================================
# Reads the recent trades of busy Solana pools (CoinGecko on-chain data) and picks out wallets that are
# trading RIGHT NOW across several different tokens at sensible size. Being active is not the same as being
# skilled — the paper-trade scoring still decides who graduates — but it replaces a list of dormant wallets
# with a list that actually produces swaps to watch.

import time
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Set

MIN_POOLS = 2            # must show up in at least this many different pools
MIN_TRADES = 2
MAX_TRADES = 40          # more than this in the sampled window looks like a bot / market maker
MIN_TOTAL_USD = 200.0
MAX_ADDED_PER_RUN = 40
WINDOW_HOURS = 24


def _ts(v) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _usd(t: Dict) -> float:
    try:
        return float(t.get("from_token_amount") or 0) * float(t.get("price_from_in_usd") or 0)
    except (TypeError, ValueError):
        return 0.0


def find_active_wallets(trades_by_pool: Dict[str, List[Dict]], exclude: Optional[Set[str]] = None,
                        now_ts: Optional[float] = None, window_hours: int = WINDOW_HOURS) -> List[Dict]:
    """-> [{"address","pools","trades","usd","lastTs"}] ranked best first."""
    now_ts = now_ts or time.time()
    since = now_ts - window_hours * 3600
    skip = set(exclude or ()) | set(trades_by_pool.keys())
    agg: Dict[str, Dict] = {}
    for pool, trades in trades_by_pool.items():
        for t in trades or []:
            if not isinstance(t, dict) or t.get("is_anomalous"):
                continue
            addr = t.get("tx_from_address")
            ts = _ts(t.get("block_timestamp"))
            if not addr or addr in skip or ts is None or ts < since:
                continue
            a = agg.setdefault(addr, {"address": addr, "pools": set(), "trades": 0, "usd": 0.0, "lastTs": 0.0})
            a["pools"].add(pool)
            a["trades"] += 1
            a["usd"] += _usd(t)
            a["lastTs"] = max(a["lastTs"], ts)
    out = []
    for a in agg.values():
        if len(a["pools"]) < MIN_POOLS or a["trades"] < MIN_TRADES or a["trades"] > MAX_TRADES or a["usd"] < MIN_TOTAL_USD:
            continue
        out.append({"address": a["address"], "pools": len(a["pools"]), "trades": a["trades"],
                    "usd": round(a["usd"], 2), "lastTs": a["lastTs"]})
    out.sort(key=lambda r: (-r["pools"], -r["usd"]))
    return out

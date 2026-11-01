# ==========================================
# Signals — active-wallet finder job (runs about hourly from the copytrade cron)
# ==========================================
import os
import sys
import time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

FINDER_INTERVAL = timedelta(minutes=55)
POOLS_TO_SCAN = int(os.getenv("COPYTRADE_FINDER_POOLS", "12"))


def run_finder(force: bool = False) -> dict:
    from database import (_coingecko_get, get_copytrade_state, save_copytrade_state, upsert_copytrade_wallets,
                          copytrade_wallets_collection)
    from wallet_finder import find_active_wallets, MAX_ADDED_PER_RUN

    state = get_copytrade_state()
    last = state.get("lastFinderAt")
    if not force and last and datetime.utcnow() - last < FINDER_INTERVAL:
        return {"skipped": True}

    pools, errors = [], []
    for path in ("/onchain/networks/solana/trending_pools?page=1", "/onchain/networks/solana/pools?page=1"):
        try:
            for item in (_coingecko_get(path).get("data") or []):
                addr = (item.get("attributes") or {}).get("address")
                if addr and addr not in pools:
                    pools.append(addr)
        except Exception as e:
            errors.append(str(e)[:120])
    pools = pools[:POOLS_TO_SCAN]

    trades_by_pool = {}
    for addr in pools:
        try:
            data = _coingecko_get(f"/onchain/networks/solana/pools/{addr}/trades")
            trades_by_pool[addr] = [(t.get("attributes") or {}) for t in (data.get("data") or [])]
        except Exception as e:
            errors.append(str(e)[:120])

    known = {d["address"] for d in copytrade_wallets_collection.find({}, {"address": 1})}
    found = find_active_wallets(trades_by_pool, exclude=known)[:MAX_ADDED_PER_RUN]
    result = upsert_copytrade_wallets([{"address": f["address"], "source": "pools"} for f in found]) if found else {"inserted": 0}

    total_pool_found = (state.get("finderTotalAdded") or 0) + result.get("inserted", 0)
    save_copytrade_state({
        "lastFinderAt": datetime.utcnow(), "finderPools": len(trades_by_pool), "finderLastAdded": result.get("inserted", 0),
        "finderTotalAdded": total_pool_found,
        "finderError": errors[0] if errors and not trades_by_pool else None,
    })
    return {"ok": True, "pools": len(trades_by_pool), "candidates": len(found), "added": result.get("inserted", 0), "errors": len(errors)}

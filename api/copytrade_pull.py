# ==========================================
# Signals — backup wallet puller
# ==========================================
# The Helius webhook PUSHES swaps to us. If it isn't delivering, nothing moves. This also PULLS: every cron
# run it asks Helius for the latest swaps of the few tracked wallets checked longest ago, and feeds them
# through the exact same processing. Swaps seen this way are recorded and shown in Live Activity, but only
# copied (paper) when they are recent, so a stale signal never opens a position at today's price.

import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from urllib.parse import quote
from urllib.request import Request, urlopen
import json

sys.path.insert(0, os.path.dirname(__file__))

HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")
PULL_BATCH = int(os.getenv("COPYTRADE_PULL_BATCH", "12"))       # wallets per run
MAX_COPY_AGE_S = int(os.getenv("COPYTRADE_MAX_COPY_AGE_S", "1200"))  # copy only swaps newer than 20 min
HOSTS = ["https://api-mainnet.helius-rpc.com", "https://api.helius.xyz"]


def fetch_wallet_swaps(address: str, limit: int = 10) -> list:
    last = None
    for host in HOSTS:
        try:
            url = f"{host}/v0/addresses/{quote(address)}/transactions?api-key={HELIUS_API_KEY}&type=SWAP&limit={limit}"
            with urlopen(Request(url, headers={"Accept": "application/json"}), timeout=12) as resp:
                data = json.loads(resp.read().decode())
            return data if isinstance(data, list) else []
        except Exception as e:
            last = e
    raise RuntimeError(str(last)[:150])


def run_pull(batch: int = PULL_BATCH) -> dict:
    from database import get_wallets_for_pull, mark_wallets_pulled, save_copytrade_state
    from copytrade_process import handle_delivery
    if not HELIUS_API_KEY:
        save_copytrade_state({"lastPullAt": datetime.utcnow(), "lastPullError": "HELIUS_API_KEY not set"})
        return {"ok": False, "error": "HELIUS_API_KEY not set"}
    wallets = get_wallets_for_pull(batch)
    if not wallets:
        return {"ok": True, "wallets": 0, "swaps": 0}
    txs, errors = [], []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {w: pool.submit(fetch_wallet_swaps, w) for w in wallets}
        for w, f in futs.items():
            try:
                txs.extend(f.result())
            except Exception as e:
                errors.append(str(e))
    mark_wallets_pulled(wallets)
    result = handle_delivery(txs, max_age_s=MAX_COPY_AGE_S) if txs else {"ok": True, "received": 0}
    save_copytrade_state({
        "lastPullAt": datetime.utcnow(), "lastPullWallets": len(wallets), "lastPullSwaps": len(txs),
        "lastPullError": (errors[0] if errors and len(errors) == len(wallets) else None),
    })
    return {"ok": True, "wallets": len(wallets), "swaps": len(txs), "errors": len(errors), "processed": result}

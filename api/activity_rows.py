# Activity-feed rows for the admin account's trades (the `trades` ledger).
# Pure (no database import) so it can be tested.

from typing import Dict, Iterable, List, Optional, Set


def pool_trade_activity(docs: Iterable[Dict], wallet: Optional[str], short: str,
                        skip_ids: Optional[Set[str]] = None) -> List[Dict]:
    """buy/sell rows from the admin `trades` ledger. Rows whose order id is in
    skip_ids (already shown from `user_trades`) are left out."""
    skip = skip_ids or set()
    rows: List[Dict] = []
    for d in docs:
        side = d.get("type")
        if side not in ("buy", "sell"):
            continue
        oid = d.get("swyftxId") or ""
        if oid and oid in skip:
            continue
        ts = d.get("timestamp")
        rows.append({
            "type": side,
            "coin": d.get("coin", ""),
            "amount": d.get("amount", 0),
            "price": d.get("price", 0),
            "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else ts,
            "wallet": wallet,
            "walletShort": short,
            "swyftxId": oid,
            "isAdmin": True,
        })
    return rows

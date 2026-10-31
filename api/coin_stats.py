# ==========================================
# Coin stats for one wallet ("mine") or all wallets ("everyone")
# ==========================================
# Pure functions (no database import) so they can be tested. database.py
# supplies the two ledgers:
#   * the admin account's trades  -> `trades`       (type / amount)
#   * every other wallet's trades -> `user_trades`  (side / quantity)
# Output matches database.get_coin_stats() exactly.

from datetime import datetime
from typing import Callable, Dict, Iterable, List, Optional, Set


def pool_row(d: Dict) -> Dict:
    return {"coin": d["coin"], "side": d.get("type"), "qty": float(d["amount"]),
            "price": float(d["price"]), "ts": d.get("timestamp")}


def user_row(d: Dict) -> Dict:
    return {"coin": d["coin"], "side": d.get("side"), "qty": float(d["quantity"]),
            "price": float(d["price"]), "ts": d.get("timestamp")}


def ledger_rows(scope: str, wallet: Optional[str], admin_wallets: Iterable[str],
                find_pool: Callable[[], Iterable[Dict]],
                find_users: Callable[[Optional[str]], Iterable[Dict]]) -> List[Dict]:
    """"mine": that wallet's own trades (the admin wallet's live in the pool
    ledger, anyone else's in the per-user ledger). "everyone": both ledgers."""
    if scope == "mine":
        if not wallet:
            return []
        if wallet in set(admin_wallets):
            return [pool_row(d) for d in find_pool()]
        return [user_row(d) for d in find_users(wallet)]
    return [pool_row(d) for d in find_pool()] + [user_row(d) for d in find_users(None)]


def coin_stats_from_rows(rows: List[Dict], funding_assets: Set[str]) -> Dict:
    agg: Dict[str, Dict] = {}
    for r in rows:
        a = agg.setdefault(r["coin"], {
            "buys": 0, "sells": 0, "qtyBought": 0.0, "qtySold": 0.0, "spent": 0.0, "received": 0.0,
            "cheapestBuy": None, "dearestBuy": None, "cheapestSell": None, "dearestSell": None,
            "firstTrade": None, "lastTrade": None,
        })
        p, q, ts = r["price"], r["qty"], r["ts"]
        if r["side"] == "buy":
            a["buys"] += 1
            a["qtyBought"] += q
            a["spent"] += q * p
            a["cheapestBuy"] = p if a["cheapestBuy"] is None else min(a["cheapestBuy"], p)
            a["dearestBuy"] = p if a["dearestBuy"] is None else max(a["dearestBuy"], p)
        elif r["side"] == "sell":
            a["sells"] += 1
            a["qtySold"] += q
            a["received"] += q * p
            a["cheapestSell"] = p if a["cheapestSell"] is None else min(a["cheapestSell"], p)
            a["dearestSell"] = p if a["dearestSell"] is None else max(a["dearestSell"], p)
        if isinstance(ts, datetime):
            a["firstTrade"] = ts if a["firstTrade"] is None else min(a["firstTrade"], ts)
            a["lastTrade"] = ts if a["lastTrade"] is None else max(a["lastTrade"], ts)

    coins: List[Dict] = []
    funding: List[Dict] = []
    total_trades = 0
    for coin, a in sorted(agg.items(), key=lambda kv: -kv[1]["spent"]):
        total = a["buys"] + a["sells"]
        total_trades += total
        qty_held = a["qtyBought"] - a["qtySold"]
        avg_cost = (a["spent"] / a["qtyBought"]) if a["qtyBought"] > 0 else 0.0
        realized = (a["received"] - a["qtySold"] * avg_cost) if a["qtyBought"] > 0 else a["received"]
        first_ts, last_ts = a["firstTrade"], a["lastTrade"]
        per_week = 0.0
        if first_ts and last_ts:
            span_days = max((last_ts - first_ts).total_seconds() / 86400.0, 1.0)
            per_week = round(total / span_days * 7, 1)
        entry = {
            "coin": coin, "buys": a["buys"], "sells": a["sells"],
            "qtyBought": a["qtyBought"], "qtySold": a["qtySold"], "qtyHeld": qty_held,
            "spent": round(a["spent"], 2), "received": round(a["received"], 2), "avgCost": avg_cost,
            "cheapestBuy": a["cheapestBuy"], "dearestBuy": a["dearestBuy"],
            "cheapestSell": a["cheapestSell"], "dearestSell": a["dearestSell"],
            "realizedPnL": round(realized, 2), "tradesPerWeek": per_week,
            "firstTrade": first_ts.isoformat() + "Z" if first_ts else None,
            "lastTrade": last_ts.isoformat() + "Z" if last_ts else None,
            "costBasisPartial": (a["qtyBought"] <= 0 and a["sells"] > 0) or (qty_held < -1e-9),
        }
        if str(coin).upper() in funding_assets:
            entry["isFunding"] = True
            funding.append(entry)
        else:
            coins.append(entry)
    return {"generatedAt": datetime.utcnow().isoformat() + "Z", "totalTrades": total_trades,
            "coinCount": len(coins), "coins": coins, "funding": funding}


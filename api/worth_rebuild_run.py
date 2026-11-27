# ==========================================
# Run the worth-history rebuild for ONE wallet (reads Swyftx, writes estimated daily readings)
# ==========================================
# The maths lives in worth_rebuild.py (pure, tested). This file only gathers the ingredients and stores the result:
#   orders         GET /orders/ (every page)                      -> what was bought and sold
#   transfers      Swyftx deposit + withdrawal history            -> coins and cash that arrived / left
#   daily prices   Swyftx's own price chart (AUD), cached in Mongo -> what each coin cost on each day
#   AUD -> USD     the daily exchange rate used elsewhere in the app
# Estimated days are stored next to the real hourly readings with est=True, ONLY for days before the first real reading. The estimate is
# checked against that first real reading and thrown away (with a Telegram note) if it is more than 12% off.

import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import worth_rebuild as wr
import worth_probe as wp

CHART_CHUNK_DAYS = 300
FETCH_SECONDS = 30          # stop collecting prices after this long; the next cron run carries on (prices are cached)


def _ms(ts) -> Optional[int]:
    if not ts:
        return None
    try:
        s = str(ts).replace("Z", "+00:00")
        return int(datetime.fromisoformat(s).timestamp() * 1000)
    except ValueError:
        return None


def chart_series(client, code: str, from_ms: int, to_ms: int) -> Dict[str, float]:
    """{day: AUD close} from Swyftx's daily price chart, fetched in chunks. {} when the coin has no chart."""
    from swyftx_client import SWYFTX_BASE
    out: Dict[str, float] = {}
    start = from_ms
    headers = client._headers()
    while start < to_ms:
        end = min(to_ms, start + CHART_CHUNK_DAYS * wr.DAY_MS)
        url = f"{SWYFTX_BASE}/charts/v2/getBars/AUD/{code}/ask/?resolution=1d&timeStart={start}&timeEnd={end}&limit={CHART_CHUNK_DAYS + 5}"
        reply = client._http_json(url, headers=headers, timeout=10)
        rows = reply.get("candles") if isinstance(reply, dict) else reply
        for r in rows if isinstance(rows, list) else []:
            try:
                if float(r["close"]) > 0:
                    out[wr.day_of(float(r["time"]))] = float(r["close"])
            except (KeyError, TypeError, ValueError):
                continue
        start = end
    return out


def collect_prices(client, codes: List[str], from_ms: int, to_ms: int, cache, deadline: float) -> bool:
    """Fill the daily-price cache for every code. -> True when every code is done (so the caller can go ahead)."""
    complete = True
    for code in codes:
        doc = cache.find_one({"_id": code})
        if doc and doc.get("fromMs", 1 << 62) <= from_ms and doc.get("toMs", 0) >= to_ms - 2 * wr.DAY_MS:
            continue
        if time.time() > deadline:
            complete = False
            continue
        try:
            days = chart_series(client, code, from_ms, to_ms)
        except Exception as e:
            print(f"[worth-rebuild] no chart for {code}: {type(e).__name__}", flush=True)
            days = {}
        cache.replace_one({"_id": code}, {"_id": code, "days": days, "fromMs": from_ms, "toMs": to_ms}, upsert=True)
    return complete


def transfers_from(client, asset_map: Dict[str, str], helpers) -> List[Dict]:
    """[{ts, code, qty}] from Swyftx's deposit / withdrawal history (deposit +, withdrawal -). Unreadable records are skipped."""
    cur_of, ts_of, settled, matches = helpers
    out = []
    for flow, recs in (("deposit", client.get_deposit_history()), ("withdrawal", client.get_withdrawal_history())):
        for rec in recs:
            try:
                if not settled(rec) or not matches(rec, flow):
                    continue
                code, ts = cur_of(rec, asset_map), _ms(ts_of(rec))
                qty = next((abs(float(rec[k])) for k in ("amount", "quantity") if k in rec), 0.0)
                if code and ts and qty > 0:
                    out.append({"ts": ts, "code": code, "qty": qty if flow == "deposit" else -qty})
            except (TypeError, ValueError):
                continue
    return out


def run_for_wallet(label: str, wallet: str, client, holdings: Dict[str, float], send, db, helpers, fx_fetch) -> str:
    """-> "done" | "later" (not finished, try again next run) | "skipped" (nothing to do / not trustworthy). Never raises."""
    try:
        values = db["wallet_value_history"]
        first_real = values.find_one({"wallet": wallet, "est": {"$ne": True}}, sort=[("at", 1)])
        if not first_real:
            return "skipped"
        real_day = first_real["at"].strftime("%Y-%m-%d")
        asset_map = client.get_asset_map()
        started = time.time()

        from swyftx_client import SWYFTX_BASE
        headers = client._headers()
        pages = wp.fetch_pages(lambda path: client._http_json(SWYFTX_BASE + path, headers=headers, timeout=10), max_pages=120)
        orders = wr.parse_orders([r for p in pages for r in p], asset_map, wp.order_time_ms)
        transfers = transfers_from(client, asset_map, helpers)
        stamps = [o["ts"] for o in orders] + [t["ts"] for t in transfers]
        if not stamps:
            return "skipped"
        from_ms = min(stamps) - wr.DAY_MS
        to_ms = wr.day_start_ms(real_day) + 2 * wr.DAY_MS

        codes = sorted({o["coin"] for o in orders} | {t["code"] for t in transfers} | set(holdings))
        codes = [c for c in codes if c not in wr.STABLE and c != "AUD"]
        cache = db["swyftx_daily_prices"]
        if not collect_prices(client, codes, from_ms, to_ms, cache, started + FETCH_SECONDS):
            return "later"
        prices = {c: (cache.find_one({"_id": c}) or {}).get("days") or {} for c in codes}

        fx = fx_fetch(wr.day_of(from_ms))
        r = wr.rebuild(holdings, orders, transfers, prices, fx, real_day)
        est, real = (r["check"] or {}).get("estimated"), float(first_real.get("v") or 0)
        ok = wr.close_enough(est, real)
        head = f"🕰 Worth-history rebuild · {label}\nOrders {len(orders)}, transfers {len(transfers)}, days {len(r['series'])}"
        miss = f"\nNo price for: {', '.join(r['unpriced'][:10])}" if r["unpriced"] else ""
        if not ok or not r["series"]:
            send(f"{head}\nNOT saved: on {real_day} the rebuild says ${est or 0:,.0f} but the real reading was ${real:,.0f}.{miss}")
            return "skipped"
        from pymongo import UpdateOne
        ops = [UpdateOne({"_id": f"{wallet}:est:{d}"}, {"$set": {"wallet": wallet, "at": datetime.strptime(d, "%Y-%m-%d") + timedelta(hours=12), "v": v, "est": True}}, upsert=True)
               for d, v in r["series"].items()]
        for i in range(0, len(ops), 500):
            values.bulk_write(ops[i:i + 500], ordered=False)
        first_day = min(r["series"])
        send(f"{head}\nSaved {first_day} → {real_day}. Check on {real_day}: rebuilt ${est:,.0f} vs real ${real:,.0f}.{miss}")
        return "done"
    except Exception as e:
        print(f"[worth-rebuild] {label} skipped: {type(e).__name__}: {e}", flush=True)
        return "later"


def rebuild_pool_total(db) -> int:
    """POOL = the sum of every wallet's estimated days (days a wallet has no estimate count as 0)."""
    values = db["wallet_value_history"]
    sums: Dict[str, float] = {}
    for d in values.find({"est": True, "wallet": {"$ne": "POOL"}}, {"at": 1, "v": 1}):
        key = d["at"].strftime("%Y-%m-%d")
        sums[key] = sums.get(key, 0.0) + float(d.get("v") or 0)
    first_real = values.find_one({"wallet": "POOL", "est": {"$ne": True}}, sort=[("at", 1)])
    if not first_real:
        return 0
    cutoff = first_real["at"].strftime("%Y-%m-%d")
    from pymongo import UpdateOne
    ops = [UpdateOne({"_id": f"POOL:est:{d}"}, {"$set": {"wallet": "POOL", "at": datetime.strptime(d, "%Y-%m-%d") + timedelta(hours=12), "v": round(v, 2), "est": True}}, upsert=True)
           for d, v in sums.items() if d < cutoff]
    for i in range(0, len(ops), 500):
        values.bulk_write(ops[i:i + 500], ordered=False)
    return len(ops)

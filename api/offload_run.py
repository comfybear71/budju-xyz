# ==========================================
# Offload RUN — the part that places real orders.
# ==========================================
# Flow (always started by the admin, after the read-only preview and a typed
# confirmation):
#   1. start_job   — freeze a plan: every wallet sells the SAME % of each bad coin.
#   2. run_sells   — place the sells, wallet by wallet, in short batches.
#   3. (2 minutes) — Swyftx balances need a moment to settle.
#   4. run_buys    — each wallet splits ITS OWN proceeds evenly across the good coins.
# Every order is saved the moment it is placed, so a timeout or a retry can
# never place the same order twice. Honors the TRADING_ENABLED kill switch.

import os
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional

SELL_CHUNK_USD = 1000.0       # one big sell is sent as several orders of at most this size
BATCH_SECONDS = 35
SETTLE_SECONDS = 120


def _db():
    import database as d
    return d


def _coll():
    d = _db()
    return d.db["offload_jobs"]


def _real_fill(client, est_qty: float, usd: float, est_price: float):
    fill = getattr(client, "last_fill", None)
    if isinstance(fill, dict) and fill.get("qty", 0) > 0:
        q = round(float(fill["qty"]), 8)
        return q, usd / q
    return est_qty, est_price


def _record(wallet: str, coin: str, side: str, qty: float, price: float, order_id: Optional[str]) -> None:
    d = _db()
    try:
        if wallet in d.ADMIN_WALLETS:
            d.record_trade(coin, side, qty, price, d.calculate_pool_allocations(), swyftx_id=order_id)
        else:
            d.record_user_trade(wallet, coin, side, qty, price, 0, order_id, source="offload")
    except Exception as e:
        print(f"[offload] ledger error {wallet[:6]} {coin}: {e}")


def _kill_switch() -> Optional[str]:
    if os.getenv("TRADING_ENABLED", "true").lower() == "false":
        return "Trading is switched off on the server (TRADING_ENABLED=false)"
    return None


def active_job() -> Optional[Dict]:
    return _coll().find_one({"status": "running"})


def start_job(pct: int, bad: Optional[List[str]], targets: Optional[List[str]]) -> Dict:
    msg = _kill_switch()
    if msg:
        return {"ok": False, "error": msg}
    if pct not in (50, 75):
        return {"ok": False, "error": "percent must be 50 or 75"}
    if active_job():
        return {"ok": False, "error": "An offload is already running — resume it instead"}
    d = _db()
    prev = d.get_offload_preview(bad, targets, fresh=True)
    prices = d.get_prices_for_coins(sorted(set(prev["bad"]) | set(prev["targets"])))
    wallets: Dict[str, Dict] = {}
    for w in prev["wallets"]:
        plan = w["scenarios"][str(pct)]
        sells = []
        for s in plan["sells"]:
            price = float(prices.get(s["coin"], 0) or 0)
            if price <= 0:
                continue
            sells.append({"coin": s["coin"], "usd": s["sellUsd"], "qty": round(s["sellUsd"] / price, 8),
                          "price": price, "soldUsd": 0.0, "done": False, "error": None})
        if not sells:
            continue
        wallets[w["wallet"]] = {"short": w["short"], "isAdmin": w["isAdmin"], "status": "sell_pending",
                                "sells": sells, "buys": [], "proceeds": 0.0, "buysReadyAt": 0}
    if not wallets:
        return {"ok": False, "error": "Nothing to sell with these settings"}
    job_id = uuid.uuid4().hex[:12]
    _coll().insert_one({"_id": job_id, "pct": pct, "createdAt": datetime.utcnow(), "status": "running",
                        "bad": prev["bad"], "targets": prev["targets"], "capUsd": prev["capUsd"],
                        "wallets": wallets, "dryRun": os.getenv("DRY_RUN", "false").lower() == "true"})
    return {"ok": True, "jobId": job_id, **summary(job_id)}


def summary(job_id: Optional[str] = None) -> Dict:
    job = _coll().find_one({"_id": job_id}) if job_id else active_job()
    if not job:
        return {"job": None}
    rows = []
    for addr, w in job["wallets"].items():
        rows.append({
            "short": w["short"], "isAdmin": w["isAdmin"], "status": w["status"],
            "sellsDone": sum(1 for s in w["sells"] if s["done"]), "sellsTotal": len(w["sells"]),
            "sellsFailed": [{"coin": s["coin"], "error": s["error"]} for s in w["sells"] if s["error"]],
            "soldUsd": round(sum(s["soldUsd"] for s in w["sells"]), 2),
            "buysDone": sum(1 for b in w["buys"] if b.get("done")), "buysTotal": len(w["buys"]),
            "buysFailed": [{"coin": b["coin"], "error": b["error"]} for b in w["buys"] if b.get("error")],
            "boughtUsd": round(sum(b.get("boughtUsd", 0.0) for b in w["buys"]), 2),
            "buysReadyIn": max(0, int(w["buysReadyAt"] - time.time())) if w["status"] == "sold" else 0,
        })
    return {"job": {"id": job["_id"], "pct": job["pct"], "status": job["status"], "dryRun": job.get("dryRun", False), "wallets": rows}}


def run_sells(job_id: str) -> Dict:
    msg = _kill_switch()
    if msg:
        return {"ok": False, "error": msg}
    d = _db()
    col = _coll()
    job = col.find_one({"_id": job_id})
    if not job or job["status"] != "running":
        return {"ok": False, "error": "No running offload with that id"}
    started = time.time()
    for addr, w in job["wallets"].items():
        if w["status"] != "sell_pending":
            continue
        if job.get("dryRun"):
            col.update_one({"_id": job_id}, {"$set": {f"wallets.{addr}.status": "sold", f"wallets.{addr}.buysReadyAt": time.time()}})
            continue
        try:
            client = d._get_user_swyftx_client(addr)
            code_map = client.get_code_to_id_map()
        except Exception as e:
            col.update_one({"_id": job_id}, {"$set": {f"wallets.{addr}.status": "sold", f"wallets.{addr}.sellError": str(e)[:120]}})
            continue
        all_attempted = True
        for i, s in enumerate(w["sells"]):
            if s["done"] or s["error"]:
                continue
            if time.time() - started > BATCH_SECONDS:
                all_attempted = False
                break
            remaining_usd, remaining_qty, sold = s["usd"], s["qty"], 0.0
            err = None
            while remaining_usd >= 7.0:
                chunk_usd = min(SELL_CHUNK_USD, remaining_usd)
                chunk_qty = round(remaining_qty * chunk_usd / remaining_usd, 8)
                ok, oid, e = client.place_market_order(s["coin"], "sell", chunk_usd, code_map, expected_qty=chunk_qty)
                if not ok:
                    err = str(e)[:120]
                    break
                q, px = _real_fill(client, chunk_qty, chunk_usd, s["price"])
                _record(addr, s["coin"], "sell", q, px, oid)
                sold += q * px
                remaining_usd -= chunk_usd
                remaining_qty -= chunk_qty
            col.update_one({"_id": job_id}, {"$set": {
                f"wallets.{addr}.sells.{i}.soldUsd": round(sold, 2),
                f"wallets.{addr}.sells.{i}.done": err is None,
                f"wallets.{addr}.sells.{i}.error": err,
            }})
        if all_attempted:
            fresh = col.find_one({"_id": job_id})["wallets"][addr]
            proceeds = sum(x["soldUsd"] for x in fresh["sells"]) * 0.99
            buys: List[Dict] = []
            try:
                from offload import plan_buys
                hold = client.get_holdings()
                prices = d.get_prices_for_coins(sorted(set(job["targets"])))
                planned, _ = plan_buys(proceeds, hold, prices, job["bad"], job["targets"], job["capUsd"])
                buys = [{"coin": b["coin"], "usd": b["buyUsd"], "done": False, "error": None, "boughtUsd": 0.0} for b in planned]
            except Exception as e:
                print(f"[offload] buy plan error {addr[:6]}: {e}")
            col.update_one({"_id": job_id}, {"$set": {
                f"wallets.{addr}.status": "sold", f"wallets.{addr}.proceeds": round(proceeds, 2),
                f"wallets.{addr}.buys": buys, f"wallets.{addr}.buysReadyAt": time.time() + SETTLE_SECONDS}})
        if time.time() - started > BATCH_SECONDS:
            break
    return {"ok": True, **summary(job_id)}


def run_buys(job_id: str) -> Dict:
    msg = _kill_switch()
    if msg:
        return {"ok": False, "error": msg}
    d = _db()
    col = _coll()
    job = col.find_one({"_id": job_id})
    if not job or job["status"] != "running":
        return {"ok": False, "error": "No running offload with that id"}
    started = time.time()
    for addr, w in job["wallets"].items():
        if w["status"] != "sold" or time.time() < w["buysReadyAt"]:
            continue
        pending = [(i, b) for i, b in enumerate(w["buys"]) if not b["done"] and not b["error"]]
        if job.get("dryRun") or not pending:
            col.update_one({"_id": job_id}, {"$set": {f"wallets.{addr}.status": "done"}})
            continue
        try:
            client = d._get_user_swyftx_client(addr)
            code_map = client.get_code_to_id_map()
            usdc = float(client.get_holdings().get("USDC", 0.0))
            prices = d.get_prices_for_coins(sorted({b["coin"] for _, b in pending}))
        except Exception as e:
            col.update_one({"_id": job_id}, {"$set": {f"wallets.{addr}.status": "done", f"wallets.{addr}.buyError": str(e)[:120]}})
            continue
        for i, b in pending:
            if time.time() - started > BATCH_SECONDS:
                break
            price = float(prices.get(b["coin"], 0) or 0)
            err = None
            bought = 0.0
            if price <= 0:
                err = "no price"
            elif usdc < b["usd"]:
                err = "USDC not available yet"
            else:
                est_qty = round(b["usd"] / price, 8)
                ok, oid, e = client.place_market_order(b["coin"], "buy", b["usd"], code_map, expected_qty=est_qty)
                if ok:
                    q, px = _real_fill(client, est_qty, b["usd"], price)
                    _record(addr, b["coin"], "buy", q, px, oid)
                    usdc -= b["usd"]
                    bought = b["usd"]
                else:
                    err = str(e)[:120]
            col.update_one({"_id": job_id}, {"$set": {
                f"wallets.{addr}.buys.{i}.done": err is None, f"wallets.{addr}.buys.{i}.error": err,
                f"wallets.{addr}.buys.{i}.boughtUsd": bought}})
        left = col.find_one({"_id": job_id})["wallets"][addr]["buys"]
        if all(x["done"] or x["error"] for x in left):
            col.update_one({"_id": job_id}, {"$set": {f"wallets.{addr}.status": "done"}})
        if time.time() - started > BATCH_SECONDS:
            break

    job = col.find_one({"_id": job_id})
    if all(w["status"] == "done" for w in job["wallets"].values()):
        col.update_one({"_id": job_id}, {"$set": {"status": "finished", "finishedAt": datetime.utcnow()}})
        try:
            import tg_notify
            sold = sum(x["soldUsd"] for w in job["wallets"].values() for x in w["sells"])
            bought = sum(b.get("boughtUsd", 0.0) for w in job["wallets"].values() for b in w["buys"])
            tg_notify.send(f"♻️ <b>BUDJU rebalance finished</b>\nSold {job['pct']}% of {len(job['bad'])} underperforming coins "
                           f"across {len(job['wallets'])} wallets and moved the proceeds into the stronger coins "
                           f"(≈${sold:,.0f} sold, ≈${bought:,.0f} bought).")
        except Exception as e:
            print(f"[offload] telegram error: {e}")
    return {"ok": True, **summary(job_id)}

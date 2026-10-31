# ==========================================
# One-off: correct past trade records to what Swyftx really filled
# ==========================================
# Until the order-lookup fix (2026-10-31) the bot recorded each trade's coin
# quantity as an ESTIMATE (dollars / market price), 1-3% higher than Swyftx's
# real fill. Swyftx is the source of truth, so this re-reads each past order
# from Swyftx (/orders/byId/{id}, each wallet with its OWN key) and rewrites
# the recorded quantity and price.
#
#   GET /api/admin/reconcile-fills?admin_wallet=...            PREVIEW (writes nothing)
#   GET /api/admin/reconcile-fills?admin_wallet=...&apply=1    CORRECT up to 60 orders
#
# Safe to repeat: each corrected/checked order is marked and skipped next time,
# so just re-open the apply link until "remaining" is 0. A value is only
# accepted if Swyftx's "amount" is within 15% of the recorded quantity (so a
# field meaning something else can never be written), and only FILLED orders
# (status 4) are touched. The original recorded value is kept in
# `estimatedQtyBefore`.

from datetime import datetime
from urllib.error import HTTPError

from database import (
    ADMIN_WALLETS,
    decrypt_secret,
    trades_collection,
    user_exchange_keys_collection,
    user_trades_collection,
)
from swyftx_client import SWYFTX_BASE, SwyftxClient, extract_fill_qty

PREVIEW_LIMIT = 30
APPLY_LIMIT = 60
MIN_CHANGE = 0.0005   # ignore differences under 0.05%
SAMPLE_CHANGES = 40


def _lookup(client, order_id):
    return client._http_json(SWYFTX_BASE + f"/orders/byId/{order_id}", headers=client._headers())


def _transient(exc):
    """Worth retrying later (rate limit / server / network), not a final answer."""
    if isinstance(exc, HTTPError):
        return exc.code == 429 or exc.code >= 500
    return True


def _judge(reply, recorded_qty, recorded_price):
    """-> {"skip": reason} or {"qty":..., "price":...} from one Swyftx reply."""
    if not isinstance(reply, dict):
        return {"skip": "unexpected reply"}
    if reply.get("status") != 4:
        return {"skip": f"order status {reply.get('status')} (not filled)"}
    qty = extract_fill_qty(reply, recorded_qty)
    if qty is None:
        return {"skip": "Swyftx amount not comparable to the recorded quantity"}
    price = recorded_price
    try:
        total = float(reply.get("total") or 0)
        if total > 0 and recorded_price and abs(total - recorded_price * recorded_qty) / total < 0.2:
            price = total / qty
    except (TypeError, ValueError):
        pass
    return {"qty": qty, "price": price}


def _pending_pool(limit):
    return list(trades_collection.find(
        {"swyftxId": {"$exists": True, "$nin": [None, ""]}, "fillCheckedAt": {"$exists": False}}
    ).sort("timestamp", -1).limit(limit))


def _pending_user(wallet, limit):
    return list(user_trades_collection.find(
        {"walletAddress": wallet, "orderId": {"$nin": [None, ""]}, "fillCheckedAt": {"$exists": False}}
    ).sort("timestamp", -1).limit(limit))


def _remaining():
    pool = trades_collection.count_documents(
        {"swyftxId": {"$exists": True, "$nin": [None, ""]}, "fillCheckedAt": {"$exists": False}})
    users = user_trades_collection.count_documents(
        {"orderId": {"$nin": [None, ""]}, "fillCheckedAt": {"$exists": False}})
    return pool + users


def run(admin_wallet, apply=False):
    budget = APPLY_LIMIT if apply else PREVIEW_LIMIT
    now = datetime.utcnow()
    stats = {"examined": 0, "changed": 0, "unchanged": 0, "skipped": {}, "retryLater": 0}
    changes = []

    def process(client, doc, kind, wallet_label):
        nonlocal budget
        budget -= 1
        stats["examined"] += 1
        order_id = doc.get("swyftxId") if kind == "pool" else doc.get("orderId")
        qty_field = "amount" if kind == "pool" else "quantity"
        recorded_qty = float(doc.get(qty_field) or 0)
        recorded_price = float(doc.get("price") or 0)
        try:
            verdict = _judge(_lookup(client, order_id), recorded_qty, recorded_price)
        except Exception as e:
            if _transient(e):
                stats["retryLater"] += 1
                return
            verdict = {"skip": f"lookup failed: {getattr(e, 'code', type(e).__name__)}"}

        update = {"fillCheckedAt": now}
        if "skip" in verdict:
            stats["skipped"][verdict["skip"]] = stats["skipped"].get(verdict["skip"], 0) + 1
            update["fillCheckNote"] = verdict["skip"]
        else:
            qty, price = verdict["qty"], verdict["price"]
            diff = (qty - recorded_qty) / recorded_qty if recorded_qty else 0
            update["fillVerified"] = True
            if abs(diff) >= MIN_CHANGE:
                stats["changed"] += 1
                update.update({qty_field: qty, "price": price, "estimatedQtyBefore": recorded_qty})
                if len(changes) < SAMPLE_CHANGES:
                    changes.append({"wallet": wallet_label, "coin": doc.get("coin"),
                                    "side": doc.get("type") or doc.get("side"),
                                    "recorded": round(recorded_qty, 8), "swyftx": round(qty, 8),
                                    "diffPct": round(diff * 100, 2)})
            else:
                stats["unchanged"] += 1
        if apply:
            coll = trades_collection if kind == "pool" else user_trades_collection
            coll.update_one({"_id": doc["_id"]}, {"$set": update})

    # Admin / pool ledger first (the admin wallet's own key).
    admin_key = user_exchange_keys_collection.find_one({"walletAddress": admin_wallet})
    if admin_key and admin_key.get("encryptedApiKey") and budget > 0:
        client = SwyftxClient(decrypt_secret(admin_key["encryptedApiKey"]))
        for doc in _pending_pool(budget):
            if budget <= 0:
                break
            process(client, doc, "pool", "admin")

    # Then every wallet's own ledger, each looked up with its own key.
    for key_doc in user_exchange_keys_collection.find({"encryptedApiKey": {"$exists": True}}):
        if budget <= 0:
            break
        wallet = key_doc["walletAddress"]
        client = SwyftxClient(decrypt_secret(key_doc["encryptedApiKey"]))
        label = "admin" if wallet in ADMIN_WALLETS else f"{wallet[:4]}…{wallet[-4:]}"
        for doc in _pending_user(wallet, budget):
            if budget <= 0:
                break
            process(client, doc, "user", label)

    return {
        "mode": "CORRECTED" if apply else "preview — nothing written",
        **stats,
        "remaining": _remaining(),
        "sampleChanges": changes,
        "next": ("open the same link again until remaining is 0" if apply
                 else "add &apply=1 to correct up to 60 orders per call"),
    }

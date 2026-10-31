# ==========================================
# Read-only: what does Swyftx say about one of OUR OWN past orders?
# ==========================================
# The bot tries to read the real filled quantity from Swyftx's order reply
# (swyftx_client.extract_fill_qty), but the reply's field names aren't
# documented in this repo. This fetches the admin wallet's most recent
# recorded order and shows the raw reply plus every numeric field that is
# close to the quantity we recorded, so the right field can be added.
#
#   GET /api/admin/order-shape?admin_wallet=...
#
# Places nothing and writes nothing.

from database import (
    decrypt_secret,
    trades_collection,
    user_exchange_keys_collection,
)
from urllib.error import HTTPError

from swyftx_client import SWYFTX_BASE, SwyftxClient

NEAR = 0.15  # same tolerance the bot's extractor uses


def _numeric_fields(obj, prefix=""):
    out = {}
    if not isinstance(obj, dict):
        return out
    for k, v in obj.items():
        path = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_numeric_fields(v, path + "."))
        else:
            try:
                out[path] = float(v)
            except (TypeError, ValueError):
                pass
    return out


def _probe(client, path):
    """Try one Swyftx GET; report success or the exact HTTP error."""
    try:
        reply = client._http_json(SWYFTX_BASE + path, headers=client._headers())
        return {"path": path, "ok": True, "reply": reply}
    except HTTPError as e:
        try:
            body = e.read().decode()[:300] if e.fp else ""
        except Exception:
            body = ""
        return {"path": path, "ok": False, "status": e.code, "body": body}
    except Exception as e:
        return {"path": path, "ok": False, "error": f"{type(e).__name__}: {e}"}


def _find_in_history(reply, order_id):
    """The order's entry inside an order-history reply (list, or a dict that
    wraps a list), matched by any string field equal to the order id."""
    rows = reply if isinstance(reply, list) else None
    if rows is None and isinstance(reply, dict):
        rows = next((v for v in reply.values() if isinstance(v, list)), None)
    for row in rows or []:
        if isinstance(row, dict) and any(v == order_id for v in row.values() if isinstance(v, str)):
            return row
    return None


def inspect_last_order(admin_wallet):
    doc = trades_collection.find_one(
        {"swyftxId": {"$exists": True, "$nin": [None, ""]}}, sort=[("timestamp", -1)]
    )
    if not doc:
        return {"error": "No recorded admin order with a Swyftx order id was found."}
    key_doc = user_exchange_keys_collection.find_one({"walletAddress": admin_wallet})
    if not key_doc or not key_doc.get("encryptedApiKey"):
        return {"error": "No Swyftx key on file for the admin wallet."}

    order_id = doc["swyftxId"]
    expected = float(doc.get("amount") or 0)
    client = SwyftxClient(decrypt_secret(key_doc["encryptedApiKey"]))

    probes = []
    best = None  # the reply (or history entry) we analyse
    for path in (f"/orders/{order_id}", f"/orders/{order_id}/",
                 f"/orders/byId/{order_id}", f"/orders/byId/{order_id}/"):
        r = _probe(client, path)
        summary = {"path": path, "ok": r["ok"]}
        if r["ok"]:
            summary["keys"] = sorted(r["reply"].keys()) if isinstance(r["reply"], dict) else None
            if best is None:
                best = ("single-order", path, r["reply"])
        else:
            summary.update({k: r[k] for k in ("status", "body", "error") if k in r})
        probes.append(summary)

    # The order-history list is what the app already reads successfully.
    h = _probe(client, "/orders/?limit=50")
    hist_entry = None
    hsum = {"path": "/orders/?limit=50", "ok": h["ok"]}
    if h["ok"]:
        hist_entry = _find_in_history(h["reply"], order_id)
        hsum["foundOurOrder"] = hist_entry is not None
        if hist_entry is not None and best is None:
            best = ("history-entry", "/orders/?limit=50", hist_entry)
    else:
        hsum.update({k: h[k] for k in ("status", "body", "error") if k in h})
    probes.append(hsum)

    out = {
        "orderId": order_id,
        "recordedCoin": doc.get("coin"),
        "recordedSide": doc.get("type"),
        "recordedQuantity": expected,
        "probes": probes,
    }
    if best is not None:
        source, path, reply = best
        numeric = _numeric_fields(reply)
        near = {}
        if expected > 0:
            near = {k: v for k, v in numeric.items() if v > 0 and abs(v - expected) / expected <= NEAR}
        out.update({
            "useThisSource": source,
            "usePath": path,
            "replyKeys": sorted(reply.keys()) if isinstance(reply, dict) else None,
            "fieldsCloseToRecordedQuantity": near,
            "reply": reply,
        })
    else:
        out["error"] = "None of the lookups returned our order."
    return out

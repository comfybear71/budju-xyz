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
    try:
        reply = client._http_json(SWYFTX_BASE + f"/orders/{order_id}/", headers=client._headers())
    except Exception as e:
        return {"orderId": order_id, "error": f"Swyftx order lookup failed: {type(e).__name__}: {e}"}

    numeric = _numeric_fields(reply)
    near = {}
    if expected > 0:
        near = {k: v for k, v in numeric.items() if v > 0 and abs(v - expected) / expected <= NEAR}
    return {
        "orderId": order_id,
        "recordedCoin": doc.get("coin"),
        "recordedSide": doc.get("type"),
        "recordedQuantity": expected,
        "swyftxReplyKeys": sorted(reply.keys()) if isinstance(reply, dict) else None,
        "fieldsCloseToRecordedQuantity": near,
        "swyftxReply": reply,
    }

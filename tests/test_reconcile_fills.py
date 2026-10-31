"""One-off correction of past trade records to Swyftx's real fills."""

import importlib.util
import os
import sys
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

ADMIN = "ADMINWALLET1111"
USER = "USERWALLET22222"


class Cursor(list):
    def sort(self, *a, **k):
        return self

    def limit(self, n):
        return Cursor(self[:n])


def coll(docs):
    c = MagicMock()
    c.find.return_value = Cursor(docs)
    c.count_documents.return_value = len(docs)
    return c


def reply(amount, status=4, total="33.78"):
    return {"orderUuid": "x", "status": status, "amount": str(amount), "total": total, "rate": "0.77"}


@pytest.fixture
def env():
    pool = [{"_id": 1, "swyftxId": "ord_pool", "coin": "NEXO", "type": "buy", "amount": 44.4585, "price": 0.76}]
    users = [{"_id": 2, "walletAddress": USER, "orderId": "ord_user", "coin": "BTC", "side": "buy",
              "quantity": 0.000130, "price": 76933.0}]
    db = MagicMock()
    db.ADMIN_WALLETS = [ADMIN]
    db.decrypt_secret = lambda x: x
    db.trades_collection = coll(pool)
    db.user_trades_collection = coll(users)
    # like the real collection: only this wallet's trades
    db.user_trades_collection.find.side_effect = lambda q, *a, **k: Cursor(
        [d for d in users if d["walletAddress"] == q.get("walletAddress")])
    db.user_exchange_keys_collection.find_one.return_value = {"walletAddress": ADMIN, "encryptedApiKey": "ka"}
    db.user_exchange_keys_collection.find.return_value = [
        {"walletAddress": ADMIN, "encryptedApiKey": "ka"}, {"walletAddress": USER, "encryptedApiKey": "ku"}]
    sw = MagicMock()
    sw.SWYFTX_BASE = "https://x"
    from swyftx_client import extract_fill_qty  # real extractor
    sw.extract_fill_qty = extract_fill_qty
    client = MagicMock()
    client._headers.return_value = {}
    sw.SwyftxClient = MagicMock(return_value=client)
    with patch.dict("sys.modules", {"database": db, "swyftx_client": sw}):
        spec = importlib.util.spec_from_file_location(
            "reconcile_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "reconcile_fills.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        yield m, db, client


def lookup_table(client, table):
    def fake(url, headers=None, **kw):
        for oid, result in table.items():
            if url.endswith("/orders/byId/" + oid):
                if isinstance(result, Exception):
                    raise result
                return result
        raise HTTPError(url, 400, "Bad", {}, None)
    client._http_json.side_effect = fake


def test_preview_reports_changes_but_writes_nothing(env):
    m, db, client = env
    lookup_table(client, {"ord_pool": reply("43.1865"), "ord_user": reply("0.0001275", total="9.80")})
    out = m.run(ADMIN, apply=False)
    assert out["changed"] == 2 and out["examined"] == 2
    assert out["sampleChanges"][0]["swyftx"] == pytest.approx(43.1865)
    db.trades_collection.update_one.assert_not_called()
    db.user_trades_collection.update_one.assert_not_called()


def test_apply_rewrites_quantity_and_price_and_marks_checked(env):
    m, db, client = env
    lookup_table(client, {"ord_pool": reply("43.1865", total="33.78"), "ord_user": reply("0.0001275", total="9.8083")})
    m.run(ADMIN, apply=True)

    pool_set = db.trades_collection.update_one.call_args[0][1]["$set"]
    assert pool_set["amount"] == pytest.approx(43.1865)
    assert pool_set["estimatedQtyBefore"] == pytest.approx(44.4585)
    assert pool_set["fillVerified"] is True and "fillCheckedAt" in pool_set
    assert pool_set["price"] == pytest.approx(33.78 / 43.1865)

    user_set = db.user_trades_collection.update_one.call_args[0][1]["$set"]
    assert user_set["quantity"] == pytest.approx(0.0001275)
    assert user_set["estimatedQtyBefore"] == pytest.approx(0.000130)


def test_amount_not_comparable_is_skipped_and_never_written(env):
    m, db, client = env
    # e.g. a sell where "amount" is the USDC received, not the coin quantity
    lookup_table(client, {"ord_pool": reply("30.0"), "ord_user": reply("0.000130")})
    out = m.run(ADMIN, apply=True)
    set_pool = db.trades_collection.update_one.call_args[0][1]["$set"]
    assert "amount" not in set_pool and "fillCheckNote" in set_pool
    assert any("not comparable" in k for k in out["skipped"])


def test_unfilled_order_is_not_touched(env):
    m, db, client = env
    lookup_table(client, {"ord_pool": reply("43.1865", status=7), "ord_user": reply("0.000130", status=6)})
    out = m.run(ADMIN, apply=True)
    assert out["changed"] == 0
    assert all("not filled" in k for k in out["skipped"])


def test_rate_limit_is_retried_later_not_marked(env):
    m, db, client = env
    lookup_table(client, {"ord_pool": HTTPError("u", 429, "Too Many", {}, None), "ord_user": reply("0.0001275")})
    out = m.run(ADMIN, apply=True)
    assert out["retryLater"] == 1
    db.trades_collection.update_one.assert_not_called()     # pool order left unmarked for next time


def test_tiny_differences_are_left_alone_but_marked_verified(env):
    m, db, client = env
    lookup_table(client, {"ord_pool": reply("44.4585"), "ord_user": reply("0.000130")})
    out = m.run(ADMIN, apply=True)
    assert out["changed"] == 0 and out["unchanged"] == 2
    assert db.trades_collection.update_one.call_args[0][1]["$set"]["fillVerified"] is True


def test_limit_caps_how_many_orders_are_examined(env):
    m, db, client = env
    lookup_table(client, {"ord_pool": reply("43.1865"), "ord_user": reply("0.0001275")})
    assert m.run(ADMIN, apply=False, limit=1)["examined"] == 1


def test_limit_is_capped_at_the_maximum(env):
    m, _, _ = env
    assert m.MAX_LIMIT == 300 and m.APPLY_LIMIT == 150


def test_time_limit_stops_the_call_early_without_marking_anything(env):
    m, db, client = env
    lookup_table(client, {"ord_pool": reply("43.1865"), "ord_user": reply("0.0001275")})
    m.TIME_BUDGET_S = -1            # deadline already passed
    out = m.run(ADMIN, apply=True)
    assert out["stoppedAtTimeLimit"] is True and out["examined"] == 0
    db.trades_collection.update_one.assert_not_called()
    db.user_trades_collection.update_one.assert_not_called()


def test_parallel_lookups_still_commit_every_order(env):
    m, db, client = env
    lookup_table(client, {"ord_pool": reply("43.1865"), "ord_user": reply("0.0001275", total="9.8")})
    out = m.run(ADMIN, apply=True)
    assert out["examined"] == 2 and out["stoppedAtTimeLimit"] is False
    assert db.trades_collection.update_one.call_count == 1
    assert db.user_trades_collection.update_one.call_count == 1

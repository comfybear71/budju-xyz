"""Read-only inspector for Swyftx's order reply (api/order_shape.py): tries
every plausible lookup and reports what each returns."""

import importlib.util
import os
import sys
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

ORDER_ID = "ord_ABC123"


def http_400():
    return HTTPError("https://x", 400, "Bad Request", {}, None)


@pytest.fixture
def mod():
    db = MagicMock()
    db.decrypt_secret = lambda x: x
    db.trades_collection.find_one.return_value = {"swyftxId": ORDER_ID, "coin": "RENDER", "type": "buy", "amount": 35.5}
    db.user_exchange_keys_collection.find_one.return_value = {"encryptedApiKey": "k"}
    sw = MagicMock()
    sw.SWYFTX_BASE = "https://x"
    client = MagicMock()
    client._headers.return_value = {}
    sw.SwyftxClient = MagicMock(return_value=client)
    with patch.dict("sys.modules", {"database": db, "swyftx_client": sw}):
        spec = importlib.util.spec_from_file_location(
            "order_shape_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "order_shape.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        yield m, db, client


def routes(client, table):
    """table: {path-suffix: reply or Exception}; anything else -> 400."""
    def fake(url, headers=None, **kw):
        path = url.replace("https://x", "")
        for suffix, result in table.items():
            if path == suffix:
                if isinstance(result, Exception):
                    raise result
                return result
        raise http_400()
    client._http_json.side_effect = fake


def test_single_order_lookup_that_works_is_used(mod):
    m, _, client = mod
    routes(client, {f"/orders/byId/{ORDER_ID}": {"status": 4, "amount": 34.9, "total": 54.32, "rate": 1.55}})
    out = m.inspect_last_order("ADMIN")
    assert out["useThisSource"] == "single-order" and out["usePath"] == f"/orders/byId/{ORDER_ID}"
    assert set(out["fieldsCloseToRecordedQuantity"]) == {"amount"}       # not total / rate / status
    failed = [p for p in out["probes"] if not p["ok"]]
    assert all(p["status"] == 400 for p in failed if p["path"].startswith("/orders/ord"))


def test_falls_back_to_the_history_list_and_finds_our_order(mod):
    m, _, client = mod
    history = [{"orderUuid": "other", "amount": 1}, {"orderUuid": ORDER_ID, "amount": 34.9, "status": 4}]
    routes(client, {"/orders/?limit=50": history})
    out = m.inspect_last_order("ADMIN")
    assert out["useThisSource"] == "history-entry"
    assert out["fieldsCloseToRecordedQuantity"] == {"amount": 34.9}


def test_history_wrapped_in_a_dict_is_handled(mod):
    m, _, client = mod
    routes(client, {"/orders/?limit=50": {"orders": [{"uuid": ORDER_ID, "filled": 35.0}]}})
    assert m.inspect_last_order("ADMIN")["fieldsCloseToRecordedQuantity"] == {"filled": 35.0}


def test_nothing_works_reports_every_probe_and_an_error(mod):
    m, _, client = mod
    routes(client, {})
    out = m.inspect_last_order("ADMIN")
    assert "None of the lookups" in out["error"]
    assert len(out["probes"]) == 5 and not any(p["ok"] for p in out["probes"])


def test_no_recorded_order(mod):
    m, db, _ = mod
    db.trades_collection.find_one.return_value = None
    assert "error" in m.inspect_last_order("ADMIN")

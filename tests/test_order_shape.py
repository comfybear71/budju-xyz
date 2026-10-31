"""Read-only inspector for Swyftx's order reply (api/order_shape.py)."""

import importlib.util
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


@pytest.fixture
def mod():
    db = MagicMock()
    db.decrypt_secret = lambda x: x
    db.trades_collection.find_one.return_value = {"swyftxId": "ord-9", "coin": "RENDER", "type": "buy", "amount": 35.5}
    db.user_exchange_keys_collection.find_one.return_value = {"encryptedApiKey": "k"}
    sw = MagicMock()
    sw.SWYFTX_BASE = "https://x"
    client = MagicMock()
    client._headers.return_value = {}
    client._http_json.return_value = {"status": 4, "amount": 34.9, "total": 54.32, "rate": 1.55, "order": {"filled": 34.95}}
    sw.SwyftxClient = MagicMock(return_value=client)
    with patch.dict("sys.modules", {"database": db, "swyftx_client": sw}):
        spec = importlib.util.spec_from_file_location(
            "order_shape_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "order_shape.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        yield m, db, client


def test_reports_fields_close_to_recorded_quantity(mod):
    m, _, _ = mod
    out = m.inspect_last_order("ADMIN")
    assert out["orderId"] == "ord-9"
    assert set(out["fieldsCloseToRecordedQuantity"]) == {"amount", "order.filled"}   # not total/rate/status
    assert "status" in out["swyftxReplyKeys"]


def test_no_recorded_order(mod):
    m, db, _ = mod
    db.trades_collection.find_one.return_value = None
    assert "error" in m.inspect_last_order("ADMIN")


def test_swyftx_failure_is_reported_not_raised(mod):
    m, _, client = mod
    client._http_json.side_effect = RuntimeError("boom")
    assert "lookup failed" in m.inspect_last_order("ADMIN")["error"]

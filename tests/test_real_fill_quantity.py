"""Orders are recorded with the quantity Swyftx actually filled (not the
dollars/price estimate), but only when the reply value passes a sanity check."""

import importlib.util
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
import swyftx_client  # noqa: E402
from swyftx_client import SwyftxClient, extract_fill_qty  # noqa: E402


class TestExtractFillQty:
    def test_top_level_amount_close_to_estimate(self):
        assert extract_fill_qty({"status": 4, "amount": "34.956"}, 35.5011) == pytest.approx(34.956)

    def test_nested_under_order(self):
        assert extract_fill_qty({"order": {"amount": 12.249}}, 12.4565) == pytest.approx(12.249)

    def test_value_far_from_estimate_is_rejected(self):
        # e.g. a USD total or a fee sitting in "amount" — must never be used
        assert extract_fill_qty({"amount": 54.32}, 35.5011) is None

    def test_missing_or_garbage_returns_none(self):
        assert extract_fill_qty({"status": 4}, 10) is None
        assert extract_fill_qty({"amount": "abc"}, 10) is None
        assert extract_fill_qty(None, 10) is None
        assert extract_fill_qty({"amount": 5}, 0) is None


class TestPlaceMarketOrderFill:
    def _client(self, verify_reply):
        c = SwyftxClient("key")
        c._headers = lambda: {}
        replies = [{"orderUuid": "ord-1"}, verify_reply]
        c._http_json = MagicMock(side_effect=replies)
        return c

    def test_real_fill_is_stored(self):
        c = self._client({"status": 4, "amount": "34.956"})
        with patch.object(swyftx_client.time, "sleep"):
            ok, oid, err = c.place_market_order("RENDER", "buy", 54.32, {"USDC": "1", "RENDER": "2"}, expected_qty=35.5011)
        assert ok and oid == "ord-1"
        assert c.last_fill == {"qty": pytest.approx(34.956), "source": "swyftx"}

    def test_uses_the_by_id_lookup_address(self):
        """Swyftx rejects /orders/{id}/ with HTTP 400; the single-order
        lookup is /orders/byId/{id} (confirmed live 2026-10-31)."""
        c = self._client({"status": 4, "amount": "34.956"})
        with patch.object(swyftx_client.time, "sleep"):
            c.place_market_order("RENDER", "buy", 54.32, {"USDC": "1", "RENDER": "2"}, expected_qty=35.5011)
        lookup_url = c._http_json.call_args_list[1][0][0]
        assert lookup_url.endswith("/orders/byId/ord-1")

    def test_real_swyftx_reply_shape_string_amount_is_read(self):
        reply = {"orderUuid": "ord-1", "status": 4, "quantity": "33.78", "total": "33.78",
                 "amount": "43.186494402518897638", "rate": "0.7775", "feeAmount": "0.2607"}
        assert extract_fill_qty(reply, 44.4585) == pytest.approx(43.1865, rel=1e-4)

    def test_rejected_order_is_reported_as_failure(self):
        c = self._client({"status": 7})
        with patch.object(swyftx_client.time, "sleep"):
            ok, _, err = c.place_market_order("RENDER", "buy", 54.32, {"USDC": "1", "RENDER": "2"}, expected_qty=35.5)
        assert ok is False and "rejected" in err

    def test_unreadable_reply_leaves_last_fill_none_and_still_succeeds(self):
        c = self._client({"status": 4})
        with patch.object(swyftx_client.time, "sleep"):
            ok, _, _ = c.place_market_order("RENDER", "buy", 54.32, {"USDC": "1", "RENDER": "2"}, expected_qty=35.5011)
        assert ok and c.last_fill is None

    def test_last_fill_resets_between_orders(self):
        c = self._client({"status": 4, "amount": 34.956})
        with patch.object(swyftx_client.time, "sleep"):
            c.place_market_order("RENDER", "buy", 54.32, {"USDC": "1", "RENDER": "2"}, expected_qty=35.5011)
            c.place_market_order("RENDER", "buy", 5.0, {"USDC": "1", "RENDER": "2"})  # below $7 -> early return
        assert c.last_fill is None


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.ADMIN_WALLETS = ["ADMIN"]
    db.get_prices_for_coins = MagicMock(return_value={"BTC": 60000})
    db.get_coin_stats = MagicMock(return_value={"coins": []})
    db.decrypt_secret = MagicMock(return_value="k")
    db.get_trader_state = MagicMock(return_value={
        "autoActive": {"isActive": True, "tierActive": {"1": True},
                       "targets": {"BTC:1": {"buy": 65000, "sell": 90000, "setAt": int(time.time() * 1000)}}},
        "autoTierAssignments": {"BTC": [1]},
        "autoTiers": {"tier1": {"deviation": 5, "sellDeviation": 12.5, "allocation": 5, "cooldownHours": 12}},
        "autoCooldowns": {}, "autoTradeLog": [],
    })
    db.user_exchange_keys_collection.find.return_value = [
        {"walletAddress": "ADMIN", "status": "active", "autoTradeEnabled": True, "encryptedApiKey": "x"}]
    with patch.dict("sys.modules", {"database": db}):
        yield db


def test_cron_records_real_fill_in_ledger_and_trade_dict(mock_db):
    spec = importlib.util.spec_from_file_location(
        "cron_real_fill_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "auto-trade-cron.py"))
    cron = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cron)

    client = MagicMock()
    client.get_holdings.return_value = {"USDC": 1000.0}
    client.get_code_to_id_map.return_value = {"USDC": "1", "BTC": "2"}
    client.place_market_order.return_value = (True, "o1", None)
    est = 50.0 / 60000  # $50 buy at $60,000
    client.last_fill = {"qty": est * 0.98, "source": "swyftx"}
    cron.SwyftxClient = MagicMock(return_value=client)
    sent = []
    cron.send_telegram = lambda text: sent.append(text)

    result = cron.run_auto_trade_check()

    trade = result["results"][0]["trades"][0]
    assert trade["qty"] == pytest.approx(est * 0.98, rel=1e-4)
    assert trade["price"] == pytest.approx(60000 / 0.98, rel=1e-4)   # true effective price
    assert client.place_market_order.call_args.kwargs["expected_qty"] == pytest.approx(est, rel=1e-4)
    ledger_call = mock_db.record_trade.call_args
    assert ledger_call[0][2] == pytest.approx(est * 0.98, rel=1e-4)


def test_cron_falls_back_to_estimate_when_no_fill_info(mock_db):
    spec = importlib.util.spec_from_file_location(
        "cron_real_fill_fallback_test", os.path.join(os.path.dirname(__file__), "..", "api", "auto-trade-cron.py"))
    cron = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cron)

    client = MagicMock()
    client.get_holdings.return_value = {"USDC": 1000.0}
    client.get_code_to_id_map.return_value = {"USDC": "1", "BTC": "2"}
    client.place_market_order.return_value = (True, "o1", None)
    client.last_fill = None
    cron.SwyftxClient = MagicMock(return_value=client)
    cron.send_telegram = lambda text: None

    trade = cron.run_auto_trade_check()["results"][0]["trades"][0]

    assert trade["qty"] == pytest.approx(50.0 / 60000, rel=1e-4)
    assert trade["price"] == pytest.approx(60000.0)

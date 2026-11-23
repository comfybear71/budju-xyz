"""Swyftx refuses to size some assets in USDC ("Unable to limit on this asset. Use other asset as limit"). The client then retries once
sized in the coin, as Swyftx's own guidance says for those assets."""
import io
import os
import sys
from unittest.mock import MagicMock
from urllib.error import HTTPError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from swyftx_client import SwyftxClient  # noqa: E402

IDS = {"USDC": "36", "DRV": "777"}


def _client(responses):
    c = SwyftxClient.__new__(SwyftxClient)            # no network, no keys
    calls = []

    def fake(url, method="GET", body=None, headers=None):
        calls.append((url, body))
        r = responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    c._http_json = fake
    c._headers = lambda: {}
    return c, calls


def _refusal(msg="Unable to limit on this asset. Use other asset as limit"):
    return HTTPError("https://api.swyftx.com.au/orders/", 400, "Bad Request", {}, io.BytesIO(('{"error":{"error":"AssetError","message":"%s"}}' % msg).encode()))


def test_a_usdc_sized_sell_refused_for_the_asset_is_retried_sized_in_the_coin():
    c, calls = _client([_refusal(), {"orderUuid": "abc"}, {"status": 4}])
    ok, order_id, err = c.place_market_order("DRV", "sell", 30.0, IDS, expected_qty=83.0379)
    assert ok and order_id == "abc" and err is None
    first, second = calls[0][1], calls[1][1]
    assert first["assetQuantity"] == "36" and first["quantity"] == "30.0"                # USDC first, as always
    assert second["assetQuantity"] == "777" and second["quantity"] == "83.0379"          # then sized in DRV
    assert second["orderType"] == 2 and second["primary"] == "36" and second["secondary"] == "777"


def test_other_refusals_are_not_retried_and_a_refused_retry_is_reported():
    c, calls = _client([_refusal("Insufficient balance")])
    ok, _, err = c.place_market_order("DRV", "sell", 30.0, IDS, expected_qty=83.0)
    assert not ok and "Insufficient balance" in err and len(calls) == 1
    c2, calls2 = _client([_refusal(), _refusal("Order below minimum")])
    ok2, _, err2 = c2.place_market_order("DRV", "sell", 30.0, IDS, expected_qty=83.0)
    assert not ok2 and "Order below minimum" in err2 and len(calls2) == 2                # tried once more, then gave up


def test_without_an_expected_quantity_there_is_nothing_to_size_the_retry_with():
    c, calls = _client([_refusal()])
    ok, _, err = c.place_market_order("DRV", "sell", 30.0, IDS)
    assert not ok and "Unable to limit" in err and len(calls) == 1


def test_a_normal_order_is_untouched():
    c, calls = _client([{"orderUuid": "x"}, {"status": 4}])
    ok, order_id, _ = c.place_market_order("DRV", "buy", 50.0, IDS, expected_qty=100.0)
    assert ok and calls[0][1]["assetQuantity"] == "36" and len(calls) == 2              # the order + the verification lookup

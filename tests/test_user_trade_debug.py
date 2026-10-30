"""Regression test for a 500 introduced in api/user_trade_debug.py on
2026-10-27 alongside the stale-target fix (see test_stale_target_refresh.py).

The staleness check was added as a replacement for the line that assigned
`tgt = targets.get(ck)`, but the replacement accidentally dropped that
assignment entirely -- `tgt` was referenced (`tgt.get("setAt")`) before
ever being assigned in that loop iteration, which raises
"cannot access local variable 'tgt' where it is not associated with a
value" in Python 3.11+. This 500'd /api/admin/user-trade-debug in
production for a few minutes right after deploy. Fixed by restoring the
assignment; this test calls diagnose_user_auto_trade() end-to-end with a
mocked exchange key + live price fetch to make sure it returns a
per-coin breakdown without raising.
"""

import importlib
import os
import sys
import time
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


@pytest.fixture
def mock_database():
    mock_db = MagicMock()
    mock_db.ADMIN_WALLETS = ["AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq"]
    mock_db.decrypt_secret = MagicMock(return_value="fake-api-key")
    mock_db.get_user_bot_position = MagicMock(return_value=0)

    key_doc = {
        "walletAddress": "6qtFybGqanZzNMt6oDNYyzeNrwhVmj826Twkv7X5PQEv",
        "status": "active",
        "autoTradeEnabled": True,
        "encryptedApiKey": "enc",
        "lastError": None,
    }
    mock_db.user_exchange_keys_collection = MagicMock()
    mock_db.user_exchange_keys_collection.find_one = MagicMock(return_value=key_doc)

    mock_db.get_trader_state = MagicMock(return_value={
        "autoActive": {"isActive": True, "tierActive": {"1": True}},
        "autoTiers": {"tier1": {"deviation": 1, "sellDeviation": 2, "allocation": 5}},
        "autoTierAssignments": {"BTC": [1]},
    })
    # Deliberately NO "setAt" key — the exact shape that triggered the bug
    mock_db.get_user_trader_state = MagicMock(return_value={
        "targets": {"BTC:1": {"buy": 50000, "sell": 90000}},
        "cooldowns": {},
        "tradeLog": [],
    })
    mock_db.get_prices_for_coins = MagicMock(return_value={"BTC": 60000})

    with patch.dict("sys.modules", {"database": mock_db}):
        yield mock_db


@pytest.fixture
def mock_swyftx_client():
    mock_mod = MagicMock()

    class FakeClient:
        def __init__(self, api_key):
            pass

        def get_holdings(self):
            return {"USDC": 200.0}

    mock_mod.SwyftxClient = FakeClient
    mock_mod.SwyftxAuthError = Exception
    with patch.dict("sys.modules", {"swyftx_client": mock_mod}):
        yield mock_mod


@pytest.fixture
def debug_module(mock_database, mock_swyftx_client):
    spec = importlib.util.spec_from_file_location(
        "user_trade_debug_test",
        os.path.join(os.path.dirname(__file__), "..", "api", "user_trade_debug.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestDiagnoseUserAutoTrade:
    def test_does_not_raise_when_target_has_no_setat(self, debug_module):
        """Must not 500 on legacy target data that predates the setAt
        staleness field -- this is the exact shape that broke in prod."""
        result = debug_module.diagnose_user_auto_trade(
            "6qtFybGqanZzNMt6oDNYyzeNrwhVmj826Twkv7X5PQEv"
        )

        assert "reason" not in result or not result.get("reason")
        assert result["isPool"] is False
        assert "perCoin" in result
        entry = result["perCoin"][0]
        assert entry["coin"] == "BTC"
        assert entry["targetWasStale"] is True
        assert entry["buyTarget"] is not None


class TestDiagnoseAdminPoolWallet:
    """Since the 2026-10-29 bot consolidation, the admin's own pooled
    Swyftx account is no longer special-cased out of this diagnostic --
    it goes through the exact same per-wallet gates as everyone else,
    sourcing its targets/cooldowns/trade log from the shared trader_state
    document and its avg-cost/position from get_coin_stats()/holdings
    instead of the per-user ledger."""

    def test_admin_wallet_is_diagnosed_not_excluded(self, mock_database, mock_swyftx_client):
        admin_wallet = "AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq"
        mock_database.user_exchange_keys_collection.find_one = MagicMock(return_value={
            "walletAddress": admin_wallet,
            "status": "active",
            "autoTradeEnabled": True,
            "encryptedApiKey": "enc",
            "lastError": None,
        })
        mock_database.get_trader_state = MagicMock(return_value={
            "autoActive": {
                "isActive": True,
                "tierActive": {"1": True},
                "targets": {"BTC:1": {"buy": 50000, "sell": 90000}},
            },
            "autoTiers": {"tier1": {"deviation": 1, "sellDeviation": 2, "allocation": 5}},
            "autoTierAssignments": {"BTC": [1]},
            "autoCooldowns": {},
            "autoTradeLog": [],
        })
        mock_database.get_coin_stats = MagicMock(return_value={
            "coins": [{"coin": "BTC", "avgCost": 55000}]
        })

        spec = importlib.util.spec_from_file_location(
            "user_trade_debug_pool_test",
            os.path.join(os.path.dirname(__file__), "..", "api", "user_trade_debug.py"),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        result = mod.diagnose_user_auto_trade(admin_wallet)

        assert "reason" not in result or not result.get("reason")
        assert result["isPool"] is True
        assert "perCoin" in result
        assert result["perCoin"][0]["coin"] == "BTC"


class TestTargetsOverride:
    def test_override_is_used_for_signal_without_touching_stored_targets(self, debug_module):
        """Powers the restore preview: simulate with replacement targets."""
        result = debug_module.diagnose_user_auto_trade(
            "6qtFybGqanZzNMt6oDNYyzeNrwhVmj826Twkv7X5PQEv",
            targets_override={"BTC:1": {"buy": 65000, "sell": 90000, "setAt": int(time.time() * 1000)}},  # price is 60000
        )

        entry = result["perCoin"][0]
        assert entry["buyTarget"] == 65000
        assert entry["signal"] == "BUY"

"""Only a real 401/403 may flip a wallet's key to status=invalid in the
auto-trade cron. Rate limits / 5xx used to disable the wallet permanently."""

import importlib.util
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

WALLET = "USERWALLET1234567890FAKE"


class FakeAuthError(Exception):
    pass


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.ADMIN_WALLETS = []
    db.get_trader_state = MagicMock(return_value={
        "autoActive": {"isActive": True, "tierActive": {"1": True}, "targets": {}},
        "autoTierAssignments": {"BTC": [1]},
        "autoTiers": {"tier1": {"deviation": 1, "sellDeviation": 2, "allocation": 5}},
    })
    db.get_prices_for_coins = MagicMock(return_value={"BTC": 60000})
    db.get_coin_stats = MagicMock(return_value={"coins": []})
    db.get_user_trader_state = MagicMock(return_value={"targets": {}, "cooldowns": {}, "tradeLog": []})
    db.decrypt_secret = MagicMock(return_value="key")
    db._is_transient_swyftx_error = lambda e: "HTTP 401" not in str(e) and "HTTP 403" not in str(e)
    db.user_exchange_keys_collection = MagicMock()
    with patch.dict("sys.modules", {"database": db}):
        yield db


@pytest.fixture
def cron(mock_db):
    spec = importlib.util.spec_from_file_location(
        "cron_key_status_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "auto-trade-cron.py")
    )
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.SwyftxAuthError = FakeAuthError
    return m


def _set_wallet(mock_db, status):
    mock_db.user_exchange_keys_collection.find.return_value = [
        {"walletAddress": WALLET, "status": status, "autoTradeEnabled": True, "encryptedApiKey": "x"}
    ]


def _status_updates(mock_db):
    out = []
    for call in mock_db.user_exchange_keys_collection.update_one.call_args_list:
        out.append(call[0][1]["$set"])
    return out


def test_rate_limit_does_not_mark_invalid(cron, mock_db):
    _set_wallet(mock_db, "active")
    cron.SwyftxClient = MagicMock(return_value=MagicMock(get_holdings=MagicMock(side_effect=FakeAuthError("HTTP 429"))))

    cron.run_auto_trade_check()

    sets = _status_updates(mock_db)
    assert sets and all("status" not in s for s in sets)


def test_real_401_marks_invalid(cron, mock_db):
    _set_wallet(mock_db, "active")
    cron.SwyftxClient = MagicMock(return_value=MagicMock(
        get_holdings=MagicMock(side_effect=FakeAuthError("Swyftx auth failed: HTTP 401"))))

    cron.run_auto_trade_check()

    assert any(s.get("status") == "invalid" for s in _status_updates(mock_db))


def test_wrongly_invalid_wallet_is_retried_and_healed(cron, mock_db):
    _set_wallet(mock_db, "invalid")
    cron.SwyftxClient = MagicMock(return_value=MagicMock(get_holdings=MagicMock(return_value={"USDC": 100.0})))

    cron.run_auto_trade_check()

    query = mock_db.user_exchange_keys_collection.find.call_args[0][0]
    assert query["status"] == {"$in": ["active", "invalid"]}
    mock_db._mark_key_valid.assert_called_once_with(WALLET)

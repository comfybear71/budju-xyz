"""Tests for the one-off T1 target restore (api/restore_targets.py)."""

import importlib.util
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.get_trader_state = MagicMock(return_value={
        "autoActive": {"isActive": True, "tierActive": {"1": True}, "targets": {"BTC:1": {"buy": 1, "sell": 2, "setAt": 5}}},
        "autoCooldowns": {},
    })
    db.save_trader_state = MagicMock(return_value={"success": True})
    with patch.dict("sys.modules", {"database": db}):
        yield db


@pytest.fixture
def mod(mock_db):
    spec = importlib.util.spec_from_file_location(
        "restore_targets_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "restore_targets.py")
    )
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class TestApplyRestore:
    def test_writes_all_seven_targets_with_setat(self, mod, mock_db):
        result = mod.apply_restore()

        assert result["applied"] is True
        assert len(result["restored"]) == 7
        saved = mock_db.save_trader_state.call_args[0][0]
        btc = saved["autoActive"]["targets"]["BTC:1"]
        assert btc["buy"] == pytest.approx(78189.5885)
        assert isinstance(btc["setAt"], (int, float))
        assert saved["autoTargetRestoredAt"]

    def test_only_restored_keys_are_sent(self, mod, mock_db):
        mod.apply_restore()
        sent = mock_db.save_trader_state.call_args[0][0]["autoActive"]["targets"]
        assert set(sent) == set(mod.RESTORE_TARGETS)

    def test_skips_key_that_traded_since(self, mod, mock_db):
        future = int(time.time() * 1000) + 3_600_000
        mock_db.get_trader_state.return_value["autoCooldowns"] = {"BTC:1": future}

        result = mod.apply_restore()

        assert result["skippedOnCooldown"] == ["BTC:1"]
        assert "BTC:1" not in mock_db.save_trader_state.call_args[0][0]["autoActive"]["targets"]

    def test_refuses_second_run_without_force(self, mod, mock_db):
        mock_db.get_trader_state.return_value["autoTargetRestoredAt"] = 123

        result = mod.apply_restore()

        assert result["applied"] is False
        mock_db.save_trader_state.assert_not_called()

    def test_force_allows_second_run(self, mod, mock_db):
        mock_db.get_trader_state.return_value["autoTargetRestoredAt"] = 123
        assert mod.apply_restore(force=True)["applied"] is True

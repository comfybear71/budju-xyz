"""Regression test for the stale per-coin $ target bug found 2026-10-27.

A wallet's buy/sell $ price targets are only refreshed when a trade
executes (ratchet) or when a coin-tier pair is evaluated for the very
first time. Before this fix, a target that was generated once — at
whatever price happened to be live back then — stayed frozen forever if
that coin never crossed it again. Confirmed live: a non-custodial wallet
with only one lifetime trade had buy-target distances scattered across
3.4%-15% for coins that all share the SAME admin-configured tier
deviation, proving those targets were set at different historical prices
rather than computed fresh off the current price. A frequently-trading
wallet's targets stay pinned near the live price because every trade
resets them — so the same shared rules produced wildly different
behavior per wallet, purely based on trade frequency.

Fix: stamp every target with a "setAt" timestamp, and treat any target
older than TARGET_STALE_MS as missing — regenerate it off the CURRENT
price exactly like a first-time evaluation. This file tests the pooled
admin cron (api/auto-trade-cron.py); api/user-trade-cron.py's
run_one_wallet() carries the identical fix and is exercised indirectly
via api/user_trade_debug.py's mirrored logic.
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
    mock_db.save_trader_state = MagicMock(return_value={"success": True})
    mock_db.record_trade = MagicMock()
    mock_db.calculate_pool_allocations = MagicMock(return_value={})
    mock_db.get_coin_stats = MagicMock(return_value={"coins": []})
    with patch.dict("sys.modules", {"database": mock_db}):
        yield mock_db


@pytest.fixture
def cron_module(mock_database):
    mod_name = "auto_trade_cron_stale_target_test"
    spec = importlib.util.spec_from_file_location(
        mod_name,
        os.path.join(os.path.dirname(__file__), "..", "api", "auto-trade-cron.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run_with_targets(cron_module, mock_database, targets):
    """Run one cron cycle with BTC priced so it neither buys nor sells
    (holds), and return the targets dict the cron would have saved."""
    mock_database.get_trader_state.return_value = {
        "autoActive": {
            "isActive": True,
            "tierActive": {"1": True},
            "targets": targets,
            "botDeviceId": "",
            "botHeartbeat": 0,
        },
        "autoTierAssignments": {"BTC": [1]},
        "autoTiers": {"tier1": {"deviation": 1, "sellDeviation": 2, "allocation": 5}},
        "autoCooldowns": {},
        "autoTradeLog": [],
    }

    cron_module.fetch_prices = MagicMock(return_value={"BTC": 60000})
    cron_module.fetch_portfolio = MagicMock(return_value=({}, 1000.0))

    saved = {}

    def record_save(state):
        saved.update(state)
        return {"success": True}

    mock_database.save_trader_state.side_effect = record_save

    with patch.object(cron_module, "SWYFTX_API_KEY", "fake-key"):
        cron_module.run_auto_trade_check()

    return saved["autoActive"]["targets"]["BTC:1"]


class TestStaleTargetRefresh:
    def test_target_missing_setat_is_treated_as_stale_and_regenerated(self, cron_module, mock_database):
        """Pre-fix data has no 'setAt' key at all — must be regenerated off
        today's price on the very next run, not left at its old values."""
        old_targets = {"BTC:1": {"buy": 50000, "sell": 200000}}  # no setAt; both sides far from 60000

        new_tgt = _run_with_targets(cron_module, mock_database, old_targets)

        assert new_tgt["buy"] != 50000
        assert new_tgt["sell"] != 200000
        assert new_tgt["buy"] == pytest.approx(60000 * 0.99, rel=1e-6)
        assert new_tgt["sell"] == pytest.approx(60000 * 1.02, rel=1e-6)
        assert isinstance(new_tgt.get("setAt"), (int, float))

    def test_target_older_than_stale_window_is_regenerated(self, cron_module, mock_database):
        now_ms = int(time.time() * 1000)
        old_targets = {
            "BTC:1": {"buy": 50000, "sell": 200000, "setAt": now_ms - 49 * 3_600_000}  # 49h old > 48h window
        }

        new_tgt = _run_with_targets(cron_module, mock_database, old_targets)

        assert new_tgt["buy"] == pytest.approx(60000 * 0.99, rel=1e-6)
        assert new_tgt["sell"] == pytest.approx(60000 * 1.02, rel=1e-6)

    def test_fresh_target_within_stale_window_is_left_untouched(self, cron_module, mock_database):
        """This fix must not disturb targets that were set recently — only
        genuinely stale ones get reset, so normal ratchet behavior (and the
        gap before a real BUY/SELL trigger) is unaffected."""
        now_ms = int(time.time() * 1000)
        fresh_set_at = now_ms - 60_000  # 1 minute ago
        old_targets = {
            "BTC:1": {"buy": 50000, "sell": 200000, "setAt": fresh_set_at}
        }

        new_tgt = _run_with_targets(cron_module, mock_database, old_targets)

        assert new_tgt["buy"] == 50000
        assert new_tgt["sell"] == 200000
        assert new_tgt["setAt"] == fresh_set_at

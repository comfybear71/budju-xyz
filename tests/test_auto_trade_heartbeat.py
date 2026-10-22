"""Regression test for the cron/browser heartbeat race that let both
sides trade concurrently against the same real Swyftx balance on
2026-10-22, blowing straight through the $100 USDC reserve floor.

Root cause: run_auto_trade_check() only wrote botHeartbeat AFTER its
entire buy/sell loop finished placing real orders. A browser's own
ownership check claims its heartbeat up front, before its loop — so if
that check landed mid-cron-run, it read a heartbeat that was still
>5 minutes stale (from the cron's *previous* successful run) and
concluded the cron wasn't active, then started its own concurrent
buy loop. Each loop decremented its own balance snapshot correctly in
isolation, but neither saw the other's spend.

Fix: claim the heartbeat immediately once the cron decides to proceed
(right after the browser_active check), before any Swyftx calls.
"""

import importlib
import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


@pytest.fixture
def mock_database():
    mock_db = MagicMock()
    mock_db.save_trader_state = MagicMock()
    mock_db.record_trade = MagicMock()
    mock_db.calculate_pool_allocations = MagicMock(return_value={})
    mock_db.get_coin_stats = MagicMock(return_value={"coins": []})
    with patch.dict("sys.modules", {"database": mock_db}):
        yield mock_db


@pytest.fixture
def cron_module(mock_database):
    mod_name = "auto_trade_cron_heartbeat_test"
    spec = importlib.util.spec_from_file_location(
        mod_name,
        os.path.join(os.path.dirname(__file__), "..", "api", "auto-trade-cron.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestHeartbeatClaimedBeforeTrading:
    def test_heartbeat_saved_before_portfolio_fetch(self, cron_module, mock_database):
        """The heartbeat write (ownership claim) must happen before the first
        Swyftx call (fetch_portfolio) — not after the trading loop."""
        call_order = []

        mock_database.get_trader_state.return_value = {
            "autoActive": {
                "isActive": True,
                "tierActive": {"1": True},
                "targets": {"BTC:1": {"buy": 50000, "sell": 70000}},
                "botDeviceId": "",
                "botHeartbeat": 0,
            },
            "autoCooldowns": {},
            "autoTradeLog": [],
        }

        def record_save(state):
            if "autoActive" in state and state["autoActive"].get("botHeartbeat"):
                call_order.append("heartbeat_saved")
            return {"success": True}

        mock_database.save_trader_state.side_effect = record_save

        def record_fetch_prices():
            call_order.append("fetch_prices")
            return {"BTC": 60000}

        def record_fetch_portfolio():
            call_order.append("fetch_portfolio")
            raise RuntimeError("stop here — only call order matters")

        cron_module.fetch_prices = record_fetch_prices
        cron_module.fetch_portfolio = record_fetch_portfolio

        with patch.object(cron_module, "SWYFTX_API_KEY", "fake-key"):
            cron_module.run_auto_trade_check()

        assert "heartbeat_saved" in call_order
        assert "fetch_portfolio" in call_order
        assert call_order.index("heartbeat_saved") < call_order.index("fetch_portfolio"), (
            f"Heartbeat must be claimed before any Swyftx call, got order: {call_order}"
        )

    def test_still_skips_when_browser_is_actively_trading(self, cron_module, mock_database):
        """A genuinely fresh browser heartbeat must still make the cron skip
        entirely — this fix must not weaken that existing protection."""
        import time
        now_ms = int(time.time() * 1000)

        mock_database.get_trader_state.return_value = {
            "autoActive": {
                "isActive": True,
                "tierActive": {"1": True},
                "targets": {"BTC:1": {"buy": 50000, "sell": 70000}},
                "botDeviceId": "browser-abc123",
                "botHeartbeat": now_ms - 10_000,  # 10s ago — fresh
            },
            "autoCooldowns": {},
            "autoTradeLog": [],
        }

        cron_module.fetch_portfolio = MagicMock(side_effect=AssertionError("must not be called"))

        with patch.object(cron_module, "SWYFTX_API_KEY", "fake-key"):
            result = cron_module.run_auto_trade_check()

        assert result.get("skipped") is True
        assert result.get("reason") == "Browser is actively trading"
        mock_database.save_trader_state.assert_not_called()

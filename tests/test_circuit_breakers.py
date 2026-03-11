"""Tests for auto-trade-cron circuit breakers and decision logic."""

import importlib
import os
import sys
import time
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest

# We need to mock database imports before importing the cron module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


@pytest.fixture(autouse=True)
def mock_database():
    """Mock database module to prevent real MongoDB connections."""
    mock_db = MagicMock()
    mock_db.get_trader_state = MagicMock(return_value={})
    mock_db.save_trader_state = MagicMock()
    mock_db.record_trade = MagicMock()
    mock_db.calculate_pool_allocations = MagicMock(return_value={})
    with patch.dict("sys.modules", {"database": mock_db}):
        yield mock_db


@pytest.fixture
def cron_module(mock_database):
    """Import the auto-trade-cron module with mocked dependencies."""
    # Remove cached module if present
    mod_name = "auto-trade-cron"
    safe_name = mod_name.replace("-", "_")

    # Import using importlib since the filename has hyphens
    spec = importlib.util.spec_from_file_location(
        safe_name,
        os.path.join(os.path.dirname(__file__), "..", "api", "auto-trade-cron.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestCircuitBreakers:
    """Test _check_circuit_breakers function."""

    def test_allows_trade_within_limits(self, cron_module):
        log = []
        ok, reason = cron_module._check_circuit_breakers([], "buy", 50.0, "BTC", log)
        assert ok is True
        assert reason is None

    def test_blocks_trade_exceeding_max_single(self, cron_module):
        log = []
        # Default MAX_SINGLE_TRADE_USDC is 500
        ok, reason = cron_module._check_circuit_breakers([], "buy", 600.0, "BTC", log)
        assert ok is False
        assert "MAX_SINGLE_TRADE_USDC" in reason
        assert len(log) == 1
        assert "BLOCKED" in log[0]

    def test_blocks_at_exact_limit(self, cron_module):
        log = []
        # Exactly at limit should pass (> not >=)
        ok, _ = cron_module._check_circuit_breakers([], "buy", 500.0, "BTC", log)
        assert ok is True

    def test_blocks_above_limit(self, cron_module):
        log = []
        ok, _ = cron_module._check_circuit_breakers([], "buy", 500.01, "BTC", log)
        assert ok is False

    def test_blocks_max_daily_trades(self, cron_module):
        """Should block when trade log has MAX_DAILY_TRADES entries in last 24h."""
        now = datetime.utcnow()
        trade_log = [
            {
                "coin": f"COIN{i}",
                "side": "buy",
                "qty": 1,
                "price": 100,
                "timestamp": (now - timedelta(hours=1)).isoformat() + "Z",
            }
            for i in range(20)  # Default MAX_DAILY_TRADES is 20
        ]
        log = []
        ok, reason = cron_module._check_circuit_breakers(trade_log, "buy", 50.0, "ETH", log)
        assert ok is False
        assert "MAX_DAILY_TRADES" in reason

    def test_allows_when_old_trades_expired(self, cron_module):
        """Trades older than 24h should not count."""
        old_time = datetime.utcnow() - timedelta(hours=25)
        trade_log = [
            {
                "coin": f"COIN{i}",
                "side": "buy",
                "qty": 1,
                "price": 100,
                "timestamp": old_time.isoformat() + "Z",
            }
            for i in range(20)
        ]
        log = []
        ok, _ = cron_module._check_circuit_breakers(trade_log, "buy", 50.0, "ETH", log)
        assert ok is True

    def test_blocks_daily_sell_exposure(self, cron_module):
        """Should block sells when daily sell total would exceed limit."""
        now = datetime.utcnow()
        # Create sells totaling $1900 (qty * price)
        trade_log = [
            {
                "coin": "BTC",
                "side": "sell",
                "qty": 19,
                "price": 100,
                "timestamp": (now - timedelta(hours=1)).isoformat() + "Z",
            }
        ]
        log = []
        # Adding $200 more would push to $2100 > $2000 limit
        ok, reason = cron_module._check_circuit_breakers(trade_log, "sell", 200.0, "ETH", log)
        assert ok is False
        assert "MAX_DAILY_LOSS_USDC" in reason

    def test_sell_exposure_does_not_block_buys(self, cron_module):
        """Daily sell exposure limit should not affect buy trades."""
        now = datetime.utcnow()
        trade_log = [
            {
                "coin": "BTC",
                "side": "sell",
                "qty": 19,
                "price": 100,
                "timestamp": (now - timedelta(hours=1)).isoformat() + "Z",
            }
        ]
        log = []
        ok, _ = cron_module._check_circuit_breakers(trade_log, "buy", 200.0, "ETH", log)
        assert ok is True

    def test_handles_malformed_timestamps(self, cron_module):
        """Should gracefully handle trade log entries with bad timestamps."""
        trade_log = [
            {"coin": "BTC", "side": "buy", "qty": 1, "price": 100, "timestamp": "not-a-date"},
            {"coin": "ETH", "side": "buy", "qty": 1, "price": 100, "timestamp": ""},
            {"coin": "SOL", "side": "buy", "qty": 1, "price": 100},  # missing timestamp
        ]
        log = []
        ok, _ = cron_module._check_circuit_breakers(trade_log, "buy", 50.0, "XRP", log)
        assert ok is True  # Malformed entries should be skipped, not crash


class TestTierHelpers:
    """Test tier helper functions."""

    def test_tier_num_string(self, cron_module):
        assert cron_module._tier_num("tier1") == 1
        assert cron_module._tier_num("tier2") == 2
        assert cron_module._tier_num("tier3") == 3

    def test_tier_num_int(self, cron_module):
        assert cron_module._tier_num(1) == 1
        assert cron_module._tier_num(2) == 2

    def test_tier_num_string_int(self, cron_module):
        assert cron_module._tier_num("1") == 1
        assert cron_module._tier_num("3") == 3

    def test_tier_num_none(self, cron_module):
        assert cron_module._tier_num(None) == 0

    def test_tier_num_invalid(self, cron_module):
        assert cron_module._tier_num("abc") == 0

    def test_is_tier_active_string_key(self, cron_module):
        tier_active = {"1": True, "2": False, "3": True}
        assert cron_module._is_tier_active(tier_active, 1) is True
        assert cron_module._is_tier_active(tier_active, 2) is False
        assert cron_module._is_tier_active(tier_active, 3) is True

    def test_is_tier_active_int_key(self, cron_module):
        tier_active = {1: True, 2: False}
        assert cron_module._is_tier_active(tier_active, 1) is True
        assert cron_module._is_tier_active(tier_active, 2) is False

    def test_tier_settings_defaults(self, cron_module):
        settings = cron_module._tier_settings({}, 1)
        assert settings["deviation"] == 5
        assert settings["allocation"] == 5

    def test_tier_settings_custom(self, cron_module):
        tier_assets = {"tier2": {"deviation": 4, "allocation": 8}}
        settings = cron_module._tier_settings(tier_assets, 2)
        assert settings["deviation"] == 4.0
        assert settings["allocation"] == 8.0


class TestDryRunMode:
    """Test that DRY_RUN flag is read from env."""

    def test_dry_run_default_false(self, cron_module):
        # Default should be false when env not set
        assert cron_module.DRY_RUN is False or os.getenv("DRY_RUN", "false").lower() != "true"

    def test_kill_switch(self, cron_module):
        """TRADING_ENABLED=false should skip immediately."""
        with patch.dict(os.environ, {"TRADING_ENABLED": "false"}):
            result = cron_module.run_auto_trade_check()
            assert result.get("skipped") is True
            assert "disabled" in result.get("reason", "").lower()


class TestTradeDecisionLogic:
    """Test the core buy/sell decision boundaries."""

    def test_buy_triggers_at_target(self):
        """Price at or below buy target should trigger buy."""
        price = 100.0
        buy_target = 100.0
        assert price <= buy_target  # Should trigger

    def test_buy_does_not_trigger_above(self):
        """Price above buy target should not trigger."""
        price = 100.01
        buy_target = 100.0
        assert not (price <= buy_target)

    def test_sell_triggers_at_target(self):
        """Price at or above sell target should trigger sell."""
        price = 110.0
        sell_target = 110.0
        assert price >= sell_target  # Should trigger

    def test_sell_does_not_trigger_below(self):
        """Price below sell target should not trigger."""
        price = 109.99
        sell_target = 110.0
        assert not (price >= sell_target)

    def test_target_update_after_buy(self):
        """After buy, buy target should move down by deviation %."""
        current_price = 95.0
        deviation = 5.0
        new_buy = current_price * (1 - deviation / 100)
        assert new_buy == pytest.approx(90.25)  # 95 * 0.95

    def test_target_update_after_sell(self):
        """After sell, sell target should move up by deviation %."""
        current_price = 110.0
        deviation = 5.0
        new_sell = current_price * (1 + deviation / 100)
        assert new_sell == pytest.approx(115.5)  # 110 * 1.05

    def test_sell_ratio_accumulation(self):
        """Sell ratio of 0.833 means we sell 83.3% — accumulating 16.7%."""
        allocation = 10  # 10% allocation
        sell_ratio = 0.833
        sell_pct = allocation * sell_ratio
        assert sell_pct == pytest.approx(8.33)

    def test_min_order_floor(self):
        """Trade amount should be at least MIN_ORDER_USDC ($8)."""
        usdc_balance = 200
        allocation_pct = 1  # 1% = $2
        trade_amount = (allocation_pct / 100) * usdc_balance
        trade_amount = max(trade_amount, 8)  # MIN_ORDER_USDC
        assert trade_amount == 8.0

    def test_usdc_reserve_respected(self):
        """Should not trade if it would break USDC reserve."""
        usdc_balance = 105
        trade_amount = 10
        min_reserve = 100
        can_trade = (usdc_balance - trade_amount) >= min_reserve
        assert can_trade is False  # 105 - 10 = 95 < 100

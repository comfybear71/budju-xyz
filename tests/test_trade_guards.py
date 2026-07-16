"""Tests for the debt-payoff-sale trading guards (api/trade_guards.py).

Pure logic — no Swyftx or Mongo needed. Covers:
- MAX_AUD_DEPLOYABLE cap
- REBUY_BLOCKLIST expiry
- Swyftx min-order sell skip
"""
import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from trade_guards import (  # noqa: E402
    DEFAULT_REBUY_BLOCKLIST,
    deployable_amount,
    is_rebuy_blocked,
    sell_below_min,
)


class TestDeployableCap:
    """min(balance, MAX_AUD_DEPLOYABLE) — parked capital never over-deployed."""

    def test_balance_below_cap_uses_balance(self):
        assert deployable_amount(300.0, 500.0) == pytest.approx(300.0)

    def test_balance_above_cap_uses_cap(self):
        # $12,750 sale proceeds sitting in the account must not size buys
        assert deployable_amount(12750.0, 500.0) == pytest.approx(500.0)

    def test_balance_equal_cap(self):
        assert deployable_amount(500.0, 500.0) == pytest.approx(500.0)

    def test_allocation_maths_capped(self):
        # 5% allocation off a huge balance is still sized off the $500 cap
        deployable = deployable_amount(20000.0, 500.0)
        trade_amount = (5.0 / 100) * deployable
        assert trade_amount == pytest.approx(25.0)

    def test_zero_balance(self):
        assert deployable_amount(0.0, 500.0) == pytest.approx(0.0)

    def test_bad_input_is_safe(self):
        assert deployable_amount(None, 500.0) == pytest.approx(0.0)


class TestRebuyBlocklist:
    """{asset: blocked_until_iso} — buys skipped until expiry, then allowed."""

    BL = {"LUNA": "2026-08-30T00:00:00Z", "ENA": "2026-08-30T00:00:00Z"}

    def test_blocked_before_expiry(self):
        now = datetime(2026, 7, 16)
        assert is_rebuy_blocked(self.BL, "LUNA", now) is True

    def test_allowed_after_expiry(self):
        now = datetime(2026, 9, 1)
        assert is_rebuy_blocked(self.BL, "LUNA", now) is False

    def test_not_blocked_at_exact_expiry(self):
        now = datetime(2026, 8, 30)
        assert is_rebuy_blocked(self.BL, "LUNA", now) is False

    def test_coin_not_on_list_allowed(self):
        now = datetime(2026, 7, 16)
        assert is_rebuy_blocked(self.BL, "SOL", now) is False

    def test_empty_blocklist_allows(self):
        assert is_rebuy_blocked({}, "LUNA", datetime(2026, 7, 16)) is False
        assert is_rebuy_blocked(None, "LUNA", datetime(2026, 7, 16)) is False

    def test_malformed_date_allows(self):
        assert is_rebuy_blocked({"LUNA": "not-a-date"}, "LUNA", datetime(2026, 7, 16)) is False

    def test_default_blocklist_has_all_14_coins(self):
        expected = {"LUNA", "ENA", "SUI", "ADA", "BCH", "DOT", "PEPE",
                    "XRP", "NEO", "DOGE", "AVAX", "HBAR", "RENDER", "XAUT"}
        assert set(DEFAULT_REBUY_BLOCKLIST.keys()) == expected

    def test_default_blocklist_blocks_now_but_not_september(self):
        for coin in DEFAULT_REBUY_BLOCKLIST:
            assert is_rebuy_blocked(DEFAULT_REBUY_BLOCKLIST, coin, datetime(2026, 7, 16)) is True
            assert is_rebuy_blocked(DEFAULT_REBUY_BLOCKLIST, coin, datetime(2026, 9, 15)) is False


class TestSellMinOrder:
    """Positions below the Swyftx minimum are skipped (no error loop)."""

    MIN = 30.0

    def test_sliver_below_min_is_skipped(self):
        assert sell_below_min(12.50, self.MIN) is True

    def test_position_above_min_is_sellable(self):
        # remaining $66–190 slivers from the sale are still above $30
        assert sell_below_min(66.0, self.MIN) is False
        assert sell_below_min(190.0, self.MIN) is False

    def test_exactly_min_is_sellable(self):
        assert sell_below_min(30.0, self.MIN) is False

    def test_zero_position_skipped(self):
        assert sell_below_min(0.0, self.MIN) is True

    def test_bad_input_skips_safely(self):
        assert sell_below_min(None, self.MIN) is True

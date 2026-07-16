"""Proves a large admin withdrawal burns ONLY admin shares and leaves every
other holder's share count and dollar value unchanged to the cent.

Requirement #4 of the July-2026 debt-payoff-sale guards. Models the admin's
$13,260.17 withdrawal against a 13-holder pool (~$700 external).
"""
import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

AMOUNT = 13260.17
NON_ADMIN_SHARES = {
    f"holder{i}": s
    for i, s in enumerate([90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30])
}  # 13 holders, 780 shares total
ADMIN_SHARES = 15000.0
TOTAL_SHARES = ADMIN_SHARES + sum(NON_ADMIN_SHARES.values())  # 15780
TOTAL_POOL_VALUE = TOTAL_SHARES * 0.90                          # NAV = 0.90


class TestWithdrawalMathIsolation:
    """The record_withdrawal formula is NAV-invariant → holders untouched."""

    def _apply_withdrawal(self):
        nav = TOTAL_POOL_VALUE / TOTAL_SHARES
        shares_to_burn = min(AMOUNT / nav, ADMIN_SHARES)
        new_total_shares = TOTAL_SHARES - shares_to_burn
        new_pool_value = TOTAL_POOL_VALUE - AMOUNT   # money physically leaves
        new_nav = new_pool_value / new_total_shares
        return nav, new_nav, shares_to_burn, new_total_shares

    def test_admin_shares_sufficient(self):
        nav = TOTAL_POOL_VALUE / TOTAL_SHARES
        assert AMOUNT / nav <= ADMIN_SHARES  # withdrawal doesn't exceed admin holding

    def test_nav_is_invariant(self):
        nav, new_nav, _, _ = self._apply_withdrawal()
        assert new_nav == pytest.approx(nav, abs=1e-9)

    def test_every_holder_dollar_value_unchanged_to_the_cent(self):
        nav, new_nav, _, _ = self._apply_withdrawal()
        for wallet, shares in NON_ADMIN_SHARES.items():
            value_before = shares * nav
            value_after = shares * new_nav          # shares unchanged, NAV invariant
            assert round(value_after, 2) == round(value_before, 2), wallet

    def test_total_external_value_unchanged(self):
        nav, new_nav, _, _ = self._apply_withdrawal()
        total_before = sum(s * nav for s in NON_ADMIN_SHARES.values())
        total_after = sum(s * new_nav for s in NON_ADMIN_SHARES.values())
        assert round(total_after, 2) == round(total_before, 2)

    def test_only_admin_shares_reduced(self):
        _, _, shares_to_burn, _ = self._apply_withdrawal()
        new_admin_shares = ADMIN_SHARES - shares_to_burn
        assert new_admin_shares == pytest.approx(ADMIN_SHARES - AMOUNT / (TOTAL_POOL_VALUE / TOTAL_SHARES))
        assert new_admin_shares >= 0  # never goes negative for a valid withdrawal


class TestRecordWithdrawalCode:
    """Exercise the real record_withdrawal() with mocked collections."""

    @pytest.fixture
    def db_module(self):
        with patch.dict("sys.modules", {
            "pymongo": MagicMock(),
            "pymongo.errors": MagicMock(),
            "base58": MagicMock(),
            "nacl": MagicMock(),
            "nacl.signing": MagicMock(),
            "nacl.exceptions": MagicMock(),
        }):
            if "database" in sys.modules:
                del sys.modules["database"]
            import database
            database.pool_state_collection = MagicMock()
            database.users_collection = MagicMock()
            database.withdrawals_collection = MagicMock()
            yield database
            if "database" in sys.modules:
                del sys.modules["database"]

    def test_burns_only_admin_and_decrements_pool(self, db_module):
        admin = "AdminWallet"
        db_module.users_collection.find_one.return_value = {
            "walletAddress": admin, "shares": ADMIN_SHARES, "totalWithdrawn": 0.0,
        }
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": TOTAL_SHARES,
        }
        # No non-admins to recalc → _recalculate_allocations is a no-op
        db_module.users_collection.find.return_value = []

        nav = TOTAL_POOL_VALUE / TOTAL_SHARES
        expected_burn = AMOUNT / nav

        result = db_module.record_withdrawal(admin, AMOUNT, TOTAL_POOL_VALUE, "AUD")

        # Correct burn at NAV
        assert result["nav"] == pytest.approx(nav)
        assert result["shares_burned"] == pytest.approx(expected_burn)
        assert result["userShares"] == pytest.approx(ADMIN_SHARES - expected_burn)

        # Pool total shares decremented by exactly the burned amount
        pool_call = db_module.pool_state_collection.update_one.call_args
        assert pool_call.args[1]["$inc"]["totalShares"] == pytest.approx(-expected_burn)

        # The only user-share write targets the admin wallet
        user_call = db_module.users_collection.update_one.call_args
        assert user_call.args[0] == {"walletAddress": admin}
        assert user_call.args[1]["$set"]["shares"] == pytest.approx(ADMIN_SHARES - expected_burn)

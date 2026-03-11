"""Tests for pool share math and NAV calculations.

These tests verify the share-based (NAV) accounting logic without
requiring a real MongoDB connection — all DB calls are mocked.
"""

import os
import sys
from unittest.mock import patch, MagicMock
from datetime import datetime

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


# Mock pymongo at the module level BEFORE database.py tries to import it
_mock_pymongo = MagicMock()
_mock_base58 = MagicMock()
_mock_nacl_signing = MagicMock()
_mock_nacl_exceptions = MagicMock()


@pytest.fixture
def db_module():
    """Import database module with fully mocked dependencies."""
    # Patch all external dependencies at the sys.modules level
    with patch.dict("sys.modules", {
        "pymongo": _mock_pymongo,
        "pymongo.errors": MagicMock(),
        "base58": _mock_base58,
        "nacl": MagicMock(),
        "nacl.signing": _mock_nacl_signing,
        "nacl.exceptions": _mock_nacl_exceptions,
    }):
        # Remove cached database module to force reimport
        if "database" in sys.modules:
            del sys.modules["database"]

        import database

        # Set up mock collections with controllable return values
        database.pool_state_collection = MagicMock()
        database.users_collection = MagicMock()
        database.deposits_collection = MagicMock()
        database.withdrawals_collection = MagicMock()
        database.trades_collection = MagicMock()

        yield database

        # Clean up
        if "database" in sys.modules:
            del sys.modules["database"]


class TestNAVCalculation:
    """Test NAV = totalPoolValue / totalShares."""

    def test_nav_basic(self, db_module):
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 1000
        }
        nav = db_module.get_nav(1500.0)
        assert nav == pytest.approx(1.5)

    def test_nav_at_initialization(self, db_module):
        """When pool value = total shares, NAV = $1.00."""
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 5000
        }
        nav = db_module.get_nav(5000.0)
        assert nav == pytest.approx(1.0)

    def test_nav_zero_shares(self, db_module):
        """NAV should default to 1.0 when no shares exist."""
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 0
        }
        nav = db_module.get_nav(1000.0)
        assert nav == pytest.approx(1.0)

    def test_nav_zero_pool_value(self, db_module):
        """NAV should default to 1.0 when pool value is 0."""
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 1000
        }
        nav = db_module.get_nav(0)
        assert nav == pytest.approx(1.0)

    def test_nav_no_pool_doc(self, db_module):
        """NAV should default to 1.0 when pool state doesn't exist."""
        db_module.pool_state_collection.find_one.return_value = None
        nav = db_module.get_nav(1000.0)
        assert nav == pytest.approx(1.0)

    def test_nav_profit_scenario(self, db_module):
        """Pool value up 20% -> NAV = 1.2."""
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 10000
        }
        nav = db_module.get_nav(12000.0)
        assert nav == pytest.approx(1.2)

    def test_nav_loss_scenario(self, db_module):
        """Pool value down 15% -> NAV = 0.85."""
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 10000
        }
        nav = db_module.get_nav(8500.0)
        assert nav == pytest.approx(0.85)


class TestShareIssuance:
    """Test that deposit -> share issuance math is correct."""

    def test_first_deposit_gets_nav_1(self):
        """First depositor gets shares = deposit amount at NAV $1.00."""
        deposit = 500.0
        nav = 1.0
        shares = deposit / nav
        assert shares == pytest.approx(500.0)

    def test_deposit_at_higher_nav(self):
        """Depositing when NAV > 1 gives fewer shares."""
        deposit = 500.0
        nav = 1.25
        shares = deposit / nav
        assert shares == pytest.approx(400.0)

    def test_deposit_at_lower_nav(self):
        """Depositing when NAV < 1 gives more shares (buying the dip)."""
        deposit = 500.0
        nav = 0.80
        shares = deposit / nav
        assert shares == pytest.approx(625.0)

    def test_pre_deposit_nav_calculation(self):
        """NAV should be calculated on pre-deposit pool value."""
        total_pool_value = 11000.0
        deposit_amount = 1000.0
        total_shares = 10000.0

        pre_deposit_value = total_pool_value - deposit_amount
        nav = pre_deposit_value / total_shares
        shares_issued = deposit_amount / nav

        assert nav == pytest.approx(1.0)
        assert shares_issued == pytest.approx(1000.0)

    def test_pre_deposit_nav_with_profit(self):
        """Deposit into profitable pool should use pre-deposit NAV."""
        total_pool_value = 13000.0
        deposit_amount = 1000.0
        total_shares = 10000.0

        pre_deposit_value = total_pool_value - deposit_amount
        nav = pre_deposit_value / total_shares
        shares_issued = deposit_amount / nav

        assert nav == pytest.approx(1.2)
        assert shares_issued == pytest.approx(833.333, rel=1e-3)


class TestUserPosition:
    """Test user position value calculations."""

    def test_position_value(self, db_module):
        db_module.users_collection.find_one.return_value = {
            "walletAddress": "TestWallet",
            "shares": 1000,
            "totalDeposited": 1000,
        }
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 10000
        }
        pos = db_module.get_user_position("TestWallet", 12000.0)
        assert pos["nav"] == pytest.approx(1.2)
        assert pos["currentValue"] == pytest.approx(1200.0)
        assert pos["shares"] == 1000

    def test_position_allocation(self, db_module):
        db_module.users_collection.find_one.return_value = {
            "walletAddress": "TestWallet",
            "shares": 2500,
            "totalDeposited": 2500,
        }
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 10000
        }
        pos = db_module.get_user_position("TestWallet", 10000.0)
        assert pos["allocation"] == pytest.approx(25.0)

    def test_position_unknown_user(self, db_module):
        db_module.users_collection.find_one.return_value = None
        pos = db_module.get_user_position("UnknownWallet", 10000.0)
        assert pos["shares"] == 0
        assert pos["currentValue"] == 0

    def test_pnl_positive(self):
        """User with 20% NAV gain should show positive P&L."""
        deposited = 1000
        shares = 1000
        nav = 1.2
        current_value = shares * nav
        pnl_pct = ((current_value / deposited) - 1) * 100
        assert pnl_pct == pytest.approx(20.0)

    def test_pnl_negative(self):
        """User in loss should show negative P&L."""
        deposited = 1000
        shares = 1000
        nav = 0.85
        current_value = shares * nav
        pnl_pct = ((current_value / deposited) - 1) * 100
        assert pnl_pct == pytest.approx(-15.0)


class TestPoolInitialization:
    """Test pool initialization logic."""

    def test_initialize_sets_nav_to_1(self, db_module):
        db_module.pool_state_collection.find_one.return_value = None
        result = db_module.initialize_pool(5000.0)
        assert result["nav"] == pytest.approx(1.0)
        assert result["totalShares"] == pytest.approx(5000.0)
        assert result["alreadyInitialized"] is False

    def test_initialize_idempotent(self, db_module):
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 5000
        }
        result = db_module.initialize_pool(5000.0)
        assert result["alreadyInitialized"] is True
        assert result["totalShares"] == 5000

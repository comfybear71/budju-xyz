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


class TestDepositNavSanityCheck:
    """Test _resolve_deposit_nav's sanity check against the last NAV snapshot.

    Regression coverage for the 2026-10-22 fairness bug: a self-service
    deposit's "live" pool value silently collapsed to USDC-cash-only (missing
    all crypto holdings), pricing a $5 deposit at a NAV ~140x too low and
    minting ~140x too many shares. A live value must now be sanity-checked
    against the last known-good NAV snapshot before being trusted.
    """

    def test_live_value_within_band_is_trusted(self, db_module):
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "lastNav": 0.83,
        }
        nav, source = db_module._resolve_deposit_nav(14000.0, 16992.0)
        assert source == "live"
        assert nav == pytest.approx(14000.0 / 16992.0)

    def test_degraded_live_value_is_rejected(self, db_module):
        """The real-world bug: pool value computed as cash-only ($101)
        instead of crypto+cash (~$14,000), against a pool whose last known
        NAV was ~$0.83/share. The degraded value must be rejected in favour
        of the snapshot, not used to price the deposit."""
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "lastNav": 0.83,
        }
        nav, source = db_module._resolve_deposit_nav(101.44, 16992.0)
        assert source == "last_snapshot_rejected_live"
        assert nav == pytest.approx(0.83)

    def test_implausibly_high_live_value_is_also_rejected(self, db_module):
        """Sanity check applies symmetrically — a value too far ABOVE the
        last snapshot is just as untrustworthy as one too far below."""
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "lastNav": 0.83,
        }
        nav, source = db_module._resolve_deposit_nav(2_000_000.0, 16992.0)
        assert source == "last_snapshot_rejected_live"
        assert nav == pytest.approx(0.83)

    def test_live_value_accepted_when_no_snapshot_exists(self, db_module):
        """With nothing to sanity-check against yet, a live value is trusted
        as-is (matches pre-existing behaviour for a pool with no history)."""
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "lastNav": None,
        }
        nav, source = db_module._resolve_deposit_nav(101.44, 16992.0)
        assert source == "live"
        assert nav == pytest.approx(101.44 / 16992.0)

    def test_no_live_value_falls_back_to_snapshot(self, db_module):
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "lastNav": 0.83,
        }
        nav, source = db_module._resolve_deposit_nav(0, 16992.0)
        assert source == "last_snapshot"
        assert nav == pytest.approx(0.83)

    def test_no_live_value_and_no_snapshot_raises(self, db_module):
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "lastNav": None,
        }
        with pytest.raises(ValueError):
            db_module._resolve_deposit_nav(0, 16992.0)


class TestRepriceDepositResnapshotsNav:
    """Test that reprice_deposit() repairs pool_state.lastNav, not just shares.

    Regression coverage for a second bug found while fixing the 2026-10-22
    fairness incident: record_deposit() force-snapshots lastNav on every
    deposit (even a bad one), so the original $5 deposit had already poisoned
    pool_state.lastNav to the broken ~$0.006 value. reprice_deposit() fixed
    the user's shares but left that poisoned snapshot in place — meaning the
    very next deposit's sanity check in _resolve_deposit_nav() would compare
    against the broken snapshot, reject the correct live NAV as an outlier,
    and fall back to the broken value, reintroducing the same bug.
    """

    def _setup(self, db_module, total_shares_before):
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": total_shares_before, "lastNav": 0.00597,
        }
        db_module.deposits_collection.find_one.return_value = {
            "txHash": "abc123", "userId": "wallet1",
            "amount": 5.0, "shares": 837.55, "nav": 0.00597, "status": "completed",
        }

    def test_apply_resnapshots_lastnav_to_correct_value(self, db_module):
        """_snapshot_nav must be called with a (pool_value, total_shares) pair
        whose ratio is exactly correct_nav — regardless of how pool_state's
        totalShares happens to mutate in real Mongo between the $inc and the
        resnapshot (a MagicMock doesn't simulate that mutation, so we assert
        on the snapshot call's own internal consistency instead)."""
        self._setup(db_module, total_shares_before=17825.0)
        correct_nav = 0.8295138261750823

        with patch.object(db_module, "_snapshot_nav") as mock_snapshot:
            result = db_module.reprice_deposit("abc123", correct_nav, dry_run=False)

        assert result["applied"] is True
        mock_snapshot.assert_called_once()
        pool_value_arg = mock_snapshot.call_args.args[0]
        new_total_shares = result["totalSharesAfter"]
        assert pool_value_arg / new_total_shares == pytest.approx(correct_nav)
        assert mock_snapshot.call_args.kwargs.get("force") is True

    def test_resnapshot_is_consistent_even_when_shares_already_correct(self, db_module):
        """Re-running the fixed reprice (e.g. to repair a live, already-
        corrected deposit's poisoned snapshot) must be a safe no-op on shares
        — only the snapshot should move."""
        correct_nav = 0.8295138261750823
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": 16998.85, "lastNav": 0.00597,
        }
        db_module.deposits_collection.find_one.return_value = {
            "txHash": "abc123", "userId": "wallet1",
            "amount": 5.0, "shares": 5.0 / correct_nav, "nav": correct_nav,
            "status": "completed",
        }

        with patch.object(db_module, "_snapshot_nav") as mock_snapshot:
            result = db_module.reprice_deposit("abc123", correct_nav, dry_run=False)

        assert result["sharesDelta"] == pytest.approx(0.0, abs=1e-6)
        inc_calls = [
            call for call in db_module.pool_state_collection.update_one.call_args_list
            if "$inc" in call.args[1]
        ]
        assert inc_calls[-1].args[1]["$inc"]["totalShares"] == pytest.approx(0.0, abs=1e-6)
        mock_snapshot.assert_called_once()
        pool_value_arg = mock_snapshot.call_args.args[0]
        assert pool_value_arg / 16998.85 == pytest.approx(correct_nav)


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


class TestCombinedPnl:
    """get_admin_stats() combinedPnl — the WHOLE pool's result (admin capital
    included), not just totalUserDeposited/totalUserValue which deliberately
    exclude admin wallets. Regression coverage for the 2026-10-22 request to
    see "the overall, like dad's profit, combined" with the admin's own.
    """

    def _setup(self, db_module, non_admin_users, admin_users):
        db_module.pool_state_collection.find_one.return_value = {
            "_id": "pool", "totalShares": sum(u["shares"] for u in non_admin_users + admin_users),
        }

        def fake_find(query=None, *args, **kwargs):
            query = query or {}
            if "$nin" in query.get("walletAddress", {}):
                return list(non_admin_users)
            return list(non_admin_users) + list(admin_users)

        db_module.users_collection.find = MagicMock(side_effect=fake_find)
        db_module.users_collection.find_one.return_value = None
        db_module.deposits_collection.find_one.return_value = None
        db_module.deposits_collection.count_documents.return_value = 0
        db_module.withdrawals_collection.count_documents.return_value = 0
        db_module.trades_collection.count_documents.return_value = 0

    def test_combined_pnl_includes_admin_capital(self, db_module):
        """Admin (deposited 18621.60, withdrew 13260.17) + one investor (dad,
        deposited 3400, no withdrawals) — combined P&L must reflect BOTH."""
        non_admin = [{"walletAddress": "dad", "shares": 5433.0, "totalDeposited": 3400.0, "totalWithdrawn": 0.0, "isActive": True}]
        admin = [{"walletAddress": "admin", "shares": 8810.14, "totalDeposited": 18621.60, "totalWithdrawn": 13260.17, "isActive": True}]
        self._setup(db_module, non_admin, admin)

        with patch.object(db_module, "_snapshot_nav"):
            stats = db_module.get_admin_stats(total_pool_value=(5433.0 + 8810.14) * 0.8211)

        combined_deposited = 3400.0 + 18621.60
        combined_withdrawn = 0.0 + 13260.17
        combined_value = (5433.0 + 8810.14) * 0.8211
        expected_pnl = combined_value + combined_withdrawn - combined_deposited

        assert stats["combinedDeposited"] == pytest.approx(combined_deposited, abs=0.01)
        assert stats["combinedWithdrawn"] == pytest.approx(combined_withdrawn, abs=0.01)
        assert stats["combinedPnl"] == pytest.approx(expected_pnl, abs=0.01)
        # totalUserDeposited/totalUserValue (investor-only) must stay admin-exclusive
        assert stats["totalUserDeposited"] == pytest.approx(3400.0, abs=0.01)

    def test_combined_pnl_zero_when_no_deposits(self, db_module):
        self._setup(db_module, [], [])
        with patch.object(db_module, "_snapshot_nav"):
            stats = db_module.get_admin_stats(total_pool_value=0)
        assert stats["combinedPnl"] == 0
        assert stats["combinedPnlPercent"] == 0


class TestPoolNavTimeline:
    """get_pool_nav_timeline() — pool-wide NAV history reconstructed from
    every deposit/withdrawal's own recorded NAV. Powers the public
    "Share Price (NAV) Over Time" chart shown to every visitor."""

    def test_merges_and_sorts_deposits_and_withdrawals(self, db_module):
        dep_find = MagicMock()
        dep_find.sort.return_value = [
            {"timestamp": datetime(2026, 1, 1), "nav": 1.0},
            {"timestamp": datetime(2026, 3, 1), "nav": 0.95},
        ]
        db_module.deposits_collection.find.return_value = dep_find

        wd_find = MagicMock()
        wd_find.sort.return_value = [
            {"timestamp": datetime(2026, 2, 1), "nav": 0.98},
        ]
        db_module.withdrawals_collection.find.return_value = wd_find

        points = db_module.get_pool_nav_timeline()

        assert [p["type"] for p in points] == ["deposit", "withdrawal", "deposit"]
        assert [p["nav"] for p in points] == [1.0, 0.98, 0.95]
        # No wallet identity or dollar amount leaks into the public timeline
        assert all(set(p.keys()) == {"timestamp", "nav", "type"} for p in points)

    def test_skips_points_missing_nav_or_timestamp(self, db_module):
        dep_find = MagicMock()
        dep_find.sort.return_value = [
            {"timestamp": datetime(2026, 1, 1), "nav": 0},
            {"timestamp": None, "nav": 1.0},
            {"timestamp": datetime(2026, 1, 2), "nav": 1.0},
        ]
        db_module.deposits_collection.find.return_value = dep_find
        wd_find = MagicMock()
        wd_find.sort.return_value = []
        db_module.withdrawals_collection.find.return_value = wd_find

        points = db_module.get_pool_nav_timeline()
        assert len(points) == 1
        assert points[0]["nav"] == 1.0


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

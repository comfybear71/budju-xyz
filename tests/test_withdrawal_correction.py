"""Tests for the July-16 withdrawal correction + record_withdrawal NAV fix.

Proves:
- reconstruct() restores NAV and every holder's dollar value (Issue 2 #1/#2)
- record_withdrawal now snapshots PRE-withdrawal NAV (Issue 2 #3)
- correct_unrecorded_withdrawal dry-run writes NOTHING and is idempotent
"""
import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from withdrawal_math import reconstruct, pre_withdrawal_nav, shares_to_burn  # noqa: E402


class TestReconstructMath:
    """Burning amount/pre_nav shares restores NAV to pre-withdrawal exactly."""

    def test_nav_restored_clean(self):
        r = reconstruct(current_pool_value=5000, total_shares=20000, amount=15000, admin_shares=18000)
        assert r["currentNav"] == pytest.approx(0.25)          # collapsed
        assert r["preWithdrawalNav"] == pytest.approx(1.0)
        assert r["restoredNav"] == pytest.approx(1.0)          # restored == pre
        assert r["sharesToBurn"] == pytest.approx(15000)
        assert r["newTotalShares"] == pytest.approx(5000)

    def test_holder_value_restored_to_pre_withdrawal(self):
        r = reconstruct(5000, 20000, 15000, 18000)
        holder_shares = 500  # a non-admin holder, shares unchanged
        value_now_broken = holder_shares * r["currentNav"]     # what they see now
        value_after = holder_shares * r["restoredNav"]         # after correction
        assert value_now_broken == pytest.approx(125.0)        # collapsed
        assert value_after == pytest.approx(500.0)             # restored

    def test_incident_numbers(self):
        # Models NAV collapsed to ~0.4221 after the unrecorded $13,260.17 withdrawal
        W = 13260.17
        pre_nav = 0.90
        collapsed = 0.4221
        S = W / (pre_nav - collapsed)
        V = collapsed * S
        r = reconstruct(V, S, W, admin_shares=S)  # admin owns ~all
        assert r["currentNav"] == pytest.approx(collapsed, abs=1e-4)
        assert r["restoredNav"] == pytest.approx(pre_nav, abs=1e-6)
        assert r["restoredNav"] == pytest.approx(r["preWithdrawalNav"], abs=1e-9)

    def test_burn_capped_at_admin_shares(self):
        # Admin can't cover the full amount → burn is capped, never negative shares
        burn = shares_to_burn(amount=1000, pre_nav=1.0, admin_shares=200)
        assert burn == 200

    def test_pre_nav_zero_shares_safe(self):
        assert pre_withdrawal_nav(1000, 0, 500) == 1.0


def _db():
    with patch.dict("sys.modules", {
        "pymongo": MagicMock(), "pymongo.errors": MagicMock(), "base58": MagicMock(),
        "nacl": MagicMock(), "nacl.signing": MagicMock(), "nacl.exceptions": MagicMock(),
    }):
        if "database" in sys.modules:
            del sys.modules["database"]
        import database
        database.pool_state_collection = MagicMock()
        database.users_collection = MagicMock()
        database.withdrawals_collection = MagicMock()
        database.deposits_collection = MagicMock()
        return database


class TestRecordWithdrawalUsesPreNav:
    """record_withdrawal must divide by PRE-withdrawal NAV, not the collapsed one."""

    def test_uses_pre_withdrawal_nav(self):
        db = _db()
        db.users_collection.find_one.return_value = {
            "walletAddress": "Admin", "shares": 30000.0, "totalWithdrawn": 0.0,
        }
        db.pool_state_collection.find_one.return_value = {"_id": "pool", "totalShares": 20000.0}
        db.users_collection.find.return_value = []

        # post-withdrawal live value = 5000; amount = 15000 → pre value 20000 → NAV 1.0
        result = db.record_withdrawal("Admin", 15000.0, 5000.0, "AUD")
        assert result["nav"] == pytest.approx(1.0)               # pre-withdrawal NAV, not 0.25
        assert result["shares_burned"] == pytest.approx(15000.0)  # 15000 / 1.0


class TestCorrectionDryRun:
    """Dry-run computes the report and writes nothing; idempotent on re-apply."""

    def _setup(self, db):
        db.ADMIN_WALLETS = ["Admin"]
        db.pool_state_collection.find_one.return_value = {"_id": "pool", "totalShares": 20000.0}
        db.users_collection.find_one.return_value = {"walletAddress": "Admin", "shares": 18000.0}
        db.withdrawals_collection.find_one.return_value = None  # not yet applied
        db.users_collection.find.return_value = [
            {"walletAddress": "Admin", "shares": 18000.0, "totalDeposited": 16000.0},
            {"walletAddress": "userA", "shares": 1200.0, "totalDeposited": 1000.0},
            {"walletAddress": "userB", "shares": 800.0, "totalDeposited": 700.0},
        ]

    def test_dry_run_writes_nothing_and_restores_values(self):
        db = _db()
        self._setup(db)
        res = db.correct_unrecorded_withdrawal("Admin", 15000.0, 5000.0, dry_run=True)

        # No writes at all
        db.pool_state_collection.update_one.assert_not_called()
        db.users_collection.update_one.assert_not_called()
        db.withdrawals_collection.insert_one.assert_not_called()

        assert res["dryRun"] is True
        assert res["restoredNav"] == pytest.approx(res["preWithdrawalNav"], abs=1e-9)
        assert res["currentNav"] == pytest.approx(0.25)
        assert res["restoredNav"] == pytest.approx(1.0)
        assert res["adminCoversAmount"] is True

        # Non-admin holders: shares unchanged, dollar value restored (0.25 -> 1.0 NAV)
        holders = {h["wallet"]: h for h in res["holders"]}
        assert holders["userA"]["sharesBefore"] == holders["userA"]["sharesAfter"]
        assert holders["userA"]["valueBefore"] == pytest.approx(1200 * 0.25)   # 300 now
        assert holders["userA"]["valueAfter"] == pytest.approx(1200 * 1.0)     # 1200 restored
        # Admin shares reduced by the burn
        assert holders["Admin"]["sharesAfter"] == pytest.approx(18000 - res["sharesToBurn"])

    def test_idempotent_refuses_second_apply(self):
        db = _db()
        self._setup(db)
        db.withdrawals_collection.find_one.return_value = {"txHash": "admin_correction_2026_07_16"}
        res = db.correct_unrecorded_withdrawal("Admin", 15000.0, 5000.0, dry_run=False)
        assert res["alreadyApplied"] is True
        # Even with dry_run=False, an already-applied correction writes nothing
        db.pool_state_collection.update_one.assert_not_called()
        db.users_collection.update_one.assert_not_called()
        db.withdrawals_collection.insert_one.assert_not_called()

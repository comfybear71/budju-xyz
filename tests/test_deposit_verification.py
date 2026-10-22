"""Tests for on-chain deposit verification.

Covers the 2026-10-22 incident: a self-service deposit was recorded and
credited real pool shares for a Solana transaction that was signed and
broadcast but never confirmed on-chain, so no USDC ever arrived. These
tests verify verify_onchain_usdc_deposit() rejects that scenario, and that
record_deposit() refuses to record the same on-chain signature twice.

No real MongoDB or Solana RPC connection required — everything is mocked.
"""

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

_mock_pymongo = MagicMock()
_mock_base58 = MagicMock()
_mock_nacl_signing = MagicMock()
_mock_nacl_exceptions = MagicMock()


@pytest.fixture
def db_module():
    """Import database module with fully mocked dependencies."""
    with patch.dict("sys.modules", {
        "pymongo": _mock_pymongo,
        "pymongo.errors": MagicMock(),
        "base58": _mock_base58,
        "nacl": MagicMock(),
        "nacl.signing": _mock_nacl_signing,
        "nacl.exceptions": _mock_nacl_exceptions,
    }):
        if "database" in sys.modules:
            del sys.modules["database"]

        import database

        database.pool_state_collection = MagicMock()
        database.users_collection = MagicMock()
        database.deposits_collection = MagicMock()
        database.withdrawals_collection = MagicMock()
        database.trades_collection = MagicMock()

        yield database

        if "database" in sys.modules:
            del sys.modules["database"]


# A well-formed, 88-char base58-looking signature — long enough to pass the
# basic shape check so tests exercise the actual RPC-based verification.
FAKE_SIG = "21zq2hiWqPNQ8bLk7u7XFPvL2912NcShXfSwdH9dsMLCHsz3KuDA9Lz6g6xPPWdS5hXgpW1YFN7MciVBZFwXV7jf"
SENDER = "EYmq2R4z7fReMNhJ98A4MsP1ACRhFzhVCnG7fRCzuEZZ"


def _token_balance(owner, mint, ui_amount):
    return {
        "owner": owner,
        "mint": mint,
        "uiTokenAmount": {"uiAmount": ui_amount},
    }


class TestVerifyOnchainUsdcDeposit:
    """Mirrors the exact 2026-10-22 incident and its fix."""

    def test_rejects_signature_too_short(self, db_module):
        is_valid, error = db_module.verify_onchain_usdc_deposit("tooshort", SENDER, 100.0)
        assert is_valid is False
        assert "Invalid transaction signature" in error

    def test_rejects_transaction_not_found_on_chain(self, db_module):
        """The exact incident: getTransaction returns result=None for a
        signature that was signed+broadcast but never confirmed."""
        with patch.object(db_module, "_solana_rpc", return_value={"result": None}):
            is_valid, error = db_module.verify_onchain_usdc_deposit(FAKE_SIG, SENDER, 350.0)
        assert is_valid is False
        assert "not found on-chain" in error

    def test_rejects_failed_transaction(self, db_module):
        rpc_response = {"result": {"meta": {"err": {"InstructionError": [0, "Custom"]}}}}
        with patch.object(db_module, "_solana_rpc", return_value=rpc_response):
            is_valid, error = db_module.verify_onchain_usdc_deposit(FAKE_SIG, SENDER, 100.0)
        assert is_valid is False
        assert "failed on-chain" in error

    def test_rejects_no_usdc_movement_to_pool(self, db_module):
        rpc_response = {"result": {"meta": {
            "err": None,
            "preTokenBalances": [],
            "postTokenBalances": [],
        }}}
        with patch.object(db_module, "_solana_rpc", return_value=rpc_response):
            is_valid, error = db_module.verify_onchain_usdc_deposit(FAKE_SIG, SENDER, 100.0)
        assert is_valid is False
        assert "didn't transfer any USDC" in error

    def test_rejects_amount_less_than_claimed(self, db_module):
        """Claimed $350 but on-chain transfer was only $50 — must not credit
        the larger claimed amount."""
        mint = db_module.USDC_MINT
        pool = db_module.POOL_WALLET
        rpc_response = {"result": {"meta": {
            "err": None,
            "preTokenBalances": [_token_balance(pool, mint, 5.0), _token_balance(SENDER, mint, 370.0)],
            "postTokenBalances": [_token_balance(pool, mint, 55.0), _token_balance(SENDER, mint, 320.0)],
        }}}
        with patch.object(db_module, "_solana_rpc", return_value=rpc_response):
            is_valid, error = db_module.verify_onchain_usdc_deposit(FAKE_SIG, SENDER, 350.0)
        assert is_valid is False
        assert "less than the claimed" in error

    def test_accepts_matching_onchain_transfer(self, db_module):
        """The $50 deposit from the same incident — this one IS real and
        must be accepted."""
        mint = db_module.USDC_MINT
        pool = db_module.POOL_WALLET
        rpc_response = {"result": {"meta": {
            "err": None,
            "preTokenBalances": [_token_balance(pool, mint, 5.0), _token_balance(SENDER, mint, 370.0)],
            "postTokenBalances": [_token_balance(pool, mint, 55.0), _token_balance(SENDER, mint, 320.0)],
        }}}
        with patch.object(db_module, "_solana_rpc", return_value=rpc_response):
            is_valid, error = db_module.verify_onchain_usdc_deposit(FAKE_SIG, SENDER, 50.0)
        assert is_valid is True
        assert error is None

    def test_rejects_funds_not_sent_from_claimed_wallet(self, db_module):
        """Someone replaying another wallet's real deposit signature as
        their own must be rejected."""
        mint = db_module.USDC_MINT
        pool = db_module.POOL_WALLET
        other_wallet = "SomeoneElseWa11etAddressNotTheSender11111111"
        rpc_response = {"result": {"meta": {
            "err": None,
            "preTokenBalances": [_token_balance(pool, mint, 5.0), _token_balance(other_wallet, mint, 370.0)],
            "postTokenBalances": [_token_balance(pool, mint, 55.0), _token_balance(other_wallet, mint, 320.0)],
        }}}
        with patch.object(db_module, "_solana_rpc", return_value=rpc_response):
            is_valid, error = db_module.verify_onchain_usdc_deposit(FAKE_SIG, SENDER, 50.0)
        assert is_valid is False
        assert "wasn't sent from your wallet" in error

    def test_rpc_failure_fails_closed(self, db_module):
        """If Solana can't be reached at all, never fall back to trusting
        the client — reject and ask them to retry."""
        with patch.object(db_module, "_solana_rpc", side_effect=Exception("timeout")):
            is_valid, error = db_module.verify_onchain_usdc_deposit(FAKE_SIG, SENDER, 100.0)
        assert is_valid is False
        assert "Could not reach Solana" in error


class TestRecordDepositTxHashDedup:
    """record_deposit() must refuse to record the same on-chain signature
    twice, so a replayed/resubmitted txHash can't double-mint shares."""

    def test_rejects_already_recorded_txhash(self, db_module):
        db_module.users_collection.find_one.return_value = {
            "walletAddress": SENDER, "shares": 0, "totalDeposited": 0,
        }
        # First call in record_deposit is the txHash-dedup lookup.
        db_module.deposits_collection.find_one.return_value = {
            "txHash": FAKE_SIG, "status": "completed",
        }

        with pytest.raises(ValueError, match="already been recorded"):
            db_module.record_deposit(SENDER, 50.0, FAKE_SIG, 1000.0, "USDC", value_includes_deposit=False)

    def test_voided_txhash_can_be_reused_by_the_dedup_check(self, db_module):
        """A voided deposit's txHash shouldn't permanently block that
        signature — the dedup query explicitly excludes status='voided'."""
        db_module.users_collection.find_one.return_value = {
            "walletAddress": SENDER, "shares": 0, "totalDeposited": 0,
        }

        calls = []

        def fake_find_one(query=None, *args, **kwargs):
            calls.append(query)
            # First call: the txHash-dedup check — simulate only a voided
            # record existing, which the query's $ne: "voided" filters out.
            if len(calls) == 1:
                assert query.get("status") == {"$ne": "voided"}
                return None
            # Second call: the 5-minute duplicate-amount guard.
            return None

        db_module.deposits_collection.find_one.side_effect = fake_find_one
        db_module.pool_state_collection.find_one.return_value = {"_id": "pool", "totalShares": 1000.0}
        # _recalculate_allocations() does list(users_collection.find(...)) —
        # a bare MagicMock isn't iterable, so give it an empty result set.
        db_module.users_collection.find.return_value = []

        # Should not raise — the voided record doesn't block re-recording.
        result = db_module.record_deposit(SENDER, 50.0, FAKE_SIG, 1000.0, "USDC", value_includes_deposit=False)
        assert result["shares"] > 0

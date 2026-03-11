"""Tests for Ed25519 admin auth and replay protection."""

import importlib
import os
import sys
import time
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


@pytest.fixture
def mock_db_module():
    """Create a mock database module."""
    mock_db = MagicMock()
    mock_db.is_admin = MagicMock(return_value=True)
    mock_db.verify_wallet_signature = MagicMock(return_value=True)
    mock_db.ADMIN_WALLETS = ["TestAdminWallet123"]
    return mock_db


@pytest.fixture
def index_module(mock_db_module):
    """Import the index module with mocked database."""
    # We need to mock multiple database imports
    with patch.dict("sys.modules", {"database": mock_db_module}):
        spec = importlib.util.spec_from_file_location(
            "index",
            os.path.join(os.path.dirname(__file__), "..", "api", "index.py"),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        # Clear any leftover nonces from previous test runs
        mod._used_nonces.clear()
        return mod


class TestReplayProtection:
    """Test the _verify_admin replay protection."""

    def test_valid_admin_request(self, index_module, mock_db_module):
        """Valid admin with fresh timestamp should pass."""
        now_ms = int(time.time() * 1000)
        body = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [1, 2, 3],
            "adminMessage": f"BUDJU_ADMIN:{now_ms}",
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is True
        assert err is None

    def test_expired_timestamp(self, index_module, mock_db_module):
        """Message with timestamp older than 5 minutes should fail."""
        old_ms = int(time.time() * 1000) - (6 * 60 * 1000)  # 6 minutes ago
        body = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [1, 2, 3],
            "adminMessage": f"BUDJU_ADMIN:{old_ms}",
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is False
        assert "expired" in err.lower() or "replay" in err.lower()

    def test_within_5_minute_window(self, index_module, mock_db_module):
        """Message with timestamp 4 minutes ago should pass."""
        recent_ms = int(time.time() * 1000) - (4 * 60 * 1000)  # 4 minutes ago
        body = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [1, 2, 3],
            "adminMessage": f"BUDJU_ADMIN:{recent_ms}",
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is True

    def test_nonce_deduplication(self, index_module, mock_db_module):
        """Same message used twice should be rejected on second use."""
        now_ms = int(time.time() * 1000)
        body = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [1, 2, 3],
            "adminMessage": f"BUDJU_ADMIN:{now_ms}",
        }

        # First use: should pass
        ok1, _ = index_module._verify_admin(body, None)
        assert ok1 is True

        # Second use: same message should be rejected
        ok2, err2 = index_module._verify_admin(body, None)
        assert ok2 is False
        assert "already used" in err2.lower()

    def test_different_timestamps_both_pass(self, index_module, mock_db_module):
        """Two different timestamps should both pass."""
        now_ms = int(time.time() * 1000)
        body1 = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [1, 2, 3],
            "adminMessage": f"BUDJU_ADMIN:{now_ms}",
        }
        body2 = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [1, 2, 3],
            "adminMessage": f"BUDJU_ADMIN:{now_ms + 1}",
        }

        ok1, _ = index_module._verify_admin(body1, None)
        ok2, _ = index_module._verify_admin(body2, None)
        assert ok1 is True
        assert ok2 is True

    def test_missing_wallet(self, index_module):
        """Missing adminWallet should fail."""
        body = {
            "adminSignature": [1, 2, 3],
            "adminMessage": "BUDJU_ADMIN:123",
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is False
        assert "admin" in err.lower()

    def test_missing_signature(self, index_module, mock_db_module):
        """Missing adminSignature should fail."""
        body = {
            "adminWallet": "TestAdminWallet123",
            "adminMessage": "BUDJU_ADMIN:123",
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is False
        assert "signature" in err.lower()

    def test_missing_message(self, index_module, mock_db_module):
        """Missing adminMessage should fail."""
        body = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [1, 2, 3],
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is False
        assert "signature" in err.lower() or "message" in err.lower()

    def test_invalid_message_format(self, index_module, mock_db_module):
        """Message without colon separator should fail."""
        body = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [1, 2, 3],
            "adminMessage": "BUDJU_ADMIN",
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is False

    def test_non_admin_wallet(self, index_module, mock_db_module):
        """Non-admin wallet should fail."""
        mock_db_module.is_admin.return_value = False
        now_ms = int(time.time() * 1000)
        body = {
            "adminWallet": "RandomUserWallet",
            "adminSignature": [1, 2, 3],
            "adminMessage": f"BUDJU_ADMIN:{now_ms}",
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is False
        assert "admin" in err.lower()

    def test_invalid_signature(self, index_module, mock_db_module):
        """Invalid signature should fail."""
        mock_db_module.verify_wallet_signature.return_value = False
        now_ms = int(time.time() * 1000)
        body = {
            "adminWallet": "TestAdminWallet123",
            "adminSignature": [99, 99, 99],
            "adminMessage": f"BUDJU_ADMIN:{now_ms}",
        }
        ok, err = index_module._verify_admin(body, None)
        assert ok is False
        assert "signature" in err.lower()


class TestNoncePruning:
    """Test that expired nonces get cleaned up."""

    def test_prune_removes_expired(self, index_module):
        """Expired nonces should be removed by _prune_expired_nonces."""
        now_ms = int(time.time() * 1000)
        index_module._used_nonces["old_msg"] = now_ms - 1000  # Already expired
        index_module._used_nonces["new_msg"] = now_ms + 60000  # Still valid

        index_module._prune_expired_nonces(now_ms)

        assert "old_msg" not in index_module._used_nonces
        assert "new_msg" in index_module._used_nonces

    def test_prune_empty_dict(self, index_module):
        """Pruning empty dict should not crash."""
        index_module._used_nonces.clear()
        index_module._prune_expired_nonces(int(time.time() * 1000))
        assert len(index_module._used_nonces) == 0

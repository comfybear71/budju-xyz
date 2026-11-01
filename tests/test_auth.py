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
        return mod


class _H:
    headers = {}


class TestVerifyAdmin:
    """_verify_admin: who counts as an admin caller. (The wallet-signed 12h pass that
    protects every admin route is tested in test_session_auth.py.)"""

    def test_non_admin_wallet_rejected(self, index_module, mock_db_module):
        index_module.is_admin = lambda w: False
        ok, err = index_module._verify_admin({"adminWallet": "Nobody"}, _H())
        assert ok is False and "Admin access required" in err

    def test_missing_wallet_rejected(self, index_module):
        ok, _ = index_module._verify_admin({}, _H())
        assert ok is False

    def test_admin_wallet_accepted(self, index_module):
        index_module.is_admin = lambda w: True
        ok, err = index_module._verify_admin({"adminWallet": "TestAdminWallet123"}, _H())
        assert ok is True and err is None

    def test_bad_signature_rejected(self, index_module):
        index_module.is_admin = lambda w: True
        index_module.verify_wallet_signature = lambda w, m, s: False
        ok, err = index_module._verify_admin(
            {"adminWallet": "TestAdminWallet123", "adminSignature": "x", "adminMessage": "a:1"}, _H())
        assert ok is False and "Invalid admin signature" in err

    def test_expired_timestamp_rejected(self, index_module):
        index_module.is_admin = lambda w: True
        index_module.verify_wallet_signature = lambda w, m, s: True
        old_ms = int(time.time() * 1000) - 2 * 60 * 60 * 1000
        ok, err = index_module._verify_admin(
            {"adminWallet": "TestAdminWallet123", "adminSignature": "x", "adminMessage": f"login:{old_ms}"}, _H())
        assert ok is False and "expired" in err

    def test_fresh_timestamp_accepted(self, index_module):
        index_module.is_admin = lambda w: True
        index_module.verify_wallet_signature = lambda w, m, s: True
        now_ms = int(time.time() * 1000)
        ok, _ = index_module._verify_admin(
            {"adminWallet": "TestAdminWallet123", "adminSignature": "x", "adminMessage": f"login:{now_ms}"}, _H())
        assert ok is True

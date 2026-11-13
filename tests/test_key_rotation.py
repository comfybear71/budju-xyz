"""Rotating SWYFTX_KEY_ENCRYPTION_SECRET without locking anyone out (api/crypto_utils.py)."""
import base64
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
import crypto_utils as cu  # noqa: E402

OLD = base64.b64encode(b"o" * 32).decode()
NEW = base64.b64encode(b"n" * 32).decode()


@pytest.fixture
def env(monkeypatch):
    def set_(current, previous=None):
        monkeypatch.setenv("SWYFTX_KEY_ENCRYPTION_SECRET", current)
        if previous:
            monkeypatch.setenv("SWYFTX_KEY_ENCRYPTION_SECRET_PREVIOUS", previous)
        else:
            monkeypatch.delenv("SWYFTX_KEY_ENCRYPTION_SECRET_PREVIOUS", raising=False)
    return set_


def test_roundtrip_under_one_secret(env):
    env(OLD)
    assert cu.decrypt_secret(cu.encrypt_secret("my-swyftx-key")) == "my-swyftx-key"


def test_rotating_without_the_previous_secret_locks_keys_out(env):
    env(OLD)
    token = cu.encrypt_secret("k")
    env(NEW)
    with pytest.raises(Exception):
        cu.decrypt_secret(token)


def test_previous_secret_keeps_old_keys_readable(env):
    env(OLD)
    token = cu.encrypt_secret("k")
    env(NEW, previous=OLD)
    assert cu.decrypt_secret(token) == "k"
    assert cu.decrypt_with_info(token) == ("k", True)


def test_new_saves_use_the_new_secret(env):
    env(NEW, previous=OLD)
    token = cu.encrypt_secret("fresh")
    assert cu.decrypt_with_info(token) == ("fresh", False)
    env(NEW)                                   # works with the previous secret gone
    assert cu.decrypt_secret(token) == "fresh"


def test_reencrypt_token_statuses(env):
    env(OLD)
    old_token = cu.encrypt_secret("k")
    env(NEW, previous=OLD)
    new_token, status = cu.reencrypt_token(old_token)
    assert status == "migrated" and new_token != old_token
    env(NEW)                                   # previous removed: the migrated token still reads
    assert cu.decrypt_secret(new_token) == "k"
    assert cu.reencrypt_token(new_token) == (None, "current")
    assert cu.reencrypt_token("not-a-token")[1] == "failed"


def test_tampered_token_is_rejected_even_with_previous_set(env):
    env(OLD)
    token = cu.encrypt_secret("k")
    raw = bytearray(base64.b64decode(token))
    raw[-1] ^= 1
    env(NEW, previous=OLD)
    assert cu.reencrypt_token(base64.b64encode(bytes(raw)).decode())[1] == "failed"

# ==========================================
# Encryption helpers for per-user exchange API keys
# ==========================================
# Each user's own Swyftx API key is sensitive — if it leaked, someone could
# place trades on that person's exchange account. It must never be stored in
# plain text. This uses AES-256-GCM (authenticated encryption: tampering or
# corruption is detected on decrypt, not silently accepted).
#
# Key management: SWYFTX_KEY_ENCRYPTION_SECRET must be a 32-byte key,
# base64-encoded, set as an env var (Vercel / Cursor secret) — never
# committed, never logged. Generate one with:
#   python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
#
# Fails closed (lesson from the April 2026 ML droplet compromise — an auth
# check that defaults to "allow" when misconfigured is worse than refusing
# to start): if the key is missing or malformed, every encrypt/decrypt call
# raises immediately rather than silently storing plaintext or accepting a
# weak fallback key.

import os
import base64
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_NONCE_LEN = 12  # 96-bit nonce, standard for AES-GCM


def _decode_key(raw: str, name: str) -> bytes:
    try:
        key = base64.b64decode(raw)
    except Exception as e:
        raise RuntimeError(f"{name} is not valid base64: {e}")
    if len(key) != 32:
        raise RuntimeError(f"{name} must decode to 32 bytes (AES-256), got {len(key)}")
    return key


def _load_key() -> bytes:
    raw = os.getenv("SWYFTX_KEY_ENCRYPTION_SECRET", "")
    if not raw:
        raise RuntimeError(
            "SWYFTX_KEY_ENCRYPTION_SECRET is not set — refusing to encrypt or "
            "decrypt exchange API keys without it. Set a base64-encoded "
            "32-byte secret in the environment before storing any user keys."
        )
    return _decode_key(raw, "SWYFTX_KEY_ENCRYPTION_SECRET")


def _load_previous_key():
    """Optional: the secret that was in use BEFORE a rotation. While it is set, keys saved under it still
    decrypt, so a rotation never locks anyone out. Remove it once everything is re-encrypted."""
    raw = os.getenv("SWYFTX_KEY_ENCRYPTION_SECRET_PREVIOUS", "")
    return _decode_key(raw, "SWYFTX_KEY_ENCRYPTION_SECRET_PREVIOUS") if raw else None


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a plaintext string (e.g. a Swyftx API key) for storage, always under the CURRENT secret.

    Returns base64(nonce || ciphertext_with_tag) as a single opaque string.
    """
    if not plaintext:
        raise ValueError("Nothing to encrypt")
    key = _load_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(_NONCE_LEN)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def _decrypt_with(key: bytes, raw: bytes) -> str:
    nonce, ciphertext = raw[:_NONCE_LEN], raw[_NONCE_LEN:]
    return AESGCM(key).decrypt(nonce, ciphertext, None).decode("utf-8")


def decrypt_with_info(token: str):
    """-> (plaintext, used_previous_secret). Tries the current secret first, then the previous one (if set).
    Raises on any tampering, corruption, or if neither secret works — never returns a guess."""
    if not token:
        raise ValueError("Nothing to decrypt")
    raw = base64.b64decode(token)
    try:
        return _decrypt_with(_load_key(), raw), False
    except InvalidTag:
        previous = _load_previous_key()
        if previous is None:
            raise
        return _decrypt_with(previous, raw), True


def decrypt_secret(token: str) -> str:
    """Decrypt a value produced by encrypt_secret(). During a rotation it also accepts values saved under the previous secret."""
    return decrypt_with_info(token)[0]


def reencrypt_token(token: str):
    """-> (new_token or None, status). status: "current" (already under the current secret), "migrated" (re-encrypted now),
    "failed" (cannot be read with either secret)."""
    try:
        plaintext, used_previous = decrypt_with_info(token)
    except Exception:
        return None, "failed"
    if not used_previous:
        return None, "current"
    return encrypt_secret(plaintext), "migrated"


def mask_secret(plaintext: str) -> str:
    """Last-4-chars display mask — enough for a user to recognise which key
    is saved without ever re-exposing the full value over the API."""
    if not plaintext or len(plaintext) < 4:
        return "****"
    return "•" * 8 + plaintext[-4:]

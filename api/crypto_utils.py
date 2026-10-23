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
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_NONCE_LEN = 12  # 96-bit nonce, standard for AES-GCM


def _load_key() -> bytes:
    raw = os.getenv("SWYFTX_KEY_ENCRYPTION_SECRET", "")
    if not raw:
        raise RuntimeError(
            "SWYFTX_KEY_ENCRYPTION_SECRET is not set — refusing to encrypt or "
            "decrypt exchange API keys without it. Set a base64-encoded "
            "32-byte secret in the environment before storing any user keys."
        )
    try:
        key = base64.b64decode(raw)
    except Exception as e:
        raise RuntimeError(f"SWYFTX_KEY_ENCRYPTION_SECRET is not valid base64: {e}")
    if len(key) != 32:
        raise RuntimeError(
            f"SWYFTX_KEY_ENCRYPTION_SECRET must decode to 32 bytes (AES-256), "
            f"got {len(key)}"
        )
    return key


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a plaintext string (e.g. a Swyftx API key) for storage.

    Returns base64(nonce || ciphertext_with_tag) as a single opaque string.
    """
    if not plaintext:
        raise ValueError("Nothing to encrypt")
    key = _load_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(_NONCE_LEN)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_secret(token: str) -> str:
    """Decrypt a value produced by encrypt_secret(). Raises on any tampering,
    corruption, or wrong key — never returns a guessed/partial plaintext."""
    if not token:
        raise ValueError("Nothing to decrypt")
    key = _load_key()
    raw = base64.b64decode(token)
    nonce, ciphertext = raw[:_NONCE_LEN], raw[_NONCE_LEN:]
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")


def mask_secret(plaintext: str) -> str:
    """Last-4-chars display mask — enough for a user to recognise which key
    is saved without ever re-exposing the full value over the API."""
    if not plaintext or len(plaintext) < 4:
        return "****"
    return "•" * 8 + plaintext[-4:]

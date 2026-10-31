# ==========================================
# Wallet-signature sign-in + session passes
# ==========================================
# Until now every admin/owner action was "authenticated" by the caller simply
# TYPING a wallet address — and the admin address is public. This adds real
# proof of identity:
#
#   1. The wallet signs a short sign-in message ONCE (Ed25519, via the
#      wallet's own signMessage). POST /api/auth/session verifies it against
#      the wallet's public key (a Solana address IS the public key).
#   2. The server returns a 12-hour signed pass ("session token"). It is
#      stateless: payload + HMAC, no database. The browser sends it as
#      `Authorization: Bearer <token>` on every /api call.
#   3. Sensitive routes (admin actions, key changes, bot on/off, and the
#      server-side order proxy) require a valid pass for the right wallet.
#
# Roll-out switch (env AUTH_ENFORCE):
#     "off" — behave exactly as before (no checks)
#     "log" — DEFAULT. Check everything, LOG what would be blocked, block nothing
#     "on"  — enforce: unauthenticated requests are rejected (401/403)
#
# The same token format is minted/verified in api/_session.ts (order proxy and
# QR sign-in), so the two runtimes must stay in sync.

import base64
import hashlib
import hmac
import json
import os
import re
import time

SESSION_TTL_MS = 12 * 3_600_000
LOGIN_FRESH_MS = 10 * 60 * 1000        # a sign-in signature is only accepted this long after it's made
TOKEN_VERSION = "v1"

_LOGIN_RE = re.compile(r"^Sign in to BUDJU\nWallet: (?P<wallet>[1-9A-HJ-NP-Za-km-z]{32,44})\nIssued: (?P<ts>\d{10,16})\n")


# ── helpers ──────────────────────────────────────────────────

def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _signing_key() -> bytes:
    """Derived from a secret that already exists in the deployment (the one
    protecting stored Swyftx keys) so no new setting is needed. Both Python
    and TypeScript derive it identically."""
    secret = os.getenv("SWYFTX_KEY_ENCRYPTION_SECRET") or os.getenv("CRON_SECRET") or ""
    if not secret:
        raise RuntimeError("No server secret available to sign sessions")
    return hmac.new(secret.encode(), b"budju-session-v1", hashlib.sha256).digest()


def auth_mode() -> str:
    mode = os.getenv("AUTH_ENFORCE", "log").strip().lower()
    return mode if mode in ("off", "log", "on") else "log"


# ── sign-in ──────────────────────────────────────────────────

def login_message(wallet: str, issued_ms: int) -> str:
    """The exact text the wallet is asked to sign (shown in the wallet popup)."""
    return (f"Sign in to BUDJU\nWallet: {wallet}\nIssued: {issued_ms}\n"
            f"This proves you own this wallet. It costs nothing and moves no funds.")


def mint_token(wallet: str, now_ms: int = None) -> dict:
    now_ms = now_ms or int(time.time() * 1000)
    exp = now_ms + SESSION_TTL_MS
    payload = _b64e(json.dumps({"w": wallet, "exp": exp}, separators=(",", ":")).encode())
    sig = _b64e(hmac.new(_signing_key(), f"{TOKEN_VERSION}.{payload}".encode(), hashlib.sha256).digest())
    return {"token": f"{TOKEN_VERSION}.{payload}.{sig}", "expiresAt": exp, "wallet": wallet}


def create_session(wallet: str, message: str, signature, verify_fn, now_ms: int = None) -> dict:
    """Verify a signed sign-in message and mint a pass. `verify_fn(wallet,
    message, signature) -> bool` is the Ed25519 check (database.verify_wallet_signature).
    Raises ValueError with a user-safe reason on any problem."""
    now_ms = now_ms or int(time.time() * 1000)
    if not wallet or not message or not signature:
        raise ValueError("walletAddress, message and signature are required")
    m = _LOGIN_RE.match(message)
    if not m or m.group("wallet") != wallet:
        raise ValueError("Sign-in message does not match this wallet")
    if abs(now_ms - int(m.group("ts"))) > LOGIN_FRESH_MS:
        raise ValueError("Sign-in message has expired — please sign again")
    if not verify_fn(wallet, message, signature):
        raise ValueError("Invalid signature")
    return mint_token(wallet, now_ms)


def verify_token(token, now_ms: int = None):
    """-> wallet address if the pass is genuine and unexpired, else None."""
    if not token or not isinstance(token, str):
        return None
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != TOKEN_VERSION:
        return None
    try:
        expected = _b64e(hmac.new(_signing_key(), f"{parts[0]}.{parts[1]}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, parts[2]):
            return None
        payload = json.loads(_b64d(parts[1]))
        if (now_ms or int(time.time() * 1000)) >= int(payload["exp"]):
            return None
        return payload["w"]
    except Exception:
        return None


def bearer(auth_header):
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


# ── which requests need a pass ───────────────────────────────

_ADMIN_GET_EXACT = {
    "/api/users", "/api/pool/allocations", "/api/pool/deposit-summary", "/api/debug",
}
_ADMIN_POST_EXACT = {
    "/api/state", "/api/trade", "/api/trade/sync", "/api/deposit", "/api/withdrawal",
    "/api/pool/initialize", "/api/user/sync",
}
_OWNER_POST_EXACT = {"/api/user/swyftx-key", "/api/user/swyftx-key/remove", "/api/user/auto-trade"}


def classify(method: str, path: str, params: dict, body: dict):
    """-> (kind, acting_wallet): kind is "admin", "owner" or None (public).
    acting_wallet is the wallet the request CLAIMS to act as (may be None)."""
    params = params or {}
    body = body or {}
    if path.startswith("/api/auth/"):
        return None, None
    admin_claim = body.get("adminWallet") or params.get("admin_wallet") or body.get("wallet")
    if path.startswith("/api/admin/"):
        return "admin", admin_claim
    if method == "GET":
        # Coin stats: "mine" is the owner's own trades; "everyone" is the
        # combined view, for BUDJU members (10M BUDJU + a connected key).
        if path in ("/api/coin-stats", "/api/coin-trades"):
            scope = params.get("scope")
            if scope == "mine":
                return "owner", params.get("wallet")
            if scope == "everyone":
                return "member", params.get("wallet")
            return None, None
        # Per-wallet holdings behind the Leaderboard drill-down: members only.
        if path == "/api/community/aggregate-holdings":
            return "member", params.get("admin_wallet") or params.get("wallet")
        if path in _ADMIN_GET_EXACT or path.startswith("/api/desk/"):
            return "admin", admin_claim or params.get("wallet")
        if path == "/api/transactions" and params.get("admin") == "true":
            return "admin", params.get("wallet")
        return None, None
    if method == "POST":
        # /api/desk/note is server-to-server (Telegram bot) with its own secret.
        if path in _ADMIN_POST_EXACT or (path.startswith("/api/perp/") ):
            return "admin", admin_claim
        if path in _OWNER_POST_EXACT:
            return "owner", body.get("requesterWallet") or body.get("walletAddress")
    return None, None


def check_request(method, path, params, body, auth_header, admin_wallets, now_ms=None, is_member=None):
    """Pure decision. -> (ok, http_status, reason). ok=True also for public paths.
    `is_member(wallet) -> bool` decides BUDJU membership for "member" routes."""
    kind, acting = classify(method, path, params, body)
    if kind is None:
        return True, 200, None
    wallet = verify_token(bearer(auth_header), now_ms)
    if wallet is None:
        return False, 401, "Sign in with your wallet to do this"
    if kind == "admin":
        if wallet not in admin_wallets:
            return False, 403, "Admin access required"
        if acting and acting != wallet:
            return False, 403, "Signed-in wallet does not match this request"
        return True, 200, None
    if kind == "member":
        if acting and acting != wallet:
            return False, 403, "Signed-in wallet does not match this request"
        if wallet in admin_wallets or (is_member is not None and is_member(wallet)):
            return True, 200, None
        return False, 403, "Members only — hold 10M BUDJU and connect a Swyftx key to see this"
    if not acting or acting != wallet:
        return False, 403, "Signed-in wallet does not match this request"
    return True, 200, None


def evaluate(method, path, params, body, auth_header, admin_wallets, mode=None, now_ms=None, is_member=None):
    """Apply the roll-out mode to check_request().
    -> {"block": bool, "log": bool, "status": int, "reason": str|None}
       block=True  -> reject the request (mode "on")
       log=True    -> would have been rejected; just log it (mode "log")"""
    mode = mode or auth_mode()
    if mode == "off":
        return {"block": False, "log": False, "status": 200, "reason": None}
    ok, status, reason = check_request(method, path, params, body, auth_header, admin_wallets, now_ms, is_member)
    if ok:
        return {"block": False, "log": False, "status": 200, "reason": None}
    return {"block": mode == "on", "log": mode == "log", "status": status, "reason": reason}

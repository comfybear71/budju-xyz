"""Wallet-signature sign-in, session passes and the request gate (api/session_auth.py)."""

import os
import sys
import time
from unittest.mock import MagicMock, patch

import base58
import pytest
from nacl.signing import SigningKey

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
import session_auth as sa  # noqa: E402

ADMIN = "AdminWalletAddr1111111111111111111111111111"
USERW = "UserWalletAddr22222222222222222222222222222"
NOW = 1_800_000_000_000


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("SWYFTX_KEY_ENCRYPTION_SECRET", "unit-test-secret")
    monkeypatch.delenv("AUTH_ENFORCE", raising=False)


def real_wallet():
    """A real Ed25519 keypair; the 'wallet address' is the base58 public key, as on Solana."""
    sk = SigningKey.generate()
    return sk, base58.b58encode(bytes(sk.verify_key)).decode()


def verify_fn(wallet, message, signature):
    # same check database.verify_wallet_signature does
    from nacl.signing import VerifyKey
    from nacl.exceptions import BadSignatureError
    try:
        VerifyKey(base58.b58decode(wallet)).verify(message.encode(), bytes(signature))
        return True
    except BadSignatureError:
        return False


class TestSignIn:
    def test_real_signature_gets_a_pass_for_that_wallet(self):
        sk, wallet = real_wallet()
        msg = sa.login_message(wallet, NOW)
        sig = list(sk.sign(msg.encode()).signature)
        out = sa.create_session(wallet, msg, sig, verify_fn, now_ms=NOW)
        assert out["wallet"] == wallet
        assert sa.verify_token(out["token"], now_ms=NOW + 1000) == wallet

    def test_signature_from_a_different_key_is_rejected(self):
        _, wallet = real_wallet()
        other, _ = real_wallet()
        msg = sa.login_message(wallet, NOW)
        sig = list(other.sign(msg.encode()).signature)
        with pytest.raises(ValueError, match="Invalid signature"):
            sa.create_session(wallet, msg, sig, verify_fn, now_ms=NOW)

    def test_message_for_another_wallet_is_rejected(self):
        sk, wallet = real_wallet()
        _, victim = real_wallet()
        msg = sa.login_message(victim, NOW)          # attacker signs a message naming the victim
        sig = list(sk.sign(msg.encode()).signature)
        with pytest.raises(ValueError, match="does not match"):
            sa.create_session(wallet, msg, sig, verify_fn, now_ms=NOW)

    def test_stale_signature_is_rejected(self):
        sk, wallet = real_wallet()
        msg = sa.login_message(wallet, NOW)
        sig = list(sk.sign(msg.encode()).signature)
        with pytest.raises(ValueError, match="expired"):
            sa.create_session(wallet, msg, sig, verify_fn, now_ms=NOW + 11 * 60 * 1000)

    def test_missing_fields_rejected(self):
        with pytest.raises(ValueError):
            sa.create_session("", "", None, verify_fn)


class TestPass:
    def test_roundtrip_and_expiry(self):
        t = sa.mint_token(ADMIN, NOW)["token"]
        assert sa.verify_token(t, NOW + 1) == ADMIN
        assert sa.verify_token(t, NOW + sa.SESSION_TTL_MS + 1) is None

    def test_tampered_or_forged_pass_rejected(self):
        t = sa.mint_token(USERW, NOW)["token"]
        head, payload, sig = t.split(".")
        forged_payload = sa._b64e(b'{"w":"%s","exp":%d}' % (ADMIN.encode(), NOW + 10**9))
        assert sa.verify_token(f"{head}.{forged_payload}.{sig}", NOW + 1) is None
        assert sa.verify_token(t[:-3] + "AAA", NOW + 1) is None
        assert sa.verify_token("garbage", NOW) is None and sa.verify_token(None) is None

    def test_pass_from_a_different_secret_rejected(self, monkeypatch):
        t = sa.mint_token(ADMIN, NOW)["token"]
        monkeypatch.setenv("SWYFTX_KEY_ENCRYPTION_SECRET", "another-secret")
        assert sa.verify_token(t, NOW + 1) is None


def hdr(wallet):
    return "Bearer " + sa.mint_token(wallet, NOW)["token"]


A = {ADMIN}


class TestGate:
    def check(self, method, path, auth=None, params=None, body=None):
        return sa.check_request(method, path, params or {}, body or {}, auth, A, now_ms=NOW + 1)

    def test_public_routes_need_nothing(self):
        for m, p in [("GET", "/api/community/leaderboard"), ("GET", "/api/state"), ("GET", "/api/coin-stats"),
                     ("POST", "/api/user/register"), ("POST", "/api/auth/session"),
                     ("POST", "/api/trade/guard-check"), ("POST", "/api/desk/note")]:
            assert self.check(m, p)[0] is True, p

    def test_admin_post_without_a_pass_is_refused_even_with_the_public_admin_address(self):
        ok, status, _ = self.check("POST", "/api/state", body={"adminWallet": ADMIN})
        assert (ok, status) == (False, 401)

    def test_admin_post_with_admin_pass_is_allowed(self):
        assert self.check("POST", "/api/state", hdr(ADMIN), body={"adminWallet": ADMIN})[0] is True

    def test_non_admin_pass_cannot_do_admin_things(self):
        ok, status, _ = self.check("POST", "/api/state", hdr(USERW), body={"adminWallet": USERW})
        assert (ok, status) == (False, 403)

    def test_admin_pass_but_claiming_to_act_as_someone_else_is_refused(self):
        ok, status, _ = self.check("POST", "/api/state", hdr(ADMIN), body={"adminWallet": USERW})
        assert (ok, status) == (False, 403)

    def test_admin_get_routes(self):
        assert self.check("GET", "/api/admin/stats")[0] is False
        assert self.check("GET", "/api/admin/user-trade-debug", params={"admin_wallet": ADMIN})[1] == 401
        assert self.check("GET", "/api/admin/stats", hdr(ADMIN), params={"admin_wallet": ADMIN})[0] is True
        assert self.check("GET", "/api/users")[0] is False
        assert self.check("GET", "/api/desk/brief")[0] is False

    def test_transactions_admin_view_only(self):
        assert self.check("GET", "/api/transactions", params={"wallet": USERW})[0] is True
        assert self.check("GET", "/api/transactions", params={"wallet": ADMIN, "admin": "true"})[0] is False

    def test_all_perp_posts_are_admin_only(self):
        assert self.check("POST", "/api/perp/order", body={"wallet": ADMIN})[1] == 401
        assert self.check("GET", "/api/perp/positions")[0] is True      # reads stay public

    def test_owner_actions_need_that_wallets_own_pass(self):
        body = {"walletAddress": USERW, "apiKey": "k"}
        assert self.check("POST", "/api/user/swyftx-key", body=body)[1] == 401
        assert self.check("POST", "/api/user/swyftx-key", hdr(USERW), body=body)[0] is True
        assert self.check("POST", "/api/user/swyftx-key", hdr(ADMIN), body=body)[1] == 403   # not even admin may replace someone's key
        assert self.check("POST", "/api/user/swyftx-key/remove", hdr(ADMIN), body=body)[1] == 403

    def test_auto_trade_toggle_own_or_admin_acting_for_another(self):
        own = {"walletAddress": USERW, "enabled": True}
        assert self.check("POST", "/api/user/auto-trade", hdr(USERW), body=own)[0] is True
        assert self.check("POST", "/api/user/auto-trade", body=own)[1] == 401
        # admin acting on another wallet: requesterWallet is the admin and must match the pass
        for_other = {"walletAddress": USERW, "enabled": False, "requesterWallet": ADMIN}
        assert self.check("POST", "/api/user/auto-trade", hdr(ADMIN), body=for_other)[0] is True
        # attacker with a user pass claims to be the admin
        assert self.check("POST", "/api/user/auto-trade", hdr(USERW), body=for_other)[1] == 403

    def test_expired_pass_is_refused(self):
        old = "Bearer " + sa.mint_token(ADMIN, NOW - sa.SESSION_TTL_MS - 5)["token"]
        assert self.check("POST", "/api/state", old, body={"adminWallet": ADMIN})[1] == 401


class TestMode:
    def test_default_is_log(self):
        assert sa.auth_mode() == "log"

    @pytest.mark.parametrize("val,expected", [("off", "off"), ("ON", "on"), ("log", "log"), ("nonsense", "log"), ("", "log")])
    def test_values(self, monkeypatch, val, expected):
        monkeypatch.setenv("AUTH_ENFORCE", val)
        assert sa.auth_mode() == expected


class TestRolloutModes:
    BAD = dict(method="POST", path="/api/state", params={}, body={"adminWallet": ADMIN},
               auth_header=None, admin_wallets=A, now_ms=NOW)

    def test_off_never_checks(self):
        d = sa.evaluate(mode="off", **self.BAD)
        assert d == {"block": False, "log": False, "status": 200, "reason": None}

    def test_log_allows_but_flags(self):
        d = sa.evaluate(mode="log", **self.BAD)
        assert d["block"] is False and d["log"] is True and d["status"] == 401

    def test_on_blocks(self):
        d = sa.evaluate(mode="on", **self.BAD)
        assert d["block"] is True and d["status"] == 401

    def test_valid_pass_passes_in_every_mode(self):
        good = dict(self.BAD, auth_header="Bearer " + sa.mint_token(ADMIN, NOW)["token"])
        for mode in ("off", "log", "on"):
            d = sa.evaluate(mode=mode, **good)
            assert d["block"] is False and d["log"] is False

    def test_public_path_never_flagged(self):
        d = sa.evaluate("GET", "/api/community/leaderboard", {}, {}, None, A, mode="on", now_ms=NOW)
        assert d["block"] is False and d["log"] is False


class TestMemberAndCoinStatsRoutes:
    MEMBER = "MemberWalletAddr33333333333333333333333333"

    def check(self, method, path, auth=None, params=None, body=None, is_member=None):
        return sa.check_request(method, path, params or {}, body or {}, auth, A, now_ms=NOW + 1, is_member=is_member)

    def test_legacy_coin_stats_without_a_scope_stays_public(self):
        assert self.check("GET", "/api/coin-stats")[0] is True
        assert self.check("GET", "/api/coin-trades", params={"coin": "BTC"})[0] is True

    def test_mine_needs_the_owners_own_pass(self):
        p = {"scope": "mine", "wallet": USERW}
        assert self.check("GET", "/api/coin-stats", params=p)[1] == 401
        assert self.check("GET", "/api/coin-stats", hdr(USERW), params=p)[0] is True
        assert self.check("GET", "/api/coin-stats", hdr(ADMIN), params=p)[1] == 403   # nobody reads someone else's "mine"

    def test_everyone_is_for_members_and_admins_only(self):
        p = {"scope": "everyone", "wallet": self.MEMBER}
        assert self.check("GET", "/api/coin-stats", params=p)[1] == 401
        ok, status, reason = self.check("GET", "/api/coin-stats", hdr(self.MEMBER), params=p, is_member=lambda w: False)
        assert (ok, status) == (False, 403) and "Members only" in reason
        assert self.check("GET", "/api/coin-stats", hdr(self.MEMBER), params=p, is_member=lambda w: w == self.MEMBER)[0] is True
        assert self.check("GET", "/api/coin-stats", hdr(ADMIN), params={"scope": "everyone", "wallet": ADMIN})[0] is True

    def test_member_cannot_borrow_another_wallets_identity(self):
        p = {"scope": "everyone", "wallet": ADMIN}
        assert self.check("GET", "/api/coin-trades", hdr(self.MEMBER), params=p, is_member=lambda w: True)[1] == 403

    def test_leaderboard_holdings_are_member_only_not_admin_only(self):
        p = {"admin_wallet": self.MEMBER}
        assert self.check("GET", "/api/community/aggregate-holdings", params=p)[1] == 401
        assert self.check("GET", "/api/community/aggregate-holdings", hdr(self.MEMBER), params=p, is_member=lambda w: True)[0] is True
        assert self.check("GET", "/api/community/aggregate-holdings", hdr(USERW), params={"admin_wallet": USERW}, is_member=lambda w: False)[1] == 403

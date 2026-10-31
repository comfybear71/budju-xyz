"""Signals: plain-English verdict, SOL mint fix, webhook-URL re-sync (api/signals_status.py etc.)."""

import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

import copytrade_helius as h  # noqa: E402
from signals_status import compute_verdict  # noqa: E402

NOW = datetime(2026, 10, 31, 12, 0, 0)


def facts(**over):
    f = dict(trackedWallets=132, pendingWallets=132, activeWallets=0, webhookId="wh1",
             webhookUrl="https://www.budju.xyz/api/copytrade-webhook", pingsOk=0, pingsAuthFail=0,
             lastPingAt=None, events24h=0, eventsTotal=0, opened24h=0, closed24h=0, openPositions=0)
    f.update(over)
    return f


class TestVerdict:
    def test_no_wallets(self):
        v = compute_verdict(facts(trackedWallets=0), NOW)
        assert v["level"] == "error" and "No wallets" in v["headline"]

    def test_no_webhook(self):
        v = compute_verdict(facts(webhookId=None), NOW)
        assert v["level"] == "error" and "Helius" in v["headline"]

    def test_never_contacted_is_the_current_situation(self):
        v = compute_verdict(facts(), NOW)
        assert v["level"] == "error" and "never contacted" in v["headline"]
        assert "132 wallets" in v["detail"]

    def test_rejected_deliveries_point_at_the_secret(self):
        v = compute_verdict(facts(pingsAuthFail=7), NOW)
        assert "turned away" in v["headline"] and "COPYTRADE_WEBHOOK_SECRET" in v["detail"]

    def test_quiet_after_six_hours(self):
        v = compute_verdict(facts(pingsOk=5, lastPingAt=NOW - timedelta(hours=9)), NOW)
        assert v["level"] == "warn" and "Quiet" in v["headline"]

    def test_connected_but_no_swaps(self):
        v = compute_verdict(facts(pingsOk=5, lastPingAt=NOW - timedelta(minutes=20)), NOW)
        assert v["level"] == "warn" and "no swaps" in v["headline"]

    def test_swaps_but_every_buy_filtered(self):
        v = compute_verdict(facts(pingsOk=5, lastPingAt=NOW - timedelta(minutes=5), events24h=9), NOW)
        assert v["level"] == "warn" and "safety checks" in v["detail"]

    def test_working(self):
        v = compute_verdict(facts(pingsOk=50, lastPingAt=NOW - timedelta(minutes=2), events24h=40, opened24h=6, closed24h=3), NOW)
        assert v["level"] == "ok" and "40 swaps" in v["headline"]


class TestWebhookFixes:
    def test_webhook_url_defaults_to_the_www_host(self):
        assert h.COPYTRADE_WEBHOOK_URL.startswith("https://www.budju.xyz/")

    def test_sol_mint_is_the_real_wrapped_sol_address(self):
        assert h.SOL_MINT == "So11111111111111111111111111111111111111112" and len(h.SOL_MINT) == 43

    def test_changing_the_url_changes_the_hash_so_it_re_syncs(self):
        addrs = ["a", "b"]
        assert h.addresses_hash(addrs, "https://budju.xyz/x") != h.addresses_hash(addrs, "https://www.budju.xyz/x")
        assert h.addresses_hash(addrs, "u") == h.addresses_hash(["b", "a"], "u")   # order-independent

    def test_buy_paid_with_wrapped_sol_token_is_now_recognised(self):
        wallet = "TrackedWallet111111111111111111111111111111"
        tx = {"type": "SWAP", "signature": "sig1", "feePayer": wallet, "events": {"swap": {
            "tokenInputs": [{"userAccount": wallet, "mint": "So11111111111111111111111111111111111111112", "tokenAmount": 1}],
            "tokenOutputs": [{"userAccount": wallet, "mint": "MemeMint111111111111111111111111111111111", "tokenAmount": 5000}],
        }}}
        ev = h.parse_helius_swap(tx, {wallet})
        assert ev and ev["side"] == "buy" and ev["tokenMint"].startswith("MemeMint")

    def test_sell_received_as_wrapped_sol_token_is_now_recognised(self):
        wallet = "TrackedWallet111111111111111111111111111111"
        tx = {"type": "SWAP", "signature": "sig2", "feePayer": wallet, "events": {"swap": {
            "tokenInputs": [{"userAccount": wallet, "mint": "MemeMint111111111111111111111111111111111", "tokenAmount": 5000}],
            "tokenOutputs": [{"userAccount": wallet, "mint": "So11111111111111111111111111111111111111112", "tokenAmount": 1.2}],
        }}}
        ev = h.parse_helius_swap(tx, {wallet})
        assert ev and ev["side"] == "sell"

"""Backup puller + convergence + status verdict, with a fake database (no network)."""
import importlib.util
import os
import sys
import time
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from signals_status import compute_verdict  # noqa: E402

NOW = datetime(2026, 11, 2, 12, 0, 0)


def swap(sig, wallet, mint, age_s=60):
    return {"type": "SWAP", "signature": sig, "feePayer": wallet, "timestamp": int(time.time()) - age_s, "slot": 1,
            "events": {"swap": {"nativeInput": {"account": wallet, "amount": "1000000000"}, "tokenOutputs": [{"mint": mint, "userAccount": wallet, "tokenAmount": 5}]}}}


def load(tracked):
    db = MagicMock()
    db.get_trackable_copytrade_wallet_addresses.return_value = tracked
    db.get_copytrade_wallet.return_value = {}
    db.record_copytrade_event.return_value = True
    db.get_open_copytrade_position.return_value = None
    db.open_copytrade_position.return_value = {"id": 1}
    eng = MagicMock()
    eng.evaluate_entry.return_value = {"approved": True, "priceUsd": 1.0, "symbol": "ABC", "liquidityUsd": 9e6}
    eng.get_dexscreener_prices.return_value = {}
    eng.COPYTRADE_PAPER_SIZE_USD = 50
    with patch.dict("sys.modules", {"database": db, "copytrade_engine": eng}):
        spec = importlib.util.spec_from_file_location("cp_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "copytrade_process.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.send_telegram = MagicMock()
        return mod, db, eng


def test_recent_swap_is_copied_and_old_one_is_only_seen():
    mod, db, eng = load(["W1"])
    db.count_copytrade_buyers.return_value = 1
    mod.handle_delivery([swap("s1", "W1", "MINTA", 60)], max_age_s=1200)
    assert db.open_copytrade_position.call_count == 1
    mod.handle_delivery([swap("s2", "W1", "MINTB", 3 * 3600)], max_age_s=1200)
    assert db.open_copytrade_position.call_count == 1                     # the late one wasn't copied
    assert any(c.args[1] == "late" for c in db.set_copytrade_event_outcome.call_args_list)


def test_convergence_flags_event_and_alerts_once():
    mod, db, eng = load(["W1", "W2", "W3"])
    db.count_copytrade_buyers.return_value = 3
    db.claim_convergence_alert.side_effect = [True, False]
    mod.handle_delivery([swap("a", "W1", "MINTC")])
    mod.handle_delivery([swap("b", "W2", "MINTC")])
    assert db.set_copytrade_event_convergence.call_count == 2
    assert mod.send_telegram.call_args_list and sum("convergence" in c.args[0] for c in mod.send_telegram.call_args_list) == 1


def test_status_says_backup_checker_is_working_when_webhook_silent():
    facts = {"trackedWallets": 132, "webhookId": "x", "pingsOk": 0, "pingsAuthFail": 0, "events24h": 14, "opened24h": 3,
             "openPositions": 2, "lastPullAt": NOW - timedelta(minutes=3), "pullWallets": 12, "pullError": None}
    v = compute_verdict(facts, NOW)
    assert v["level"] == "ok" and "backup checker" in v["headline"]
    facts["lastPullAt"] = NOW - timedelta(hours=3)                         # puller stalled -> old error message returns
    assert compute_verdict(facts, NOW)["level"] == "error"

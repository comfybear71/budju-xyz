"""The admin banner's logic: why can't the bot trade (api/bot_status.py)."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from bot_status import compute_bot_status, record_cron_status  # noqa: E402

NOW = 1_800_000_000_000


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("TRADING_ENABLED", raising=False)
    monkeypatch.delenv("DRY_RUN", raising=False)


def healthy_state(**over):
    s = {
        "autoActive": {"isActive": True, "tierActive": {"1": True, "2": True, "3": True}},
        "autoCronStatus": {"ranAt": NOW - 120_000, "outcome": "ok", "walletsProcessed": 4, "walletsOptedIn": 4},
    }
    s.update(over)
    return s


def test_healthy_is_ok():
    r = compute_bot_status(healthy_state(), NOW)
    assert r["level"] == "ok" and r["messages"] == []
    assert r["lastRunAgo"] == "2 min ago"


def test_trading_enabled_false_is_error(monkeypatch):
    monkeypatch.setenv("TRADING_ENABLED", "false")
    r = compute_bot_status(healthy_state(), NOW)
    assert r["level"] == "error"
    assert "TRADING_ENABLED" in r["messages"][0]


def test_dry_run_is_warning(monkeypatch):
    monkeypatch.setenv("DRY_RUN", "true")
    r = compute_bot_status(healthy_state(), NOW)
    assert r["level"] == "warn" and "DRY RUN" in r["messages"][0]


def test_master_switch_off_is_error():
    r = compute_bot_status(healthy_state(autoActive={"isActive": False}), NOW)
    assert r["level"] == "error" and "Master switch" in r["messages"][0]


def test_all_tiers_stopped_is_error():
    r = compute_bot_status(healthy_state(autoActive={"isActive": True, "tierActive": {"1": False}}), NOW)
    assert r["level"] == "error" and "Every tier" in r["messages"][0]


def test_cron_not_running_is_error():
    st = healthy_state(autoCronStatus={"ranAt": NOW - 3 * 3_600_000, "outcome": "ok"})
    r = compute_bot_status(st, NOW)
    assert r["level"] == "error" and "has not run since 3 h ago" in r["messages"][0]


def test_last_run_skipped_reason_is_shown():
    st = healthy_state(autoCronStatus={"ranAt": NOW - 60_000, "outcome": "skipped",
                                       "reason": "No wallets have auto-trading enabled"})
    r = compute_bot_status(st, NOW)
    assert r["level"] == "error" and "No wallets have auto-trading enabled" in r["messages"][0]


def test_last_run_error_is_shown():
    st = healthy_state(autoCronStatus={"ranAt": NOW - 60_000, "outcome": "error", "reason": "boom"})
    assert "boom" in compute_bot_status(st, NOW)["messages"][0]


def test_unreadable_wallets_is_warning():
    st = healthy_state(autoCronStatus={"ranAt": NOW - 60_000, "outcome": "ok",
                                       "walletsProcessed": 2, "walletsOptedIn": 4})
    r = compute_bot_status(st, NOW)
    assert r["level"] == "warn" and "2 of 4" in r["messages"][0]


def test_no_heartbeat_yet_is_warning_not_error():
    r = compute_bot_status({"autoActive": {"isActive": True, "tierActive": {"1": True}}}, NOW)
    assert r["level"] == "warn"


class TestRecordCronStatus:
    def _rec(self, result):
        saved = {}
        record_cron_status(lambda s: saved.update(s), result, now_ms=NOW)
        return saved["autoCronStatus"]

    def test_ok(self):
        s = self._rec({"walletsProcessed": 3, "walletsOptedIn": 4, "tradesExecuted": 2})
        assert s["outcome"] == "ok" and s["tradesExecuted"] == 2 and s["ranAt"] == NOW

    def test_skipped(self):
        s = self._rec({"skipped": True, "reason": "Trading disabled via TRADING_ENABLED env var"})
        assert s["outcome"] == "skipped" and "TRADING_ENABLED" in s["reason"]

    def test_error(self):
        assert self._rec({"error": "Price fetch failed"})["outcome"] == "error"

    def test_save_failure_never_raises(self):
        def boom(_):
            raise RuntimeError("db down")
        record_cron_status(boom, {"walletsProcessed": 1})

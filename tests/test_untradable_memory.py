import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from untradable_memory import next_pause, initial_seen  # noqa: E402
from alerts import find_problems  # noqa: E402

DAY = 86_400_000
NOW = 1_800_000_000_000


def test_first_time_pauses_6h_and_alerts_then_repeats_are_24h_and_quiet():
    hours, alert, seen = next_pause({}, "BTT", NOW)
    assert (hours, alert) == (6.0, True) and seen["BTT"]["count"] == 1
    hours, alert, seen = next_pause(seen, "BTT", NOW + 6 * 3_600_000)
    assert (hours, alert) == (24.0, False) and seen["BTT"]["count"] == 2
    hours, alert, seen = next_pause(seen, "BTT", NOW + 40 * 3_600_000)
    assert (hours, alert) == (24.0, False)


def test_a_coin_quiet_for_over_7_days_is_reported_again_and_old_memory_is_forgotten():
    _, _, seen = next_pause({}, "XMR", NOW)
    hours, alert, seen = next_pause(seen, "XMR", NOW + 8 * DAY)
    assert (hours, alert) == (6.0, True)
    _, _, seen = next_pause(seen, "DASH", NOW + 8 * DAY)
    _, alert, seen = next_pause(seen, "BTT", NOW + 50 * DAY)           # DASH/XMR not seen for 30+ days: dropped from memory
    assert "DASH" not in seen and alert is True


def test_input_is_never_changed_and_junk_is_ignored():
    before = {"BTT": {"first": NOW, "last": NOW, "count": 1}, "BAD": "junk"}
    next_pause(before, "BTT", NOW + 1000)
    assert before["BTT"]["count"] == 1
    assert next_pause({"BAD": "junk"}, "ETH", NOW)[1] is True


def test_known_off_coins_start_quiet_and_the_log_lines_match_the_alert_rules():
    seen = initial_seen(NOW)
    assert all(next_pause(seen, c, NOW + 6 * 3_600_000)[1] is False for c in ("BTT", "DASH", "XMR"))
    assert find_problems(["BTT: paused for 6h — Swyftx says it is not tradable right now"])           # the first-time line alerts
    assert not find_problems(["BTT: still switched off on Swyftx, paused another 24h (already reported, no new alert)"])   # the repeat line does not

import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from paper_test import coin_status, weekly_review, what_if_off, paper_call  # noqa: E402


def test_status_rules():
    assert coin_status(-12, -3, 40, core=True) == "core"
    assert coin_status(-12, -3, 40, core=False) == "weak"
    assert coin_status(-12, +4, 40, core=False) == "neutral"       # recovering lately: not weak
    assert coin_status(+9, +2, 40, core=False) == "strong"
    assert coin_status(-20, -20, 3, core=False) == "thin"          # too few dips to judge


def test_two_weeks_in_a_row_needed_to_switch_off_and_two_to_come_back():
    st = {}
    st = weekly_review({"DOGE": "weak"}, ["DOGE"], st, "2026-11-09")
    assert "DOGE" not in st["off"]                                  # one weak week isn't enough
    st = weekly_review({"DOGE": "weak"}, ["DOGE"], st, "2026-11-16")
    assert st["off"]["DOGE"]["since"] == "2026-11-16" and paper_call("DOGE", "weak", st) == "off"
    st = weekly_review({"DOGE": "neutral"}, ["DOGE"], st, "2026-11-23")
    assert "DOGE" in st["off"]                                      # one ok week isn't enough to bring it back
    st = weekly_review({"DOGE": "neutral"}, ["DOGE"], st, "2026-11-30")
    assert "DOGE" not in st["off"]


def test_strong_coin_not_in_tiers_becomes_an_on_suggestion_after_two_weeks():
    st = weekly_review({"NEWC": "strong"}, [], {}, "d1")
    st = weekly_review({"NEWC": "strong"}, [], st, "d2")
    assert "NEWC" in st["on"] and paper_call("NEWC", "strong", st) == "on"


def test_what_if_off_values_only_buys_after_the_flag_date():
    buys = [{"qty": 10, "price": 1.0, "ts": "2026-11-01T00:00:00"}, {"qty": 10, "price": 2.0, "ts": "2026-11-20T00:00:00"}]
    assert what_if_off(buys, "2026-11-10", 1.5) == -5.0             # the later buy lost 0.5 x 10: switching off would have saved $5

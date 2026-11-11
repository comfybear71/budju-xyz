import math
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from accum_lab import SCENARIOS, simulate, run_lab, verdict


def wave(n=365, start=100.0, drift=0.0, amp=0.12):
    return [start * (1 + drift) ** i * (1 + amp * math.sin(i / 9.0)) for i in range(n)]


def test_full_base_buy_matches_weekly_buying():
    sc = {"group": "x", "label": "x", "tiers": SCENARIOS["today"]["tiers"], "sell": "fixed", "base": 1.0}
    r = simulate(wave(), sc)
    assert abs(r["qtyVsDca"]) < 1e-9


def test_never_sell_makes_no_sells_and_keeps_more_coins_in_a_rally():
    s = wave(drift=0.004, amp=0.15)
    sell = simulate(s, SCENARIOS["today"])
    never = simulate(s, SCENARIOS["sell_never"])
    assert never["qty"] >= sell["qty"]


def test_dip_buying_idles_cash_in_a_rally():
    r = simulate(wave(drift=0.005, amp=0.02), SCENARIOS["today"])
    assert r["idlePct"] > 0.3 and r["qtyVsDca"] < 0


def test_run_lab_shape_and_every_scenario_present():
    out = run_lab({"AAA": wave(), "BBB": wave(drift=-0.002), "SHORT": wave(100)})
    assert out["coins"] == 2 and set(out["scenarios"]) == set(SCENARIOS)
    assert all(v["coinsTested"] == 2 for v in out["scenarios"].values())
    assert isinstance(out["verdict"]["text"], str)


def test_verdict_requires_both_halves():
    base = {"coinsTested": 5, "coinsVsDca": -5.0, "h1": -5.0, "h2": -5.0}
    good = {"coinsTested": 5, "coinsVsDca": 2.0, "h1": -1.0, "h2": 1.0, "label": "A"}
    lopsided = {"coinsTested": 5, "coinsVsDca": 4.0, "h1": 9.0, "h2": -6.0, "label": "B"}
    v = verdict({"today": base, "a": good, "b": lopsided})
    assert [w["key"] for w in v["winners"]] == ["a"]


def test_too_short_series_returns_none():
    assert simulate([1.0] * 10, SCENARIOS["today"]) is None

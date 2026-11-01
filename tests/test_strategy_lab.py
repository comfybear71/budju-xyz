import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from strategy_lab import VARIANTS, run_lab, simulate  # noqa: E402


def wave(n=300, base=100.0, amp=0.25, period=40):
    return [base * (1 + amp * math.sin(2 * math.pi * i / period)) for i in range(n)]


def up_after_dips(n=360):
    """Dips of ~8% then a long strong uptrend: selling early costs money."""
    out, p = [], 100.0
    for i in range(n):
        p *= 0.985 if i < 20 else 1.012
        out.append(p)
    return out


def test_never_negative_and_buys_on_dips_sells_on_rallies():
    for key, var in VARIANTS.items():
        r = simulate(wave(), var)
        assert r["final"] > 0 and 0 <= r["cashPct"] <= 1.0
    r = simulate(wave(), VARIANTS["current"])
    assert r["buys"] > 0 and r["sells"] > 0


def test_fees_reduce_the_result():
    free = simulate(wave(), VARIANTS["current"], fee=0.0)["final"]
    paid = simulate(wave(), VARIANTS["current"], fee=0.01)["final"]
    assert paid < free


def test_in_a_strong_uptrend_holding_winners_beats_selling_early():
    s = up_after_dips()
    cur = simulate(s, VARIANTS["current"])["ret"]
    hold_winners = simulate(s, VARIANTS["uptrend"])["ret"]
    assert hold_winners >= cur


def test_run_lab_aggregates_and_skips_short_series():
    lab = run_lab({"AAA": wave(), "BBB": up_after_dips(), "SHORT": [1.0] * 50})
    assert lab["coins"] == 2 and lab["skipped"] == ["SHORT"]
    assert set(lab["variants"]) == set(VARIANTS)
    assert sum(lab["bestCounts"].values()) == 2
    assert all("avgH1" in v and "avgH2" in v for v in lab["variants"].values())

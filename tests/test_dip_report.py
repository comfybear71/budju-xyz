import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from dip_report import simulate_tier, coin_report, build_report  # noqa: E402


def wave(n=120, lo=90.0, hi=100.0):
    out = []
    for i in range(n):
        out.append(hi if (i // 10) % 2 == 0 else lo)
    return out


def test_dip_and_recovery_counted():
    closes = [100.0] * 20 + [94.0] * 5 + [107.0] * 35
    r = simulate_tier(closes, 5.0, 12.5)
    assert r["buys"] == 1 and r["sells"] == 1 and r["open"] == 0
    assert r["netPct"] == 12.5


def test_never_recovers_stays_open_and_negative():
    closes = [100.0] * 20 + [90.0] * 50 + [60.0] * 20
    r = simulate_tier(closes, 5.0, 12.5)
    assert r["open"] >= 1 and r["netPct"] < 0


def test_report_ranks_and_skips_short_history():
    series = {"UP": [100 + (i % 7) * 3 for i in range(200)], "TINY": [1.0] * 10}
    rep = build_report(series, denylist={"UP"})
    assert [c["coin"] for c in rep["coins"]] == ["UP"]
    assert rep["coins"][0]["focus"] is False

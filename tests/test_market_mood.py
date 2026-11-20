import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from market_mood import breadth, classify, count_waiting, drawdown_pct, made_new_low  # noqa: E402


def fall(n=60, start=100.0, step=-1.0):
    return [start + step * i for i in range(n)]


def flat_then(n_flat=55, level=100.0, tail=None):
    return [level] * n_flat + (tail or [])


def test_drawdown_and_new_low_helpers():
    assert round(drawdown_pct([100] * 29 + [80]), 1) == -20.0
    assert made_new_low(fall(), 2) is True                              # a straight fall makes new lows every day
    assert made_new_low(flat_then(tail=[100, 100]), 2) is False         # flat is not a new low
    rising = [100 + i for i in range(60)]
    assert made_new_low(rising, 3) is False


def test_breadth_counts_coins_well_below_their_30_day_high():
    series = {"A": [100] * 40 + [70] * 10, "B": [100] * 50, "C": [10] * 5}      # C is too short to count
    b = breadth(series)
    assert b["coins"] == 2 and b["down"] == 1


def test_count_waiting_only_counts_triggered_uncooled_active_signals():
    assignments = {"BTC": [1, 2], "ETH": [1], "BAD": [1]}
    tier_active = {"1": True, "2": False}
    targets = {"BTC:1": {"buy": 60000}, "ETH:1": {"buy": 3000}, "BAD:1": {"buy": 5}}
    prices = {"BTC": 59000, "ETH": 3500, "BAD": 1}
    r = count_waiting(assignments, tier_active, targets, {}, prices, skip={"BAD"}, now_ms=1000)
    assert r == {"active": 2, "waiting": 1}                              # BTC:1 triggered; ETH not yet; BTC:2 tier is off; BAD skipped
    r = count_waiting(assignments, tier_active, targets, {"BTC:1": 5000}, prices, skip={"BAD"}, now_ms=1000)
    assert r["waiting"] == 0                                             # cooling down: it already bought


def _coins(n, series):
    return {f"C{i}": list(series) for i in range(n)}


def test_blood_on_the_street_but_still_falling_is_orange():
    down = [100] * 40 + [100 - 1.5 * i for i in range(20)]               # falling every day: new lows now
    out = classify(down, _coins(20, down), 18, {"waiting": 15, "active": 100}, 6)
    assert out["state"] == "falling" and "third" in out["advice"]
    assert any("waiting for cash: 15" in line and "was 6" in line for line in out["lines"])


def test_discounted_and_settled_is_green():
    # a big drop, then a week of calm: no new 14-day lows in the last 4 days
    bottom = [100] * 30 + [100 - 3 * i for i in range(10)] + [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89]
    out = classify(bottom, _coins(20, bottom), 22, {"waiting": 2, "active": 100}, 10)
    assert out["state"] == "good"


def test_falling_without_fear_or_discount_is_red_wait():
    gentle = [100] * 50 + [100, 99.5, 99, 98.5, 98.2, 98, 97.8, 97.6, 97.5, 97.4]     # small dip, new lows, no fear
    out = classify(gentle, _coins(20, gentle), 55, {"waiting": 0, "active": 100})
    assert out["state"] == "wait"


def test_quiet_market_is_neutral_and_frothy_says_so():
    calm = [100 + 0.2 * (i % 3) for i in range(60)]
    assert classify(calm, _coins(20, calm), 50, {"waiting": 0, "active": 100})["state"] == "neutral"
    rising = [100 + i * 0.5 for i in range(60)]
    out = classify(rising, _coins(20, rising), 82, {"waiting": 0, "active": 100})
    assert out["state"] == "wait" and "frothy" in out["advice"]


def test_missing_fear_and_greed_still_works():
    calm = [100] * 60
    out = classify(calm, _coins(10, calm), None, {"waiting": 0, "active": 50})
    assert out["state"] == "neutral" and any("not available" in line for line in out["lines"])

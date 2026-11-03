import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from after_sales import after_sales  # noqa: E402
from trailing import clean_config, decide_all, step  # noqa: E402

NOW = 10_000_000_000


def test_arms_at_the_sell_level_waits_while_rising_and_sells_on_a_pullback():
    d, st = step(105.0, 110.0, None, 5, 25, NOW)
    assert d == "none" and st is None                                  # below the sell level: nothing
    d, st = step(111.0, 110.0, None, 5, 25, NOW)
    assert d == "wait" and st["high"] == 111.0                         # reached it: armed, don't sell yet
    d, st = step(120.0, 110.0, st, 5, 25, NOW + 1)
    assert d == "wait" and st["high"] == 120.0                         # still running: higher high
    d, st = step(113.0, 110.0, st, 5, 25, NOW + 2)
    assert d == "sell"                                                 # fell 5.8% from the high: sell now


def test_hard_cap_sells_even_while_still_rising():
    d, _ = step(140.0, 110.0, {"high": 139.0, "at": NOW}, 5, 25, NOW)   # 140 >= 110 * 1.25
    assert d == "sell"


def test_stale_armed_state_is_dropped():
    d, st = step(100.0, 110.0, {"high": 150.0, "at": NOW - 15 * 24 * 3_600_000}, 5, 25, NOW)
    assert d == "none" and st is None


def test_config_is_clamped_and_off_by_default():
    assert clean_config(None)["enabled"] is False
    c = clean_config({"enabled": True, "pullbackPct": 500, "capPct": -3})
    assert c["pullbackPct"] == 20.0 and c["capPct"] == 5.0


def test_decide_all_is_per_signal():
    targets = {"BTC:1": {"sell": 110.0}, "BTC:2": {"sell": 130.0}}
    cfg = clean_config({"enabled": True})
    dec, st = decide_all([("BTC", 1), ("BTC", 2)], {"BTC": 115.0}, targets, {}, cfg, NOW)
    assert dec == {"BTC:1": "wait", "BTC:2": "none"} and "BTC:1" in st and "BTC:2" not in st


def test_after_sales_tracks_what_the_price_did_next():
    day = 86400
    series = {"AAA": [100, 100, 100, 100, 100, 100, 100, 100, 110, 120, 130]}   # 11 daily closes, last = today
    sells = [{"coin": "AAA", "qty": 2, "price": 100.0, "ts": NOW - 8 * day}]
    out = after_sales(sells, series, NOW)
    r = out["recent"][0]
    assert r["daysAgo"] == 8 and r["after"]["7"] == 20.0 and r["nowPct"] == 30.0 and r["maxAfterPct"] == 30.0
    assert out["overall"]["higher7"] == 1 and out["overall"]["worth7"] == 40.0     # 2 coins x $100 x +20%

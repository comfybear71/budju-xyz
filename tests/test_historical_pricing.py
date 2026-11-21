import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from historical_pricing import day_key, rate_on, daily_series, fx_series_from_frankfurter, price_amount  # noqa: E402

FX = {"2026-03-02": 0.640, "2026-03-03": 0.642, "2026-03-06": 0.650, "2026-03-09": 0.655}      # no weekend days, like the real feed


def test_day_key_from_iso_milliseconds_seconds_and_junk():
    assert day_key("2026-03-02T05:06:07Z") == "2026-03-02"
    assert day_key(1_772_409_600_000) == day_key(1_772_409_600) == "2026-03-02"
    assert day_key("garbage") is None and day_key(None) is None


def test_rate_on_uses_the_day_then_the_last_earlier_day_then_the_first_day():
    assert rate_on(FX, "2026-03-03T10:00:00Z") == 0.642
    assert rate_on(FX, "2026-03-07T10:00:00Z") == 0.650           # a Saturday: Friday's rate
    assert rate_on(FX, "2026-02-01T00:00:00Z") == 0.640           # before the series starts: its first day
    assert rate_on({}, "2026-03-03") is None and rate_on(None, "2026-03-03") is None


def test_aud_deposit_is_valued_at_the_rate_on_its_day_not_todays():
    today = 0.6563
    historical = price_amount(5000, "AUD", "2026-03-06T00:00:00Z", today, {}, FX, None)
    assert historical == 3250.0                                    # 5000 x 0.650
    assert price_amount(5000, "AUD", "2026-03-06T00:00:00Z", today, {}, None, None) == round(5000 * today, 2)      # no history: today's rate


def test_crypto_transfer_is_valued_at_its_day_price_so_a_fall_does_not_shrink_old_transfers():
    px = {"BTC": {"2026-03-02": 90000.0, "2026-03-09": 85000.0}}
    now = {"BTC": 56000.0}
    out = price_amount(0.05, "BTC", "2026-03-02T00:00:00Z", 0.65, now, FX, px)
    assert out == 4500.0                                           # 0.05 BTC when BTC was $90,000, not $2,800 at today's price
    assert price_amount(0.05, "BTC", "2026-03-02T00:00:00Z", 0.65, now, FX, None) == 2800.0        # fallback is today's price
    assert price_amount(1, "ZZZ", "2026-03-02", 0.65, now, FX, px) is None                           # unknown coin, no price


def test_usd_stable_coins_are_one_to_one_and_series_parsers_are_tolerant():
    assert price_amount(100.123, "USDC", "2026-03-02", 0.65, {}) == 100.12
    assert daily_series([[1_772_409_600_000, 10], [1_772_409_700_000, 11], [1_772_496_000_000, 12], ["x"], [1, 0]]) == {"2026-03-02": 11.0, "2026-03-03": 12.0}
    assert fx_series_from_frankfurter({"rates": {"2026-03-02": {"USD": 0.64}, "2026-03-03": {"EUR": 1}}}) == {"2026-03-02": 0.64}

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from leverage_check import parse, assess, HOURS_PER_YEAR  # noqa: E402

HOURLY_11APR = 0.0000125                      # Hyperliquid's default: 0.00125% an hour = about 10.95% a year


def ctx(px=100.0, oi=1_000_000.0, funding=HOURLY_11APR, prev=100.0, vol=5e8):
    return {"markPx": str(px), "openInterest": str(oi), "funding": str(funding), "prevDayPx": str(prev), "dayNtlVlm": str(vol)}


def payload(**coins):
    names = list(coins)
    return [{"universe": [{"name": n, "szDecimals": 3} for n in names]}, [coins[n] for n in names]]


def snap(oi_usd=100e6, funding=HOURLY_11APR, px=100.0, prev=100.0):
    return {"funding": funding, "px": px, "prevPx": prev, "oiUsd": oi_usd, "volUsd": 1e8}


def test_parse_reads_the_hyperliquid_reply_and_skips_unreadable_rows():
    out = parse(payload(BTC=ctx(px=58000, oi=20000), ETH=ctx(px="bad"), SOL={"markPx": "70"}))
    assert set(out) == {"BTC"} and out["BTC"]["oiUsd"] == 58000 * 20000 and out["BTC"]["funding"] == HOURLY_11APR
    assert parse(None) == {} and parse([]) == {} and parse([{"universe": "x"}, []]) == {}


def test_normal_funding_and_no_history_is_normal_and_says_the_change_is_not_known_yet():
    now = {c: snap() for c in ("BTC", "ETH", "SOL")}
    a = assess(now, None)
    assert a["signal"] == "normal" and a["oiChangePct"] is None and abs(a["fundingAprPct"] - HOURLY_11APR * HOURS_PER_YEAR * 100) < 0.1
    assert any("once a day of readings" in line for line in a["lines"]) and len(a["coins"]) == 3


def test_negative_funding_with_leverage_being_cleared_is_washed_out():
    now = {c: snap(oi_usd=85e6, funding=-0.000004) for c in ("BTC", "ETH", "SOL")}        # about -3.5% a year
    before = {c: snap(oi_usd=100e6) for c in ("BTC", "ETH", "SOL")}
    a = assess(now, before)
    assert a["signal"] == "washed_out" and a["oiChangePct"] == -15.0
    assert any("negative" in line for line in a["lines"]) and any("closed or liquidated" in line for line in a["lines"])


def test_low_funding_after_a_big_one_day_fall_is_washed_out_even_without_history():
    now = {c: snap(funding=0.0000010, px=90.0, prev=100.0) for c in ("BTC", "ETH", "SOL")}   # -10% on the day, funding about +0.9% a year
    assert assess(now, None)["signal"] == "washed_out"


def test_very_high_funding_is_crowded_and_a_rising_open_interest_is_building():
    hot = {c: snap(funding=0.00006) for c in ("BTC", "ETH", "SOL")}                          # about 53% a year
    assert assess(hot, None)["signal"] == "crowded"
    now = {c: snap(oi_usd=112e6, funding=0.00002) for c in ("BTC", "ETH", "SOL")}            # about 17.5% a year, open interest +12%
    before = {c: snap(oi_usd=100e6) for c in ("BTC", "ETH", "SOL")}
    a = assess(now, before)
    assert a["signal"] == "building" and a["oiChangePct"] == 12.0


def test_missing_coins_are_tolerated_and_nothing_available_is_unknown():
    a = assess({"BTC": snap()}, {"BTC": snap(oi_usd=50e6)})
    assert a["signal"] in ("normal", "building") and list(a["coins"]) == ["BTC"]
    u = assess({}, None)
    assert u["signal"] == "unknown" and u["lines"] == []
    assert assess({"ETH": snap()}, {"ZZZ": snap()})["oiChangePct"] is None                   # no matching earlier coin: no change shown

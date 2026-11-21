import os, sys
from datetime import datetime, timedelta
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from coin_cap import recent_buys, day_budget, cap_amount, COIN_CAP_FLOOR  # noqa: E402
from topup_preview import simulate  # noqa: E402

NOW_DT = datetime.utcnow()
NOW = int(NOW_DT.timestamp() * 1000)


def entry(coin, usd, hours_ago, side="buy"):
    return {"coin": coin, "side": side, "qty": 1, "price": usd, "timestamp": (NOW_DT - timedelta(hours=hours_ago)).isoformat() + "Z"}


def test_recent_buys_counts_only_buys_in_the_last_24_hours():
    log = [entry("HYPE", 100, 1), entry("HYPE", 50, 23), entry("HYPE", 999, 30), entry("HYPE", 40, 2, "sell"), entry("TAO", 10, 5)]
    assert recent_buys(log, NOW) == {"HYPE": 150.0, "TAO": 10.0}


def test_cap_is_a_percent_of_cash_plus_what_was_bought_today_with_a_floor():
    assert cap_amount(day_budget(3500, {"X": 500}), 10) == 400.0
    assert cap_amount(100, 10) == COIN_CAP_FLOOR              # small wallets are never starved by the %
    assert cap_amount(5000, 0) is None                        # 0 switches it off


def test_preview_stops_one_coin_taking_a_big_share_across_its_tiers():
    pairs = [("HYPE", 3), ("HYPE", 2), ("HYPE", 1), ("OTHER", 1)]
    prices = {"HYPE": 90, "OTHER": 95}
    targets = {f"{c}:{t}": {"buy": 100} for c, t in pairs}
    out = simulate(3500, pairs, prices, targets, {}, {1: {"allocation": 5}, 2: {"allocation": 10}, 3: {"allocation": 15}}, NOW, set(),
                   daily_limit=10**9, coin_cap_pct=10.0)
    hype = sum(r["amount"] for r in out["rows"] if r["coin"] == "HYPE")
    assert hype <= 350.01                                                # 10% of $3,500, all three tiers together
    assert any(r["coin"] == "OTHER" for r in out["rows"])               # the rest of the cash flows on to other coins


def test_coin_bought_earlier_today_counts_against_its_cap():
    pairs = [("HYPE", 1)]
    out = simulate(3500, pairs, {"HYPE": 90}, {"HYPE:1": {"buy": 100}}, {}, {1: {"allocation": 5}}, NOW, set(), daily_limit=10**9,
                   coin_cap_pct=10.0, recent_by_coin={"HYPE": 385.0})
    assert out["buys"] == 0 and "Coin limit" in out["waiting"][0]["why"]

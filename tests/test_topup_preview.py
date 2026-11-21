import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from topup_preview import simulate  # noqa: E402

NOW = 1_800_000_000_000
TIERS = {1: {"allocation": 5}, 2: {"allocation": 10}, 3: {"allocation": 15}}


def sim(usdc, coins, **kw):
    """coins: {coin: {tier: (price, buy)}}"""
    pairs, prices, targets = [], {}, {}
    for c, tiers in coins.items():
        for t, (price, buy) in tiers.items():
            pairs.append((c, t))
            prices[c] = price
            targets[f"{c}:{t}"] = {"buy": buy, "sell": buy * 2}
    return simulate(usdc, pairs, prices, targets, kw.pop("cooldowns", {}), TIERS, NOW, kw.pop("skip", set()), **kw)


def test_first_buy_is_tier_percent_of_cash_and_cash_shrinks():
    out = sim(1000, {"A": {1: (90, 100)}, "B": {1: (95, 100)}})
    assert [r["coin"] for r in out["rows"]] == ["A", "B"]            # deepest discount first
    assert out["rows"][0]["amount"] == 50.0 and out["rows"][1]["amount"] == 47.5
    assert out["cashLeft"] == round(1000 - 50 - 47.5, 2)


def test_buys_over_the_single_buy_limit_are_left_waiting_until_cash_is_lower():
    out = sim(3250, {"A": {1: (90, 100), 2: (90, 100), 3: (90, 100)}})
    assert [(r["coin"], r["tier"]) for r in out["rows"]] == [("A", 1)]       # 5% = $162.50 fits; 10% ($325) and 15% ($487) do not
    assert out["waitingCount"] == 2 and all("single-buy limit" in w["why"] for w in out["waiting"])


def test_paused_skipped_and_not_yet_reached_signals_are_not_listed():
    out = sim(1000, {"PAUSED": {1: (90, 100)}, "SKIP": {1: (90, 100)}, "HIGH": {1: (110, 100)}, "OK": {1: (90, 100)}},
              cooldowns={"PAUSED:1": NOW + 5000}, skip={"SKIP"})
    assert [r["coin"] for r in out["rows"]] == ["OK"] and out["waitingCount"] == 0


def test_stops_at_the_cash_reserve_and_at_the_daily_limit():
    coins = {f"C{i}": {1: (90 - i * 0.01, 100)} for i in range(40)}
    out = sim(100, coins)                      # $8 minimum buys, $30 kept spare => about 8 buys
    assert out["cashLeft"] >= 30 and out["buys"] < 40 and out["waitingCount"] > 0
    out2 = sim(1000, coins, spent24h=2990, daily_limit=3000)
    assert out2["buys"] == 0 or out2["total"] <= 10


def test_runs_needed_counts_about_18_buys_per_run():
    coins = {f"C{i}": {1: (90 - i * 0.01, 100)} for i in range(40)}
    out = sim(100000, coins, max_single=10_000, daily_limit=10**9)
    assert out["buys"] == 40 and out["runsNeeded"] == 3

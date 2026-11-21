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


def test_buys_over_the_single_buy_limit_are_capped_at_the_limit_not_skipped():
    out = sim(3250, {"A": {1: (90, 100), 2: (90, 100), 3: (90, 100)}})
    assert [(r["coin"], r["tier"], r["amount"], r["capped"]) for r in out["rows"]] == [
        ("A", 3, 250.0, True), ("A", 2, 250.0, True), ("A", 1, 0.05 * (3250 - 500), False)]     # T3 first (tie on discount), then T2, then T1
    assert out["waitingCount"] == 0


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


def test_per_coin_cap_limits_a_shit_list_coin_but_not_the_minimum():
    out = sim(3000, {"BAD": {1: (90, 100)}, "GOOD": {1: (91, 100)}}, cap_fn=lambda c: 50.0 if c == "BAD" else None)
    amounts = {r["coin"]: r["amount"] for r in out["rows"]}
    assert amounts["BAD"] == 50.0 and amounts["GOOD"] > 100

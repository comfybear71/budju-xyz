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


def group_by_prefix(coin):
    return {"T": 0, "I": 1, "F": 2, "H": 3}.get(coin[0], 4)          # T=Top 10, I=Innovation, F=Top 50, H=Top 200, anything else Smaller


def test_group_allowance_is_cumulative_so_unused_shares_flow_down():
    from coin_cap import group_allowance
    assert [group_allowance(g, 1000) for g in range(5)] == [500, 700, 850, 950, 1000]


def test_coin_limit_by_group_and_group_limit_reasons():
    from coin_cap import check_room
    room, why = check_room("T1", group_by_prefix, {}, 3500)
    assert why is None and room == 350.0                                    # Top 10 coin: 10% of $3,500
    room, why = check_room("S1", group_by_prefix, {}, 3500)
    assert why is None and room == 70.0                                     # Smaller coin: 2%
    room, why = check_room("S1", group_by_prefix, {"S1": 70.0}, 3500)
    assert room == 0 and "Coin limit" in why
    # the Top 10 group has used its whole 50% ($1,750), so a Top 10 coin with no spend of its own is stopped by the GROUP limit
    spent = {f"T{i}": 350.0 for i in range(5)}
    room, why = check_room("T9", group_by_prefix, spent, 3500)           # $1,750 spent + $1,750 cash = a $3,500 day
    assert room == 0 and "Group limit" in why


def test_preview_top_10_gets_most_and_small_coins_get_little_but_unused_money_flows_down():
    from topup_preview import simulate
    tiers = {1: {"allocation": 5}, 2: {"allocation": 10}, 3: {"allocation": 15}}
    coins = [f"T{i}" for i in range(8)] + [f"S{i}" for i in range(30)]
    pairs = [(c, t) for c in coins for t in (1, 2, 3)]
    prices = {c: 90 for c in coins}
    targets = {f"{c}:{t}": {"buy": 100} for c, t in pairs}
    out = simulate(3500, pairs, prices, targets, {}, tiers, NOW, set(), daily_limit=10**9, max_single=10**9, group_fn=group_by_prefix)
    by = {}
    for r in out["rows"]:
        by[r["coin"]] = by.get(r["coin"], 0) + r["amount"]
    assert all(by.get(f"T{i}", 0) <= 350.01 for i in range(8))              # Top 10 coin: at most 10%
    assert all(by.get(f"S{i}", 0) <= 70.01 for i in range(30))              # Smaller coin: at most 2%
    top10 = sum(v for c, v in by.items() if c.startswith("T"))
    assert top10 <= 1750.01                                                   # the group's own 50% share
    # only Top 10 and Smaller coins are eligible here, so Top 10's cap + flow-down means Smaller may use the unused money above it
    smaller = sum(v for c, v in by.items() if c.startswith("S"))
    assert smaller <= 3500 - top10 + 0.01

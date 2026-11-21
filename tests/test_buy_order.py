import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from buy_order import discount_pct, order_pairs  # noqa: E402


def test_discount():
    assert round(discount_pct(90, 100), 1) == 10.0
    assert discount_pct(110, 100) == 0.0
    assert discount_pct(0, 100) == 0.0


def test_deepest_discount_first_then_bigger_tier_then_name():
    targets = {"A:1": {"buy": 100}, "B:1": {"buy": 100}, "C:1": {"buy": 100}, "C:3": {"buy": 100}, "D:1": {"buy": 100}}
    prices = {"A": 98, "B": 90, "C": 98, "D": 120}
    out = order_pairs([("A", 1), ("B", 1), ("C", 1), ("C", 3), ("D", 1)], prices, targets)
    assert out == [("B", 1), ("C", 3), ("A", 1), ("C", 1), ("D", 1)]


def test_missing_target_is_last_and_does_not_crash():
    out = order_pairs([("X", 1), ("B", 1)], {"X": 5, "B": 90}, {"B:1": {"buy": 100}})
    assert out == [("B", 1), ("X", 1)]


def test_groups_match_the_holdings_screen():
    from buy_order import group_of
    assert group_of("BTC", 50) == 0                      # BTC / ETH / SOL are always in the first group
    assert group_of("XRP", 4) == 0 and group_of("XRP") == 0           # rank 1-10, or the built-in list when rank is unknown
    assert group_of("SUI", 30) == 1                      # Innovation beats a Top 50 rank
    assert group_of("AAVE", 30) == 2 and group_of("QNT", 120) == 3 and group_of("RAY", 300) == 4 and group_of("RAY") == 4


def test_top_10_first_core_first_inside_it_then_innovation_top_50_top_200_smaller():
    targets = {f"{c}:1": {"buy": 100} for c in ("RAY", "QNT", "AAVE", "SUI", "XRP", "BTC", "ETH", "SOL")}
    prices = {"RAY": 80, "QNT": 82, "AAVE": 84, "SUI": 86, "XRP": 90, "BTC": 98, "ETH": 95, "SOL": 99}
    ranks = {"RAY": 300, "QNT": 120, "AAVE": 30, "SUI": 25, "XRP": 5, "BTC": 1, "ETH": 2, "SOL": 6}
    out = order_pairs([(c, 1) for c in prices], prices, targets, ranks)
    # core by discount (ETH 5%, BTC 2%, SOL 1%), then the rest of the Top 10 (XRP), Innovation, Top 50, Top 200, Smaller
    assert [c for c, _ in out] == ["ETH", "BTC", "SOL", "XRP", "SUI", "AAVE", "QNT", "RAY"]


def test_core_coins_keep_discount_then_tier_order_among_themselves():
    targets = {"BTC:1": {"buy": 100}, "BTC:3": {"buy": 100}, "ETH:1": {"buy": 100}}
    prices = {"BTC": 95, "ETH": 90}
    out = order_pairs([("BTC", 1), ("BTC", 3), ("ETH", 1)], prices, targets)
    assert out == [("ETH", 1), ("BTC", 3), ("BTC", 1)]


def test_shit_list_coins_go_last_whatever_their_group_or_discount():
    from buy_order import order_pairs as op
    targets = {f"{c}:1": {"buy": 100} for c in ("BTC", "RAY", "AAVE")}
    prices = {"BTC": 70, "RAY": 98, "AAVE": 97}                  # BTC is the deepest AND core, but it is on the shit list
    out = op([(c, 1) for c in prices], prices, targets, {"BTC": 1, "AAVE": 30, "RAY": 300}, {"careful": ["BTC"]})
    assert [c for c, _ in out] == ["AAVE", "RAY", "BTC"]


def test_accumulate_coins_then_coins_held_little_then_deepest_inside_a_group():
    from buy_order import order_pairs as op
    targets = {f"{c}:1": {"buy": 100} for c in ("A", "B", "C", "D")}
    prices = {"A": 90, "B": 95, "C": 96, "D": 97}                # all Top 50 (rank 20)
    ranks = {c: 20 for c in prices}
    info = {"focus": ["D"], "buckets": {"A": 2, "B": 2, "C": 0, "D": 2}}      # D accumulate; C held little; A, B held a lot
    out = op([(c, 1) for c in prices], prices, targets, ranks, info)
    assert [c for c, _ in out] == ["D", "C", "A", "B"]


def test_holdings_buckets_and_the_plain_english_tags():
    from buy_order import underweight_buckets, explain
    b = underweight_buckets({"BTC": 1.0, "ETH": 0.001, "RAY": 1.0, "USDC": 500}, {"BTC": 100.0, "ETH": 100.0, "RAY": 1.0})
    assert b["BTC"] == 2 and b["ETH"] == 0 and b["RAY"] == 1          # of 101.1 total: ETH 0.1%, RAY about 1%, BTC about 99%
    assert explain("BTC", {"BTC": 1}, {"focus": ["BTC"], "buckets": {"BTC": 0}}) == ["Top 10", "accumulate", "holds little"]
    assert explain("RAY", {"RAY": 300}, {"careful": ["RAY"]}) == ["Shit list (Careful)"]

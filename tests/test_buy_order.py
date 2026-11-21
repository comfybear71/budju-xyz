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


def test_core_coins_go_first_then_major_then_the_rest_even_if_their_discount_is_smaller():
    from buy_order import priority
    assert (priority("BTC"), priority("eth"), priority("SOL"), priority("XRP"), priority("RAY")) == (0, 0, 0, 1, 2)
    targets = {f"{c}:1": {"buy": 100} for c in ("RAY", "XRP", "BTC", "ETH", "SOL", "WIF")}
    prices = {"RAY": 80, "WIF": 85, "XRP": 90, "BTC": 98, "ETH": 95, "SOL": 99}      # small coins are the deepest, core the shallowest
    out = order_pairs([(c, 1) for c in prices], prices, targets)
    assert [c for c, _ in out] == ["ETH", "BTC", "SOL", "XRP", "RAY", "WIF"]


def test_core_coins_keep_discount_then_tier_order_among_themselves():
    targets = {"BTC:1": {"buy": 100}, "BTC:3": {"buy": 100}, "ETH:1": {"buy": 100}}
    prices = {"BTC": 95, "ETH": 90}
    out = order_pairs([("BTC", 1), ("BTC", 3), ("ETH", 1)], prices, targets)
    assert out == [("ETH", 1), ("BTC", 3), ("BTC", 1)]

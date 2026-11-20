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

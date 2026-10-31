import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from starter_buys import clamp_amount, pick_coins, affordable  # noqa: E402


def test_clamp():
    assert clamp_amount(5) == 10 and clamp_amount(99) == 20 and clamp_amount("x") == 15


def test_pick_coins_skips_held_denied_unpriced():
    held = {"BTC": 0.001, "ETH": 0.0}
    prices = {"BTC": 100000.0, "ETH": 3000.0, "SOL": 150.0, "ENA": 1.0, "XYZ": 0.0}
    out = pick_coins(["BTC", "ETH", "SOL", "ENA", "XYZ", "USDC"], held, prices, {"ENA"}, set())
    assert out == ["ETH", "SOL"]      # BTC held ($100), ENA denied, XYZ no price


def test_affordable_keeps_buffer():
    assert affordable(["A", "B", "C", "D"], 100.0, 15.0) == ["A", "B", "C", "D"][:4]  # (100-30)//15 = 4
    assert affordable(["A", "B", "C"], 50.0, 15.0) == ["A"]
    assert affordable(["A"], 30.0, 15.0) == []

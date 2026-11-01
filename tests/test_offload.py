import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from offload import plan_wallet  # noqa: E402


def test_even_split_and_pct():
    hold = {"ADA": 1000.0, "DOT": 500.0, "BTC": 0.0, "GRASS": 0.0, "ZEC": 0.0}
    price = {"ADA": 0.2, "DOT": 1.0, "GRASS": 0.6, "ZEC": 100.0}
    r50 = plan_wallet(hold, price, {"ADA": 0.4}, ["ADA", "DOT"], ["GRASS", "ZEC"], 50)
    assert [s["coin"] for s in r50["sells"]] == ["ADA", "DOT"]
    assert r50["sellTotal"] == 350.0
    # ADA 500*0.2=100 ... DOT 250 -> total 350, 99% => 346.5, split across 2 coins
    assert len(r50["buys"]) == 2 and abs(r50["buys"][0]["buyUsd"] - 173.25) < 0.01
    assert r50["sells"][0]["pnlUsd"] == round((0.2 - 0.4) * 500, 2)      # ADA bought at 0.4


def test_75_is_bigger_than_50_and_same_ratio_per_wallet():
    big = {"ADA": 10000.0}; small = {"ADA": 1000.0}
    p = {"ADA": 0.2, "GRASS": 0.6}
    a = plan_wallet(big, p, {}, ["ADA"], ["GRASS"], 75)
    b = plan_wallet(small, p, {}, ["ADA"], ["GRASS"], 75)
    assert a["sellTotal"] == 1500.0 and b["sellTotal"] == 150.0      # exactly 10x: same ratio


def test_small_wallet_spreads_over_fewer_coins_and_tiny_sells_skipped():
    hold = {"ADA": 100.0, "XAUT": 0.001}
    p = {"ADA": 1.0, "XAUT": 3800.0, "A": 1.0, "B": 1.0, "C": 1.0, "D": 1.0}
    r = plan_wallet(hold, p, {}, ["ADA", "XAUT"], ["A", "B", "C", "D"], 50)
    assert [s["coin"] for s in r["skippedSells"]] == ["XAUT"]          # $1.90 < minimum sell
    assert r["sells"][0]["sellUsd"] == 50.0
    assert len(r["buys"]) == 4            # $49.50 over 4 coins is still >= $8 each
    assert all(b["buyUsd"] >= 8 for b in r["buys"])


def test_cap_trims_and_leaves_remainder_in_usdc():
    hold = {"ADA": 10000.0, "GRASS": 150.0}
    p = {"ADA": 0.2, "GRASS": 1.0}
    r = plan_wallet(hold, p, {}, ["ADA"], ["GRASS"], 50, cap_usd=200.0)
    assert r["buys"][0]["buyUsd"] == 50.0 and r["staysUsdc"] > 900

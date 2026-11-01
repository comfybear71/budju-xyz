import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from scorecard import coin_scorecard  # noqa: E402


def r(coin, side, qty, price, ts):
    return {"coin": coin, "side": side, "qty": qty, "price": price, "ts": ts}


def test_dip_buys_and_a_sale_beat_holding():
    # buys 1 at 100, then 1 at 80 (dip), sells 1 at 120; now 110. Held: 1 coin.
    rows = [r("AAA", "buy", 1, 100, "1"), r("AAA", "buy", 1, 80, "2"), r("AAA", "sell", 1, 120, "3")]
    s = coin_scorecard(rows, {"AAA": 110.0})
    c = s["coins"][0]
    assert c["spent"] == 180 and c["received"] == 120 and c["heldValue"] == 110
    assert c["botPnl"] == 50.0                       # 120 + 110 - 180
    assert c["holdPnl"] == 18.0 and c["edge"] == 32.0        # the same $180 put in at the first price (100) is worth 198 -> +18
    assert c["keepPnl"] == 40.0 and c["sellEffect"] == 10.0          # never selling: 2 coins x 110 - 180 = +40; the sale at 120 added +10
    assert "selling added" in s["totals"]["verdict"]


def test_bot_that_buys_the_top_loses_to_holding():
    rows = [r("ZZZ", "buy", 1, 100, "1"), r("ZZZ", "buy", 1, 150, "2")]     # added more as it rose
    s = coin_scorecard(rows, {"ZZZ": 200.0})
    assert s["coins"][0]["botPnl"] == 150.0 and s["coins"][0]["holdPnl"] == 250.0 and s["coins"][0]["edge"] == -100.0


def test_stablecoins_unpriced_and_oversold_rows_are_handled():
    rows = [r("USDC", "buy", 5, 1, "1"), r("BBB", "buy", 10, 2, "1"), r("BBB", "sell", 15, 3, "2"), r("CCC", "buy", 1, 1, "1")]
    s = coin_scorecard(rows, {"BBB": 2.5})
    assert [c["coin"] for c in s["coins"]] == ["BBB", "CCC"]
    assert s["totals"]["coins"] == 1                 # CCC has no price, so it isn't judged
    b = s["coins"][0]
    assert b["heldValue"] == 0 and b["received"] == 45     # can't sell more than was bought: held floors at 0


def test_empty():
    assert "Not enough" in coin_scorecard([], {})["totals"]["verdict"]

import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from hl_traders import pick_leaders, summarize_fills  # noqa: E402


def row(addr, acct, day, week, month, allt, roi=0.3):
    return {"ethAddress": addr, "accountValue": str(acct), "displayName": None, "windowPerformances": [
        ["day", {"pnl": str(day), "roi": "0.01", "vlm": "1"}], ["week", {"pnl": str(week), "roi": "0.05", "vlm": "1"}],
        ["month", {"pnl": str(month), "roi": str(roi), "vlm": "5000000"}], ["allTime", {"pnl": str(allt), "roi": "2", "vlm": "9"}]]}


def win(rows, name):
    for w in rows["windowPerformances"]:
        if w[0] == name:
            return w[1]
    return {}


def test_leaders_must_be_profitable_in_every_window_and_funded():
    rows = [row("0xGOOD", 200000, 1, 50, 900, 5000, 0.4), row("0xLOSSMONTH", 200000, 1, 50, -9, 5000), row("0xSMALL", 1000, 1, 5, 9, 50),
            row("0xBEST", 90000, 1, 20, 500, 800, 0.9)]
    out = pick_leaders(rows, win)
    assert [r["address"] for r in out] == ["0xBEST", "0xGOOD"] and out[0]["monthRoi"] == 90.0


def test_fill_summary_win_rate_and_streak():
    fills = [{"coin": "ZEC", "px": "100", "sz": "2", "closedPnl": "5", "time": 1}, {"coin": "ZEC", "px": "100", "sz": "2", "closedPnl": "-3", "time": 2},
             {"coin": "BTC", "px": "50", "sz": "1", "closedPnl": "2", "time": 3}, {"coin": "BTC", "px": "50", "sz": "1", "closedPnl": "1", "time": 4},
             {"coin": "BTC", "px": "50", "sz": "1", "closedPnl": "0", "time": 5}]
    s = summarize_fills(fills)
    assert s["closedTrades"] == 4 and s["winRate"] == 75.0 and s["winStreak"] == 2 and s["avgTradeUsd"] == 110.0 and s["coins"] == ["BTC", "ZEC"]

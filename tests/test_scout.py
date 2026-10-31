import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from scout import filter_candidates, review_tracked  # noqa: E402


def m(sym, id_, mcap=2e9, vol=1e8, price=5.0, name=None, ch=3.0):
    return {"symbol": sym, "id": id_, "name": name or sym, "market_cap": mcap, "total_volume": vol,
            "current_price": price, "price_change_percentage_24h": ch, "market_cap_rank": 20}


def test_filters():
    mk = [m("aave", "aave"), m("usdt", "tether", price=1.0, ch=0.0, name="Tether"),
          m("wsteth", "wsteth", name="Wrapped stETH"), m("sol", "solana"),
          m("tiny", "tiny", mcap=1e7), m("dry", "dry", vol=1e5), m("zzz", "zzz")]
    out = filter_candidates(mk, {"SOL"}, {"solana"}, {"AAVE", "SOL", "USDT"})
    assert [c["code"] for c in out] == ["AAVE"]


def test_review():
    coins = [
        {"coin": "ADA", "advice": "Careful — dips often don't come back", "perBuy": -7.0, "change1y": -68, "tiers": {"t1": {"open": 3}, "t2": {"open": 2}, "t3": {"open": 1}}},
        {"coin": "TRX", "advice": "Use T1+T2", "perBuy": 4.1, "change1y": 7, "buys": 8, "focus": True, "tiers": {}},
        {"coin": "ENA", "advice": "Careful", "denied": True, "perBuy": -1, "change1y": -1, "tiers": {}},
    ]
    r = review_tracked(coins)
    assert [c["coin"] for c in r["considerRemoving"]] == ["ADA"]
    assert [c["coin"] for c in r["keepStrong"]] == ["TRX"]


def test_daily_report_text():
    from scout import daily_report_text
    coins = [{"coin": "TAO", "perBuy": 5.0, "buys": 73, "focus": True}]
    review = {"considerRemoving": [{"coin": "ADA", "why": ""}]}
    t = daily_report_text(coins, review, [{"code": "AAVE", "name": "Aave", "perBuy": 3.2}])
    assert "TAO" in t and "ADA" in t and "AAVE" in t and "not financial advice" in t
def test_wallet_coin_suggestions():
    from scout import wallet_coin_suggestions
    per = [{"walletAddress": "a", "holdings": {"AAVE": 2.0, "BTC": 1.0, "USDC": 50, "DUST": 1}},
           {"walletAddress": "b", "holdings": {"AAVE": 3.0}}]
    out = wallet_coin_suggestions(per, {"BTC"}, {"AAVE": 100.0, "DUST": 0.5}, {"AAVE": 5e9})
    assert [r["code"] for r in out] == ["AAVE"]
    assert out[0]["wallets"] == 2 and out[0]["usdValue"] == 500.0 and out[0]["small"] is False
